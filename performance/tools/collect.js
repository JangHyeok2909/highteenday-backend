#!/usr/bin/env node
/**
 * Metric Collector — 파이프라인 2단계.
 *
 * k6가 남긴 원본(k6.json)을 읽어 같은 시간 구간의 운영 지표를 Prometheus에서 조회하고,
 * 직전 실행과 비교해 회귀를 판정한 뒤, 최종 레코드(run.json)와 HTML 보고서를 만든다.
 *
 * 사용법
 *   node tools/collect.js                       최신 미처리 실행을 수집
 *   node tools/collect.js <runId>               특정 실행을 수집
 *   node tools/collect.js --all                 아직 run.json이 없는 실행 전부 처리
 *   node tools/collect.js <runId> --force       이미 처리된 것도 다시 처리(리포트 재생성)
 *
 * 주요 옵션
 *   --wait <sec>     스크레이프 지연 대기 (기본 15초 = 5초 간격 × 3회)
 *   --warmup <sec>   구간 앞부분을 지표 집계에서 제외 (ramp-up/JIT 워밍업 배제)
 *   --no-wait        대기 없이 즉시 조회 (과거 실행을 재처리할 때)
 *   --prom <url>     Prometheus 주소 (기본 http://localhost:9090)
 *   --no-gate        회귀가 있어도 exit 0 (관찰만)
 *
 * 종료 코드: 0 통과 / 1 게이트 회귀 / 2 실행 오류
 */
'use strict';

const path = require('path');
const fs = require('fs');

const repo = require('./lib/repository');
const { PromClient } = require('./lib/promql');
const { GROUPS, computeDerived } = require('./lib/metrics-catalog');
const { analyze, bottleneckHints } = require('./lib/regression');
const grafana = require('./lib/grafana');
const { renderReport } = require('./lib/report');
const fmt = require('./lib/format');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { positional: [], wait: 15, warmup: 0, force: false, all: false, gate: true, prom: undefined, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wait') out.wait = Number(argv[++i]);
    else if (a === '--no-wait') out.wait = 0;
    else if (a === '--warmup') out.warmup = Number(argv[++i]);
    else if (a === '--force') out.force = true;
    else if (a === '--all') out.all = true;
    else if (a === '--no-gate') out.gate = false;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--prom') out.prom = argv[++i];
    else if (a.startsWith('--')) { /* 알 수 없는 플래그는 무시 */ }
    else out.positional.push(a);
  }
  return out;
}

/**
 * 카탈로그 전체를 실행해 인프라 지표를 채운다.
 *
 * 부분 실패를 허용하는 이유: exporter 하나가 죽었다고 20분짜리 테스트 결과를 통째로
 * 버릴 이유가 없다. 실패한 항목만 null로 남기고 errors에 기록해 리포트에 표시한다.
 */
async function collectInfra(prom, window, opts = {}) {
  const flat = {};
  const groups = [];
  const errors = [];

  for (const g of GROUPS) {
    const metrics = [];
    for (const spec of g.metrics) {
      let value = null;
      try {
        value = await prom.evalSpec(spec, window);
      } catch (e) {
        errors.push({ key: spec.key, error: e.message.slice(0, 200) });
      }
      flat[spec.key] = value;
      metrics.push({
        key: spec.key,
        label: spec.label,
        value,
        unit: spec.unit || null,
        desc: spec.desc || null,
      });
    }
    groups.push({ id: g.id, label: g.label, metrics });
  }

  Object.assign(flat, computeDerived(flat));

  return {
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      durationSec: window.durationSec,
      warmupExcludedSec: opts.warmup || 0,
    },
    prometheusUrl: prom.baseUrl,
    queryStats: prom.stats,
    groups,
    flat,
    errors,
    available: Object.values(flat).some((v) => v != null),
  };
}

