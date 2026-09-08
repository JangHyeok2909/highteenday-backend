#!/usr/bin/env node
/**
 * fault-run — 장애 관측 실험 실행기.
 *
 *   node resilience/fault-run.js resilience/faults/redis-hang.json [옵션]      (performance/ 루트에서)
 *
 * 하는 일 (순서대로)
 *   1. 계획(JSON) 검증, 실행 잠금(perf-run 과 같은 잠금 — 관측 배관을 공유한다)
 *   2. 사전 점검: 앱 헬스, Prometheus, (계획이 요구하면) toxiproxy 와 앱의 프록시 경유 여부
 *   3. 옵션: 스냅샷 복원(--restore <id>), Redis FLUSHALL(--flush-redis)
 *   4. k6 실행 (resilience/scenarios/fault-window.js, open model, pre/fault/post 같은 도착률)
 *      + 드라이버가 계획 시각에 주입·복구 + 헬스 폴러
 *   5. 스크레이프 지연만큼 기다린 뒤 구간별로 인프라 지표 수집 (tools/collect.js 의 collectInfra)
 *      + 시간축 시계열 (Prometheus range)
 *   6. resilience/reports/<runId>/{run.json, k6.json, report.html}
 *
 * 하지 않는 일 (의도적)
 *   - 기준선 선택, 상대 비교, PASS/FAIL, exit code 게이트. 종료 코드는 도구가 망가졌을 때만 0 이 아니다.
 *   - performance/reports/index.json 에 쓰지 않는다. k6 요약도 resilience/reports/staging 에 떨어진다.
 *   이유: resilience/README.md.
 *
 * 옵션
 *   --note "<text>"     메모 (보고서 상단)
 *   --rate <n>          계획의 load.rate 를 덮어쓴다
 *   --pre/--fault/--post <sec>  구간 길이를 덮어쓴다 (smoke 용)
 *   --restore <id>      실행 전 tools/snapshot.js restore --id <id>
 *   --flush-redis       실행 전 perf-redis FLUSHALL (cold 시작을 명시할 때)
 *   --wait <sec>        k6 종료 뒤 스크레이프 대기 (기본 20)
 *   --dry-run           계획 검증·사전 점검·주입 일정만 출력하고 끝
 *   --no-remote-write   k6 시계열을 Prometheus 로 보내지 않는다 (시간축 그래프가 빈다)
 *
 * 환경변수
 *   K6_BIN            k6 실행 파일 (Chocolatey shim 이 막힐 때 실제 exe 경로)
 *   BASE_URL          앱 주소 (기본 http://localhost:18080)
 *   PROM_URL          Prometheus (기본 http://localhost:9090)
 *   TOXIPROXY_URL     toxiproxy API (기본 http://127.0.0.1:18474)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PERF_ROOT = path.resolve(__dirname, '..');
const RES_ROOT = __dirname;
const REPORTS = path.join(RES_ROOT, 'reports');
const STAGING = path.join(REPORTS, 'staging');

const { acquireRunLock } = require('../tools/lib/run-lock');
const { PromClient } = require('../tools/lib/promql');
const { collectInfra } = require('../tools/collect');
const grafana = require('../tools/lib/grafana');
const { APP_JOB } = require('../tools/lib/metrics-catalog');
const { request } = require('./lib/http');
const { Toxiproxy } = require('./lib/toxiproxy');
const dockerLib = require('./lib/docker');
const plans = require('./lib/plan');
const { Driver } = require('./lib/driver');
const { HealthPoller } = require('./lib/health');
const { renderReport } = require('./lib/report');

const K6_BIN = process.env.K6_BIN || 'k6';
const BASE_URL = process.env.BASE_URL || 'http://localhost:18080';
const PROM_URL = process.env.PROM_URL || 'http://localhost:9090';
const K6_RW_URL = process.env.K6_RW_URL_LOCAL || 'http://localhost:9090/api/v1/write';
const APP_CONTAINER = process.env.PERF_APP_CONTAINER || 'perf-app';
const REDIS_CONTAINER = process.env.PERF_REDIS_CONTAINER || 'perf-redis';

const FEATURES = ['auth', 'post', 'comment', 'board', 'reaction', 'scrap', 'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

function parseArgs(argv) {
  const o = { plan: null, note: '', rate: null, pre: null, fault: null, post: null, restore: null, flushRedis: false, wait: 20, dryRun: false, remoteWrite: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--note') o.note = argv[++i];
    else if (a === '--rate') o.rate = Number(argv[++i]);
    else if (a === '--pre') o.pre = Number(argv[++i]);
    else if (a === '--fault') o.fault = Number(argv[++i]);
    else if (a === '--post') o.post = Number(argv[++i]);
    else if (a === '--restore') o.restore = argv[++i];
    else if (a === '--flush-redis') o.flushRedis = true;
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-remote-write') o.remoteWrite = false;
    else if (a.startsWith('--')) throw new Error(`모르는 옵션: ${a}`);
    else if (!o.plan) o.plan = a;
    else throw new Error(`인자가 너무 많다: ${a}`);
  }
  if (!o.plan) throw new Error('사용법: node resilience/fault-run.js resilience/faults/<plan>.json [--note "..."] [--dry-run]');
  return o;
}

function loadPlan(file, o) {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (o.rate) plan.load = { ...plan.load, rate: o.rate };
  if (o.pre != null) plan.phases = { ...plan.phases, preSec: o.pre };
  if (o.fault != null) plan.phases = { ...plan.phases, faultSec: o.fault };
  if (o.post != null) plan.phases = { ...plan.phases, postSec: o.post };
  const errors = plans.validatePlan(plan);
  if (errors.length) throw new Error(`계획이 잘못됐다 (${file}):\n  - ${errors.join('\n  - ')}`);
  return plan;
}

function ts(d) { return d.toISOString().replace(/[:.]/g, '-').slice(0, 19); }

/** 앱이 toxiproxy 를 거치는가 — docker inspect 의 DB_URL/REDIS_HOST 로 확인. 추측하지 않는다. */
function proxyRouting() {
  const dbUrl = dockerLib.envOf(APP_CONTAINER, 'DB_URL');
  const redisHost = dockerLib.envOf(APP_CONTAINER, 'REDIS_HOST');
  return {
    dbUrl, redisHost,
    viaProxy: !!(dbUrl && /toxiproxy/.test(dbUrl)) && redisHost === 'toxiproxy',
  };
}

