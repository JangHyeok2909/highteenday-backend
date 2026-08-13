#!/usr/bin/env node
/**
 * 반복 정밀도 측정 — 같은 조건을 N회 실행해 결과가 얼마나 흔들리는지 잰다.
 *
 * 왜 필요한가
 *   회귀 판정이 "p95가 20% 나빠지면 실패"라고 말하려면, 아무것도 바꾸지 않고
 *   같은 조건을 반복했을 때의 자연 편차가 20%보다 작아야 한다. 편차를 모르면
 *   임계값은 근거 없는 숫자다. 이 스크립트는 그 편차를 변동계수로 남긴다.
 *
 *     CV(변동계수) = 표준편차 / 평균
 *
 *   CV는 무차원이다. 그래서 절대 지연이 달라진 환경끼리도 비교할 수 있다.
 *   측정 환경 자체를 바꾼 전후를 비교하는 유일한 축이다 (experiments/EXP-000).
 *
 * 사용법
 *   node tools/repeatability.js scripts/posts.js --runs 10 --vus 20 --duration 90s \
 *     --dataset large --env perf-mi-before --reset restart
 *
 * 옵션
 *   --runs <n>      반복 횟수 (기본 10)
 *   --vus <n>       VU 수                  ┐
 *   --duration <d>  지속 시간               ├ perf-run.js 로 그대로 전달
 *   --dataset <s>   데이터셋 프로파일        │
 *   --env <name>    환경 이름               ┘  기존 이력과 섞이지 않게 전용 이름을 쓸 것
 *   --reset <mode>  restart | flush | none  (기본 restart)
 *   --wait <sec>    Prometheus 스크레이프 대기 (기본 20)
 *   --settle <sec>  리셋 후 안정화 대기 (기본 5)
 *   --note "<text>" 각 실행에 남길 메모
 *   --out <path>    결과 JSON 경로
 *
 * 주의
 *   리셋 모드는 편차의 구성 요소를 바꾼다. restart 는 매번 콜드 JVM에서 시작하므로
 *   JIT 워밍업 편차가 CV에 포함된다. 이건 문서화된 실제 실험 절차와 일치시킨
 *   의도적 선택이다. 전후 비교 시 반드시 같은 모드를 써야 한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const repo = require('./lib/repository');

const PERF_ROOT = repo.PERF_ROOT;
const APP_CT = 'perf-app';
const REDIS_CT = 'perf-redis';
const BASE = process.env.PERF_BASE_URL || 'http://localhost:18080';
const PROM = process.env.PERF_PROM_URL || 'http://localhost:9090';

// Node 18 미만에는 전역 fetch 가 없다 — health 폴링과 Prometheus 조회가 모두 막힌다.
if (typeof fetch !== 'function') {
  console.error(`이 스크립트는 Node 18+ 가 필요하다 (전역 fetch 사용). 현재: ${process.version}`);
  process.exit(2);
}

// ---------------------------------------------------------------- 인자 파싱

function parseArgs(argv) {
  const o = {
    script: null, runs: 10, vus: null, duration: null, dataset: null,
    env: null, reset: 'restart', wait: 20, settle: 5, note: '', out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') o.runs = Number(argv[++i]);
    else if (a === '--vus') o.vus = argv[++i];
    else if (a === '--duration') o.duration = argv[++i];
    else if (a === '--dataset') o.dataset = argv[++i];
    else if (a === '--env') o.env = argv[++i];
    else if (a === '--reset') o.reset = argv[++i];
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (a === '--settle') o.settle = Number(argv[++i]);
    else if (a === '--note') o.note = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (!a.startsWith('--') && !o.script) o.script = a;
    else {
      console.error(`알 수 없는 인자: ${a}`);
      process.exit(2);
    }
  }
  if (!o.script) {
    console.error('사용법: node tools/repeatability.js <스크립트> [--runs 10] [--vus 20] ...');
    process.exit(2);
  }
  if (!Number.isFinite(o.runs) || o.runs < 2) {
    console.error('--runs 는 2 이상이어야 한다 (편차를 재려면 최소 2회).');
    process.exit(2);
  }
  if (!['restart', 'flush', 'none'].includes(o.reset)) {
    console.error(`--reset 은 restart | flush | none 중 하나여야 한다 (받은 값: ${o.reset})`);
    process.exit(2);
  }
  return o;
}

// ------------------------------------------------------------------- 유틸

const sleep = (sec) => new Promise((r) => setTimeout(r, sec * 1000));

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

async function waitHealthy(timeoutSec = 180) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/actuator/health`);
      if (r.ok) return true;
    } catch { /* 아직 안 뜸 */ }
    await sleep(3);
  }
  return false;
}