/** 콘솔 요약 — CI 로그에서 이것만 봐도 상황이 판단되어야 한다. */
function printConsole(record) {
  const r = record.run;
  const k = record.k6.overall;
  const f = record.infra.flat;
  const reg = record.regression;

  const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '·' };
  const line = (s = '') => console.log(s);

  line();
  line('═'.repeat(74));
  line(`  Performance Report — ${r.scenario}   Run #${r.number}   ${icon[reg.verdict] || ''} ${reg.verdict}`);
  line('═'.repeat(74));
  line(`  환경 ${r.environment}  |  브랜치 ${r.branch}  |  커밋 ${r.commitShort}  |  빌드 ${r.buildNumber}`);
  line(`  시작 ${fmt.localTime(r.startedAt)}  |  수행 ${fmt.duration(r.durationSec)}  |  VU max ${k.vusMax}`);
  line();
  line('  ── 성능 ──────────────────────────────────────────────────────────');
  line(`  평균 ${fmt.ms(k.avg).padEnd(9)} P95 ${fmt.ms(k.p95).padEnd(9)} P99 ${fmt.ms(k.p99).padEnd(9)}`);
  line(`  RPS  ${fmt.num(k.rps, 1).padEnd(9)} TPS ${fmt.num(k.tps, 2).padEnd(9)} 오류율 ${fmt.pct(k.errorRate * 100, 2)}`);

  if (record.infra.available) {
    line();
    line('  ── 인프라 ────────────────────────────────────────────────────────');
    line(`  CPU  ${fmt.num(f['cpu.cores.max'], 2)} core (한계의 ${fmt.pct(f['saturation.cpuPct'], 0)})   throttled ${fmt.pct(f['cpu.throttledPct'], 1)}`);
    line(`  Heap ${fmt.bytes(f['heap.used.max'])} (${fmt.pct(f['saturation.heapPct'], 0)})   GC max ${fmt.ms(f['gc.pauseMaxMs'])} × ${fmt.num(f['gc.count'], 0)}회`);
    line(`  DB   slow ${fmt.num(f['mysql.slowQueries'], 0)}  QPS ${fmt.num(f['mysql.qps'], 1)}  풀 ${fmt.pct(f['saturation.hikariPct'], 0)}  대기 ${fmt.num(f['pool.hikariPending.max'], 0)}`);
    line(`  Redis hit ${fmt.pct(f['redis.hitRatioPct'], 1)}  ops ${fmt.num(f['redis.opsPerSec'], 1)}/s  evicted ${fmt.num(f['redis.evictedKeys'], 0)}`);
  } else {
    line();
    line('  ⚠ 인프라 지표를 가져오지 못했습니다 (Prometheus 미기동?)');
  }

  const changed = reg.comparisons.filter((c) => c.verdict === 'FAIL' || c.verdict === 'WARN');
  if (reg.hasBaseline) {
    line();
    line(`  ── 회귀 (기준: ${reg.baselineRunId}) ────────────────`.slice(0, 74));
    if (changed.length === 0) {
      line('  변화 없음 — 모든 지표가 허용 범위 내');
    } else {
      for (const c of changed) {
        const arrow = c.deltaPct == null ? '' : `${fmt.byUnit(c.baseline, c.unit)} → ${fmt.byUnit(c.current, c.unit)} (${fmt.delta(c.deltaPct)})`;
        line(`  ${icon[c.verdict]} ${c.label.padEnd(26)} ${arrow}`);
        for (const rs of c.reasons) line(`       ${rs.desc}`);
      }
    }
  } else {
    line();
    line('  ── 회귀 ──────────────────────────────────────────────────────────');
    line('  비교 기준이 없습니다 (이 시나리오의 첫 실행). 다음 실행부터 비교됩니다.');
  }

  if (record.bottleneckHints && record.bottleneckHints.length) {
    line();
    line('  ── 병목 가설 ─────────────────────────────────────────────────────');
    for (const h of record.bottleneckHints.slice(0, 4)) {
      line(`  • ${h.title}`);
      line(`    ${h.detail}`);
    }
  }

  line();
  line(`  보고서 : ${path.relative(repo.PERF_ROOT, repo.reportFile(r.id))}`);
  if (record.links && record.links.grafana) line(`  Grafana: ${record.links.grafana}`);
  line('═'.repeat(74));
  line();
}