async function preflight(plan, o) {
  const notes = [];
  // 앱
  try {
    const h = await request('GET', `${BASE_URL}/actuator/health`, null, { timeoutMs: 5000 });
    notes.push(`앱 헬스: HTTP ${h.status} ${h.json && h.json.status ? h.json.status : ''}`);
    if (h.status >= 500 && !(h.json && h.json.status)) throw new Error('앱이 응답하지 않는다');
  } catch (e) {
    throw new Error(`앱(${BASE_URL}) 사전 점검 실패: ${e.message}`);
  }
  // Prometheus
  const prom = new PromClient({ baseUrl: PROM_URL });
  if (!(await prom.ping())) throw new Error(`Prometheus(${PROM_URL}) 에 닿지 않는다 — 시간축·인프라 지표를 못 모은다`);
  notes.push(`Prometheus: ${PROM_URL} ok`);
  // 프록시 경유 여부는 항상 기록한다. 요구하는 계획만 강제한다.
  const routing = proxyRouting();
  notes.push(`앱 경로: DB_URL=${routing.dbUrl || '?'} REDIS_HOST=${routing.redisHost || '?'} → ${routing.viaProxy ? 'toxiproxy 경유' : '직결'}`);
  const needsProxy = !!(plan.requires && plan.requires.proxy) || plan.inject.some((s) => s.tool === 'toxiproxy');
  if (needsProxy) {
    if (!routing.viaProxy) {
      throw new Error('이 계획은 toxiproxy 를 쓰는데 앱이 프록시를 거치지 않는다. toxic 을 걸어도 앱에 닿지 않는다.\n'
        + '  docker compose -f environment/docker-compose.perf.yml -f environment/docker-compose.fault.yml --env-file environment/.env.perf up -d');
    }
    const tox = new Toxiproxy();
    const required = [...new Set(plan.inject.filter((s) => s.tool === 'toxiproxy').map((s) => s.proxy))];
    const pf = await tox.preflight(required);
    if (pf.missing.length) throw new Error(`toxiproxy 에 프록시가 없다: ${pf.missing.join(', ')} (있는 것: ${pf.proxies.join(', ') || '없음'})`);
    if (pf.dirty.length) {
      notes.push(`toxiproxy 에 남은 toxic/disabled 가 있어 reset 한다: ${pf.dirty.join(', ')}`);
      await tox.reset();
    }
    notes.push(`toxiproxy: 프록시 ${pf.proxies.join(', ')} · 깨끗함`);
  }
  // docker 대상 컨테이너 존재 확인
  for (const c of [...new Set(plan.inject.filter((s) => s.tool === 'docker').map((s) => s.container))]) {
    const st = dockerLib.state(c);
    if (st === 'missing') throw new Error(`컨테이너가 없다: ${c}`);
    if (st !== 'running') notes.push(`⚠ ${c} 가 ${st} 상태에서 시작한다`);
  }
  // 환경 기록용
  const hikariMax = dockerLib.envOf(APP_CONTAINER, 'SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE');
  const image = dockerLib.docker(['inspect', '--format', '{{.Config.Image}} {{.Image}}', APP_CONTAINER], { allowFail: true }).stdout;
  return { notes, routing, prom, env: { viaProxy: routing.viaProxy, dbUrl: routing.dbUrl, redisHost: routing.redisHost, hikariMax: hikariMax ? Number(hikariMax) : null, appImage: image || null, k6Bin: K6_BIN, baseUrl: BASE_URL, restore: o.restore || null, flushRedis: o.flushRedis } };
}