/**
 * 리셋 — 반복 사이의 조건을 동일하게 만든다.
 * 이 절차가 흔들리면 CV 는 측정 대상이 아니라 리셋 편차를 재게 된다.
 */
async function reset(mode, settleSec) {
  if (mode === 'none') return true;
  if (mode === 'restart') {
    docker(['restart', APP_CT]);
    if (!await waitHealthy()) return false;
  }
  // flush 는 restart 에도 포함된다 — 캐시가 남으면 이전 반복의 웜 상태를 물려받는다.
  docker(['exec', REDIS_CT, 'redis-cli', 'FLUSHALL']);
  await sleep(settleSec);
  return true;
}

/** 서버가 스스로 잰 평균 처리시간(ms) — k6 왕복 시간과의 차이가 곧 경로 오버헤드다. */
async function serverMeanMs(startedAt, endedAt) {
  const durSec = Math.max(1, Math.round((new Date(endedAt) - new Date(startedAt)) / 1000));
  const at = Math.floor(new Date(endedAt).getTime() / 1000);
  const q =
    `1000 * sum(increase(http_server_requests_seconds_sum{job="spring-app"}[${durSec}s]))` +
    ` / clamp_min(sum(increase(http_server_requests_seconds_count{job="spring-app"}[${durSec}s])), 0.0001)`;
  const url = `${PROM}/api/v1/query?query=${encodeURIComponent(q)}&time=${at}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status !== 'success' || !j.data.result.length) return null;
  const v = Number(j.data.result[0].value[1]);
  return Number.isFinite(v) ? v : null;
}

// ------------------------------------------------------------------- 통계

/** 표본 표준편차(n-1). 모표준편차(n)를 쓰면 적은 표본에서 편차를 과소평가한다. */
function stats(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n < 2 ? 0 : Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return {
    n, mean, sd, median,
    cvPct: mean === 0 ? null : (sd / mean) * 100,
    min: sorted[0], max: sorted[n - 1],
  };
}

// ------------------------------------------------------------------ 실행

const METRICS = [
  { key: 'p95', label: 'P95', unit: 'ms' },
  { key: 'p99', label: 'P99', unit: 'ms' },
  { key: 'avg', label: '평균', unit: 'ms' },
  { key: 'tps', label: 'TPS', unit: '' },
  { key: 'rps', label: 'RPS', unit: '' },
  { key: 'serverMeanMs', label: '서버측 평균', unit: 'ms' },
  { key: 'pathOverheadMs', label: '경로 오버헤드', unit: 'ms' },
];

function runOnce(o, index) {
  const before = new Set(repo.listRunIds());

  const args = [path.join(__dirname, 'perf-run.js'), o.script, '--no-gate', '--wait', String(o.wait)];
  if (o.vus) args.push('--vus', o.vus);
  if (o.duration) args.push('--duration', o.duration);
  if (o.dataset) args.push('--dataset', o.dataset);
  if (o.env) args.push('--env', o.env);
  args.push('--note', `${o.note ? o.note + ' — ' : ''}repeatability ${index}/${o.runs}`);

  const res = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: PERF_ROOT, env: process.env });

  const newIds = repo.listRunIds().filter((id) => !before.has(id));
  return { exitCode: res.status, newIds };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));

  console.log('═'.repeat(74));
  console.log(`  반복 정밀도 측정 — ${o.script}`);
  console.log(`  반복 ${o.runs}회 · VU ${o.vus || '기본'} · ${o.duration || '기본'} · 데이터셋 ${o.dataset || '기본'}`);
  console.log(`  환경 ${o.env || 'perf'} · 리셋 ${o.reset} · 스크레이프 대기 ${o.wait}s`);
  console.log('═'.repeat(74));

  const results = [];

  for (let i = 1; i <= o.runs; i++) {
    console.log(`\n──────── [${i}/${o.runs}] 리셋 (${o.reset}) ────────`);
    const ok = await reset(o.reset, o.settle);
    if (!ok) {
      console.error(`  ✗ 앱이 health 응답을 안 한다 — 이 반복을 무효 처리한다.`);
      results.push({ index: i, ok: false, reason: 'health timeout' });
      continue;
    }

    const { exitCode, newIds } = runOnce(o, i);
    if (newIds.length !== 1) {
      console.error(`  ✗ 새 실행 기록이 ${newIds.length}개 — 무효 처리한다.`);
      results.push({ index: i, ok: false, reason: `run record count=${newIds.length}`, exitCode });
      continue;
    }

    const id = newIds[0];
    const rec = repo.loadRun(id);
    const k = rec.k6.all;
    const row = {
      index: i, ok: true, id, exitCode,
      startedAt: rec.run.startedAt, endedAt: rec.run.endedAt,
      p95: k.p95, p99: k.p99, avg: k.avg, tps: k.tps, rps: k.rps,
      errorRate: k.errorRate, iterations: k.iterations,
      cpuCoresMax: rec.infra?.flat?.['cpu.cores.max'] ?? null,
      throttledPct: rec.infra?.flat?.['cpu.throttledPct'] ?? null,
    };

    // 서버측 지연은 카탈로그에 없어 run 레코드에 안 들어간다 — 여기서 직접 조회한다.
    // 실패해도 반복 전체를 중단시키지 않는다(보조 지표).
    try {
      row.serverMeanMs = await serverMeanMs(rec.run.startedAt, rec.run.endedAt);
      row.pathOverheadMs = row.serverMeanMs == null ? null : row.avg - row.serverMeanMs;
    } catch (e) {
      console.warn(`  ⚠ 서버측 지연 조회 실패: ${e.message}`);
      row.serverMeanMs = null;
      row.pathOverheadMs = null;
    }

    // 오류율 1% 초과는 EXP-000 의 무효 조건이다. 기록은 남기되 통계에서 뺀다.
    if (row.errorRate > 0.01) {
      row.ok = false;
      row.reason = `errorRate ${(row.errorRate * 100).toFixed(2)}% > 1%`;
      console.error(`  ✗ ${row.reason} — 무효 처리한다.`);
    }

    results.push(row);
    console.log(`  [${i}/${o.runs}] p95 ${row.p95?.toFixed(1)}ms · 평균 ${row.avg?.toFixed(1)}ms` +
      (row.serverMeanMs != null ? ` · 서버측 ${row.serverMeanMs.toFixed(1)}ms · 경로 ${row.pathOverheadMs.toFixed(1)}ms` : ''));
  }

  // ---- 집계 ----------------------------------------------------------
  const valid = results.filter((r) => r.ok);
  const summary = {};
  for (const m of METRICS) summary[m.key] = stats(valid.map((r) => r[m.key]));

  console.log(`\n${'═'.repeat(74)}`);
  console.log(`  결과 — 유효 ${valid.length}/${o.runs}회`);
  console.log('═'.repeat(74));
  console.log('  지표          평균        표준편차      CV        최소        최대');
  console.log('  ' + '─'.repeat(70));
  const f = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
  for (const m of METRICS) {
    const s = summary[m.key];
    if (!s) continue;
    console.log(
      `  ${m.label.padEnd(12)}${f(s.mean).padStart(9)}${f(s.sd, 2).padStart(13)}` +
      `${(f(s.cvPct, 2) + '%').padStart(10)}${f(s.min).padStart(11)}${f(s.max).padStart(12)}`,
    );
  }
  console.log('  ' + '─'.repeat(70));
  if (summary.p95) {
    console.log(`\n  ▶ 판정 지표: P95 CV = ${f(summary.p95.cvPct, 2)}%` +
      `  (같은 조건 반복 시 p95가 평균 대비 이만큼 흔들린다)`);
  }

  // ---- 저장 ----------------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = o.out
    ? path.resolve(PERF_ROOT, o.out)
    : path.join(PERF_ROOT, 'reports', 'repeatability', `${o.env || 'perf'}-${stamp}.json`);
  repo.ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify({
    tool: 'repeatability',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    config: { ...o, base: BASE, prom: PROM },
    runs: results,
    summary,
  }, null, 2));
  console.log(`\n  저장: ${path.relative(PERF_ROOT, outFile)}`);
  console.log(`  원자료: reports/runs/ (환경 ${o.env || 'perf'})\n`);

  if (valid.length < o.runs) {
    console.warn(`  ⚠ 무효 ${o.runs - valid.length}회 — 사유는 저장된 JSON 의 runs[].reason 참조\n`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n실행 실패: ${e.stack || e.message}`);
    process.exit(2);
  });
}