async function processRun(runId, opts) {
  const k6rec = repo.loadK6(runId);
  if (!k6rec) throw new Error(`k6.json 없음: ${runId}`);

  const record = JSON.parse(JSON.stringify(k6rec));
  record.phase = 'collected';
  record.run.id = runId;
  record.collectedAt = new Date().toISOString();

  // 실행 번호는 최초 수집 때만 부여한다(재생성해도 번호가 안 바뀌어야 한다).
  const existing = repo.loadRun(runId);
  record.run.number = (existing && existing.run && existing.run.number) || repo.nextRunNumber();

  // ---- 지표 조회 구간 결정 -------------------------------------------
  // warmup 만큼 앞을 잘라내면 ramp-up 구간의 JIT 워밍업/캐시 콜드스타트가 통계에서 빠진다.
  // "정상 상태(steady state)의 자원 사용량"을 보려면 이게 맞다.
  const startedAt = new Date(record.run.startedAt);
  const endedAt = new Date(record.run.endedAt);
  const from = new Date(startedAt.getTime() + (opts.warmup || 0) * 1000);
  const durationSec = Math.max(1, (endedAt.getTime() - from.getTime()) / 1000);
  const window = { from, to: endedAt, durationSec };

  const prom = new PromClient({ baseUrl: opts.prom, debug: !opts.quiet });
  const alive = await prom.ping();
  if (!alive && !opts.quiet) {
    console.warn(`  ⚠ Prometheus(${prom.baseUrl}) 응답 없음 — 인프라 지표를 건너뜁니다.`);
  }

  record.infra = alive
    ? await collectInfra(prom, window, { warmup: opts.warmup })
    : { window: { from: from.toISOString(), to: endedAt.toISOString(), durationSec }, groups: [], flat: {}, errors: [{ key: '*', error: 'Prometheus 미응답' }], available: false };

  // ---- 회귀 분석 --------------------------------------------------------
  const prevEntry = repo.findPrevious(record);
  const prevRun = prevEntry ? repo.loadRun(prevEntry.id) : null;
  record.regression = analyze(record, prevRun);
  record.bottleneckHints = bottleneckHints(record);

  // ---- 링크 -------------------------------------------------------------
  record.links = grafana.buildLinks({
    startedAt: record.run.startedAt,
    endedAt: record.run.endedAt,
  });

  // ---- 저장 -------------------------------------------------------------
  // 스테이징 승격을 먼저 한다: 디렉터리를 만들고 원본을 옮겨야 리포트를 그 안에 쓸 수 있다.
  repo.promoteStaged(runId);
  repo.saveRun(record);

  const trend = repo.recentRuns(record.run.scenario, 20, record.run.environment);
  const html = renderReport(record, { previous: prevRun, trend });
  fs.writeFileSync(repo.reportFile(runId), html);

  return record;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let targets = opts.positional;
  if (opts.all) {
    targets = opts.force ? repo.listRunIds() : repo.listPendingRunIds();
  } else if (targets.length === 0) {
    // 인자가 없으면 "가장 최근에 k6가 남긴, 아직 수집 안 된 실행"을 고른다.
    const ids = repo.listRunIds();
    const pending = repo.listPendingRunIds();
    const pick = opts.force ? ids[ids.length - 1] : pending[pending.length - 1];
    if (!pick) {
      console.error('수집할 실행이 없습니다. (reports/runs/ 가 비었거나 이미 전부 처리됨 — --force 로 재처리)');
      process.exit(2);
    }
    targets = [pick];
  }

  if (targets.length === 0) {
    console.log('처리할 새 실행이 없습니다.');
    process.exit(0);
  }

  // 스크레이프 지연 대기 — 테스트 종료 직후 구간이 Prometheus에 들어올 시간을 준다.
  if (opts.wait > 0) {
    console.log(`Prometheus 스크레이프 대기 ${opts.wait}초...`);
    await sleep(opts.wait * 1000);
  }

  let gateFailed = false;
  for (const runId of targets) {
    try {
      const rec = await processRun(runId, opts);
      if (!opts.quiet) printConsole(rec);
      else console.log(`${runId}: ${rec.regression.verdict}`);
      if (rec.regression.gateFailed) gateFailed = true;
    } catch (e) {
      console.error(`✗ ${runId} 실패: ${e.message}`);
      if (targets.length === 1) process.exit(2);
    }
  }

  if (gateFailed && opts.gate) {
    console.error('게이트 회귀 감지 — 실패로 종료합니다.');
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(2);
  });
}

module.exports = { processRun, collectInfra };