function restoreSnapshot(id) {
  log(`  스냅샷 복원: ${id}`);
  const r = spawnSync(process.execPath, [path.join(PERF_ROOT, 'tools', 'snapshot.js'), 'restore', '--id', id], { stdio: 'inherit', cwd: PERF_ROOT });
  if (r.status !== 0) throw new Error(`스냅샷 복원 실패 (exit ${r.status})`);
}

function flushRedis() {
  log(`  Redis FLUSHALL (${REDIS_CONTAINER})`);
  dockerLib.docker(['exec', REDIS_CONTAINER, 'redis-cli', 'FLUSHALL']);
}

function k6Args(plan, driverUrl, runsDir) {
  const p = plan.phases;
  return [
    'run', path.join('resilience', 'scenarios', 'fault-window.js'),
    '-e', `FAULT_ID=${plan.id}`,
    '-e', `PRE=${p.preSec}`, '-e', `FAULT=${p.faultSec}`, '-e', `POST=${p.postSec}`,
    '-e', `RATE=${plan.load.rate}`,
    '-e', `PRE_VUS=${plan.load.preVus || 100}`, '-e', `MAX_VUS=${plan.load.maxVus || 1000}`,
    '-e', `DATASET=${process.env.DATASET || plan.dataset || 'medium'}`,
    '-e', `RUNS_DIR=${runsDir}`,
    '-e', `DRIVER_URL=${driverUrl}`,
    '-e', `BASE_URL=${BASE_URL}`,
    '--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)',
    '--no-color', '--quiet',
  ];
}

function newestStaged(id, since) {
  const files = fs.readdirSync(STAGING).filter((f) => f.startsWith(`fault-${id}-`) && f.endsWith('.k6.json'))
    .map((f) => ({ f, m: fs.statSync(path.join(STAGING, f)).mtimeMs })).filter((x) => x.m >= since - 5000)
    .sort((a, b) => b.m - a.m);
  return files.length ? path.join(STAGING, files[0].f) : null;
}

async function collectSeries(prom, t0, totalSec) {
  const from = new Date(t0.getTime() - 30000);
  const to = new Date(t0.getTime() + (totalSec + 30) * 1000);
  const step = 5;
  const q = {
    rps: 'sum(rate(k6_http_reqs_total[30s]))',
    errorPct: '100 * (sum(rate(k6_http_reqs_total{expected_response="false"}[30s])) or vector(0)) / clamp_min(sum(rate(k6_http_reqs_total[30s])), 0.0001)',
    p95: '1000 * histogram_quantile(0.95, sum(rate(k6_http_req_duration_seconds[30s])))',
    tomcatBusy: `sum(tomcat_threads_busy_threads{job="${APP_JOB}"})`,
    hikariPending: `sum(hikaricp_connections_pending{job="${APP_JOB}"})`,
    hikariActive: `sum(hikaricp_connections_active{job="${APP_JOB}"})`,
    mysqlThreadsRunning: 'max(mysql_global_status_threads_running)',
  };
  const out = {};
  const errors = [];
  for (const [k, query] of Object.entries(q)) {
    try { out[k] = await prom.range(query, from, to, step); } catch (e) { out[k] = []; errors.push(`${k}: ${e.message}`); }
  }
  return { series: out, errors };
}

function siblingsOf(planId, selfId) {
  if (!fs.existsSync(REPORTS)) return [];
  return fs.readdirSync(REPORTS).filter((d) => d !== selfId && d !== 'staging')
    .map((d) => { try { return JSON.parse(fs.readFileSync(path.join(REPORTS, d, 'run.json'), 'utf8')); } catch (_) { return null; } })
    .filter((r) => r && r.plan && r.plan.id === planId)
    .map((r) => ({ id: r.id, startedAt: r.startedAt, note: r.note }))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const planFile = path.resolve(process.cwd(), o.plan);
  const plan = loadPlan(planFile, o);
  const total = plans.totalSec(plan.phases);

  log(`▶ 장애 관측: ${plan.id} — ${plan.question}`);
  log(`  구간 pre ${plan.phases.preSec}s / fault ${plan.phases.faultSec}s / post ${plan.phases.postSec}s (총 ${total}s) · 도착률 ${plan.load.rate}/s`);
  const sched = plans.schedule(plan);
  for (const s of sched) log(`  주입 @${s.plannedAtSec}s  ${s.tool} ${s.action || ''} ${s.proxy || s.container || (s.args || s.argv || []).join(' ')}${s.toxic ? ` ${JSON.stringify(s.toxic)}` : ''}`);

  const lock = acquireRunLock();
  let driver = null;
  let health = null;
  let k6 = null;
  const finish = async (reason) => {
    if (health) health.stop();
    if (driver) await driver.cleanup(reason);
    lock.release();
  };
  process.on('SIGINT', async () => { log('\n중단 — 원상복구 중'); if (k6 && k6.exitCode == null) k6.kill(); await finish('SIGINT'); process.exit(130); });
  process.on('uncaughtException', async (e) => { console.error(e.stack || e.message); await finish('uncaughtException'); process.exit(2); });

  try {
    const pf = await preflight(plan, o);
    for (const nline of pf.notes) log(`  ${nline}`);
    if (o.dryRun) { log('dry-run — 여기까지'); await finish('dry-run'); return; }

    if (o.restore) restoreSnapshot(o.restore);
    if (o.flushRedis) flushRedis();

    fs.mkdirSync(STAGING, { recursive: true });
    driver = new Driver(plan, { log });
    const driverUrl = await driver.listen();
    health = new HealthPoller(`${BASE_URL}/actuator/health`, { intervalMs: 5000 });
    health.start();

    const env = { ...process.env };
    if (o.remoteWrite) {
      Object.assign(env, {
        K6_PROMETHEUS_RW_SERVER_URL: K6_RW_URL,
        K6_PROMETHEUS_RW_PUSH_INTERVAL: '5s',
        K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM: 'true',
        K6_PROMETHEUS_RW_STALE_MARKERS: 'true',
      });
    }
    const args = k6Args(plan, driverUrl, path.relative(PERF_ROOT, STAGING).replace(/\\/g, '/'));
    if (o.remoteWrite) args.push('-o', 'experimental-prometheus-rw');
    const spawnedAt = new Date();
    log(`  k6 시작: ${K6_BIN} ${args.join(' ')}`);
    k6 = spawn(K6_BIN, args, { stdio: 'inherit', env, cwd: PERF_ROOT });
    k6.on('error', (e) => { throw new Error(`k6 실행 실패: ${e.message} — K6_BIN 으로 실제 실행 파일 경로를 지정할 것`); });

    await driver.waitForStart(spawnedAt, 90000);
    health.setT0(driver.t0);
    driver.arm();

    const exitCode = await new Promise((resolve) => k6.on('exit', (code) => resolve(code)));
    const endedAt = new Date();
    log(`\n  k6 종료 (exit ${exitCode}) — 주입 정리`);
    await driver.cleanup('k6-exit');
    health.stop();

    const k6File = newestStaged(plan.id, spawnedAt.getTime());
    if (!k6File) throw new Error(`k6 요약 파일이 없다 (${STAGING}/fault-${plan.id}-*.k6.json) — k6 가 handleSummary 전에 죽었다`);
    const k6Rec = JSON.parse(fs.readFileSync(k6File, 'utf8'));

    log(`  스크레이프 대기 ${o.wait}s`);
    await sleep(o.wait * 1000);

    const windows = plans.phaseWindows(driver.t0, plan.phases);
    const infra = {};
    for (const [name, w] of Object.entries(windows)) {
      log(`  인프라 수집: ${name} (${w.from.toISOString()} ~ ${w.to.toISOString()})`);
      infra[name] = await collectInfra(pf.prom, w);
    }
    const { series, errors: seriesErrors } = await collectSeries(pf.prom, driver.t0, total);

    const raw = k6Rec.k6.rawMetrics || {};
    const runId = `${plan.id}-${ts(driver.t0)}`;
    const dir = path.join(REPORTS, runId);
    fs.mkdirSync(dir, { recursive: true });

    const tomcatMax = infra.pre && infra.pre.flat ? infra.pre.flat['pool.tomcatMax'] : null;
    const rec = {
      schemaVersion: 1,
      kind: 'fault-observation',
      id: runId,
      plan,
      planFile: path.relative(PERF_ROOT, planFile).replace(/\\/g, '/'),
      note: o.note,
      startedAt: spawnedAt.toISOString(),
      t0: driver.t0.toISOString(),
      t0Source: driver.t0Source,
      endedAt: endedAt.toISOString(),
      k6ExitCode: exitCode,
      env: { ...pf.env, tomcatMax, k6Timeout: '60s (k6 기본)', datasetGuard: 'n/a (관측 실행)' },
      k6: {
        phases: plans.relabelPhases(k6Rec.k6.phases),
        all: k6Rec.k6.all,
        breakdown: plans.relabelBreakdown(k6Rec.k6.breakdown),
        failedLatency: plans.failedLatencyByPhase(raw),
        featureByPhase: plans.featureByPhase(raw, FEATURES),
        droppedIterations: raw.dropped_iterations && raw.dropped_iterations.values ? raw.dropped_iterations.values.count : null,
        loadProfile: k6Rec.run && k6Rec.run.loadProfile,
        phasePlanRaw: k6Rec.run && k6Rec.run.phasePlan,
      },
      events: driver.events,
      health: health.samples,
      healthTransitions: health.transitions(),
      healthUrl: `${BASE_URL}/actuator/health`,
      infra,
      series,
      seriesErrors,
      grafana: (() => { try { return grafana.buildLinks({ startedAt: driver.t0.toISOString(), endedAt: endedAt.toISOString() }); } catch (_) { return null; } })(),
    };

    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(rec, null, 2));
    fs.renameSync(k6File, path.join(dir, 'k6.json'));
    const txt = k6File.replace(/\.k6\.json$/, '.summary.txt');
    if (fs.existsSync(txt)) fs.renameSync(txt, path.join(dir, 'k6.summary.txt'));
    fs.writeFileSync(path.join(dir, 'report.html'), renderReport(rec, { siblings: siblingsOf(plan.id, runId) }));

    // 콘솔 요약 — 판정 없이 구간 셋만
    log('\n구간별 요약');
    for (const p of plans.PHASE_ORDER) {
      const s = rec.k6.phases[p];
      if (!s) continue;
      log(`  ${p.padEnd(5)} 요청 ${String(s.httpReqs).padStart(6)}  p95 ${s.p95 == null ? '—' : `${Math.round(s.p95)}ms`.padStart(8)}  max ${s.max == null ? '—' : `${Math.round(s.max)}ms`.padStart(8)}  오류율 ${s.errorRate == null ? '—' : `${(s.errorRate * 100).toFixed(2)}%`}`);
    }
    const fl = rec.k6.failedLatency.fault;
    if (fl && fl.count) log(`  fault 실패 응답 ${fl.count}건: p50 ${Math.round(fl.med)}ms  p95 ${Math.round(fl.p95)}ms  max ${Math.round(fl.max)}ms`);
    const ht = rec.healthTransitions.map((h) => `${h.tSec == null ? '시작전' : `${h.tSec}s`}:${h.status}`).join(' → ');
    log(`  헬스 전이: ${ht || '없음'}`);
    log(`\n보고서: ${path.relative(process.cwd(), path.join(dir, 'report.html'))}`);
    await finish('done');
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    if (k6 && k6.exitCode == null) k6.kill();
    await finish('error');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(2); });
}

module.exports = { parseArgs, loadPlan, k6Args, proxyRouting };
