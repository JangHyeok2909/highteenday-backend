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
 *   --no-wait        대기 없이 즉시 조회 (과거 실행을 재처리할 때)
 *   --prom <url>     Prometheus 주소 (기본 http://localhost:9090)
 *   --no-gate        회귀가 있어도 exit 0 (관찰만)
 *
 * 종료 코드
 *   0  통과
 *   1  게이트 회귀      — 서버 성능이 나빠졌다. 대응 주체: 애플리케이션 개발자
 *   2  실행 오류        — 수집 도구가 예외로 죽었다. 대응 주체: 도구 담당
 *   3  측정 불가        — 필수 지표를 못 받아 판정이 성립하지 않는다(T-08).
 *                        대응 주체: 측정 인프라(Prometheus·익스포터·k6 실행) 담당
 */
'use strict';

const path = require('path');
const fs = require('fs');

const repo = require('./lib/repository');
const { PromClient } = require('./lib/promql');
const { GROUPS, computeDerived } = require('./lib/metrics-catalog');
const { analyze, bottleneckHints } = require('./lib/regression');
const cmp = require('./lib/comparability');
const hostprobe = require('./lib/hostprobe');
const saturation = require('./lib/saturation');
const grafana = require('./lib/grafana');
const { renderReport } = require('./lib/report');
const fmt = require('./lib/format');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { positional: [], wait: 15, force: false, all: false, gate: true, prom: undefined, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wait') out.wait = Number(argv[++i]);
    else if (a === '--no-wait') out.wait = 0;
    else if (a === '--force') out.force = true;
    else if (a === '--all') out.all = true;
    else if (a === '--no-gate') out.gate = false;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--prom') out.prom = argv[++i];
    else if (a.startsWith('--')) { /* 알 수 없는 플래그는 무시 */ }
    else out.positional.push(a);
  }
  // NaN 은 "값이 이상하다"가 아니라 조용히 대기 0초가 되어 버린다. 즉시 멈춘다.
  if (!Number.isFinite(out.wait)) {
    console.error('--wait 값이 숫자가 아닙니다.');
    process.exit(2);
  }
  return out;
}

/**
 * phasePlan으로부터 Prometheus 조회 구간을 계산한다(T-03/S-08).
 *
 * 예전에는 `--warmup`이 collect.js에서 독립적으로 시작 시각만 뒤로 밀었다 — k6 지표는
 * 그 값을 전혀 모르고 전체 구간으로 계산됐다. 이제는 k6가 기록한 phasePlan
 * (measureStartOffsetSec/measureSec)이 유일한 출처다. k6.phases.measure와 여기서
 * 계산한 창이 항상 같은 시간대를 가리킨다 — 다른 계산식이 아니라 같은 값을 읽을 뿐이다.
 *
 * to를 항상 endedAt으로 두지 않는다 — plan.measureSec만큼만 뒤로 가서 rampdown/
 * gracefulRampDown 구간을 인프라 창에서도 제외한다.
 *
 * phasePlan이 없거나(과거 run.json) gatePhase가 'measure'가 아니면(진단 시나리오)
 * measure 구간이라는 개념 자체가 없다 — 전체 구간으로 폴백하되 mode로 그 사실을 남긴다.
 * 조용히 "이것도 measure다"라고 우기지 않는다.
 */
function measureWindow(run) {
  const startedAt = new Date(run.startedAt);
  const endedAt = new Date(run.endedAt);
  const plan = run.phasePlan;

  if (!plan || plan.gatePhase !== 'measure') {
    return {
      from: startedAt,
      to: endedAt,
      durationSec: Math.max(1, (endedAt.getTime() - startedAt.getTime()) / 1000),
      mode: plan ? 'diagnostic-full-run' : 'legacy-no-phase-plan',
      incomplete: false,
    };
  }

  const plannedFrom = new Date(startedAt.getTime() + plan.measureStartOffsetSec * 1000);
  const plannedTo = new Date(plannedFrom.getTime() + plan.measureSec * 1000);

  // 조기 종료(패닉/타임아웃)로 warmup 도중 끝나면 measure 구간 자체가 존재하지 않는다.
  // 값을 억지로 만들지 않고 0 길이로 표시한다.
  if (plannedFrom.getTime() >= endedAt.getTime()) {
    return { from: plannedFrom, to: plannedFrom, durationSec: 0, mode: 'measure', incomplete: true };
  }

  // 조기 종료로 계획된 measure 종료 시각이 실제 실행 범위를 넘으면, "계획대로 다
  // 쟀다"고 하지 않고 실제 가용 구간으로 잘라내며 incomplete로 표시한다 — 잘못된
  // 정상 비교를 막는다.
  const incomplete = plannedTo.getTime() > endedAt.getTime();
  const to = incomplete ? endedAt : plannedTo;
  const durationSec = Math.max(1, (to.getTime() - plannedFrom.getTime()) / 1000);

  return { from: plannedFrom, to, durationSec, mode: 'measure', incomplete };
}

/**
 * 카탈로그 전체를 실행해 인프라 지표를 채운다.
 *
 * 부분 실패를 허용하는 이유: exporter 하나가 죽었다고 20분짜리 테스트 결과를 통째로
 * 버릴 이유가 없다. 실패한 항목만 null로 남기고 errors에 기록해 리포트에 표시한다.
 */
async function collectInfra(prom, window) {
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

  // 파생 지표(포화도)는 값과 함께 "이 값은 못 믿는다"는 사유를 돌려준다.
  // 버려진 값은 null 로 남고, 사유는 나머지 수집 실패와 같은 자리에 모인다.
  const derivedResult = computeDerived(flat);
  Object.assign(flat, derivedResult.derived);
  errors.push(...derivedResult.issues);

  return {
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      durationSec: window.durationSec,
      // 'measure' | 'diagnostic-full-run' | 'legacy-no-phase-plan' — 이 창이 실제로
      // phasePlan.measure 구간인지, 아니면 폴백인지를 리포트가 구분해 표시할 수 있게 한다.
      mode: window.mode,
      // true면 계획된 measure 구간을 다 채우지 못했다(조기 종료) — 정상 비교에 쓰면 안 된다.
      incomplete: window.incomplete,
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
  // 게이트가 실제로 보는 값(k6.phases.measure)을 우선 보여준다. 진단 시나리오나 과거
  // run.json처럼 measure 구간이 없으면 k6.all(전체 구간)로 폴백하고 그 사실을 밝힌다.
  const measure = record.k6.phases && record.k6.phases.measure;
  // `k6.all` 이 없는 옛 레코드가 있다 — phase 인식 집계 도입 전에는 전체 구간 통계가
  // `k6.overall` 에 있었다. 가드가 없어 저장된 73건 중 34건이 재생성에서 죽었다.
  const all = record.k6.all || record.k6.overall || {};
  const k = measure || all;
  const kLabel = measure ? 'measure 구간' : '전체 구간(측정 구간 미분리)';
  const f = record.infra.flat;
  const reg = record.regression;

  const icon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '·' };
  const line = (s = '') => console.log(s);

  line();
  line('═'.repeat(74));
  line(`  Performance Report — ${r.scenario}   Run #${r.number}   ${icon[reg.verdict] || ''} ${reg.verdict}`);
  line('═'.repeat(74));
  // 측정 상태는 판정 바로 아래에 둔다 — 판정을 읽기 전에 "이 판정을 믿어도 되는가"를
  // 먼저 알아야 한다(T-08). 정상(MEASURED)일 때는 줄을 늘리지 않는다.
  if (reg.measurementStatus === 'UNMEASURED') {
    line(`  ❌ 측정 불가 — 필수 지표 ${reg.missingRequired.length}건 결측. 아래 판정은 신뢰할 수 없습니다.`);
    for (const key of reg.missingRequired) line(`     · ${key}`);
  } else if (reg.measurementStatus === 'PARTIAL') {
    const why = [];
    if (reg.missingOptional.length) why.push(`참고 지표 ${reg.missingOptional.length}건 결측`);
    if (reg.windowIncomplete) why.push('측정 구간이 계획보다 짧게 끝남');
    line(`  ⚠  부분 측정 — ${why.join(', ')}. 판정 자체는 유효합니다.`);
  }
  // 포화 경고는 측정 상태 바로 아래다. 지표가 다 있어도 **그 값의 의미가 다를 수 있다**는
  // 것을 판정보다 먼저 알아야 한다 — 이 줄이 없어서 큐 대기를 애플리케이션 지연으로
  // 닷새간 읽었다(perf-session-drift.md 8-h).
  const satLine = saturation.banner(record.saturation);
  if (satLine) {
    line(`  ${satLine}`);
    for (const why of (record.saturation.reasons || []).slice(0, 3)) line(`     · ${why}`);
    if (record.saturation.baselineRegimeMismatch) {
      line(`     · ${record.saturation.baselineRegimeMismatch}`);
    }
  }
  line(`  환경 ${r.environment}  |  브랜치 ${r.branch}  |  커밋 ${r.commitShort}  |  빌드 ${r.buildNumber}`);
  line(`  시작 ${fmt.localTime(r.startedAt)}  |  수행 ${fmt.duration(r.durationSec)}  |  VU max ${fmt.num(all.vusMax, 0)}`);
  // 비교 가능성을 가르는 조건 — 기준선이 왜 선택/탈락됐는지 읽으려면 이게 보여야 한다.
  line(`  데이터셋 ${r.dataset}  |  부하 ${cmp.formatLoadProfile(r.loadProfile)}`);
  line();
  line(`  ── 성능 (${kLabel}) ─────────────────────────────────────────`.slice(0, 74));
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
    // 기준선이 당시 threshold 를 못 넘겼다면 증감률만 보고 안심하면 안 된다(S-10).
    // "당시 k6 threshold 미통과"라고만 쓴다 — thresholdsPassed 는 measure SLO 하나가 아니라
    // 전체 구간·시나리오별·abort threshold 까지 묶은 AND 값이라 SLO 실패로 단정할 수 없다.
    if (reg.baselineThresholdsPassed === false) {
      const nodeVerdict = reg.baselineVerdict ? `, 당시 Node 판정 ${reg.baselineVerdict}` : '';
      line(`  ⚠  기준선은 당시 k6 threshold 미통과 실행입니다${nodeVerdict}.`);
      line('     아래 증감률은 개선/악화 폭이며 현재 SLO 통과를 뜻하지 않습니다.');
    }
    // 조건이 다르면 아래 증감을 성능 변화로 읽으면 안 된다. 표보다 먼저 말해 준다.
    if (reg.comparability && reg.comparability.level === 'degraded') {
      for (const m of reg.comparability.mismatches) line(`  ⚠  ${m.desc}`);
      line('     아래 증감은 성능 변화가 아니라 다른 것을 잰 결과일 수 있다.');
      // 강등했는지, 아니면 절대 SLO 위반이 있어 게이트를 유지했는지를 반드시 말한다(T-32).
      // 아무 말도 안 하면 사람은 "조건이 다르니 어차피 통과겠지"로 읽는다.
      if (reg.downgradedFrom) {
        line(`     상대 비교만 실패해 판정을 ${reg.downgradedFrom}→WARN으로 낮췄다.`);
      } else if (reg.absoluteGateFailures && reg.absoluteGateFailures.length) {
        line(`     단, 기준선과 무관한 절대 SLO 위반 ${reg.absoluteGateFailures.length}건이 있어 게이트는 유지했다.`);
        for (const key of reg.absoluteGateFailures) line(`       · ${key}`);
      }
    }
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
    // "비교 안 함"과 "비교했는데 문제 없음"이 같은 문장으로 보이면 안 된다.
    // 상대 비교가 꺼진 상태라는 걸 먼저 말하고, 절대 게이트는 계속 돈다는 것도 밝힌다.
    if (reg.baselineStatus === 'first-run') {
      line('  비교 기준이 없습니다 (이 시나리오의 첫 실행). 다음 실행부터 비교됩니다.');
    } else {
      line('  ⚠  기준선으로 쓸 수 있는 과거 실행이 없어 상대 비교를 생략했습니다 (절대 게이트만 적용).');
      // 탈락 사유는 repo.describeRejection 이 만든다 — HTML 리포트와 같은 문장을 써야
      // 콘솔만 본 사람과 리포트만 본 사람이 다른 결론에 도달하지 않는다.
      for (const rej of (reg.rejectedBaselines || []).slice(0, 3)) {
        line(`     · ${rej.id} — ${repo.describeRejection(rej)}`);
      }
    }
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
  if (record.links && record.links.full && record.links.full.dashboard) {
    line(`  Grafana(전체 실행): ${record.links.full.dashboard}`);
  }
  if (record.links && record.links.measured && record.links.measured.dashboard) {
    line(`  Grafana(measure) : ${record.links.measured.dashboard}`);
  }
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

  // 데이터셋 상태 블록을 합친다. 비교 조건(conditions.js)이 run.stateBefore 를 읽으므로
  // saveRun 보다 먼저 합쳐야 한다. 재수집 시에는 이미 승격된 파일에서 다시 읽는다 —
  // 그러지 않으면 --all 재수집이 상태 축을 통째로 날린다.
  const dbstateFile = repo.loadDbState(runId);
  if (dbstateFile) Object.assign(record.run, dbstateFile);

  /*
   * 호스트 프로브를 **구간별로** 다시 요약한다 (T-37).
   *
   * 왜 여기서 하는가: 구간 경계는 `run.phasePlan` 에 있는데 그건 k6 요약에서 오므로
   * perf-run 시점에는 알 수 없다. 원시 표본만 사이드카로 남겨 두고 경계를 아는 여기서
   * 자른다 — k6·Prometheus 창 정렬(T-03/S-08)과 같은 원칙이다.
   *
   * 왜 필요한가: 예전에는 요약이 warmup+measure+rampdown 전체 평균이었는데 비교 대상인
   * p95 는 measure 구간만이었다. 서로 다른 창을 상관분석해 **잘못된 인과 결론을 냈다가
   * 철회했다**(perf-session-drift.md 8-e). 게다가 loadbench(2코어 40초)가 그 창 안에서
   * 돌아 설명 변수 자체를 오염시켰다. 구간을 나누면 loadbench 는 warmup 에 격리된다.
   *
   * **분석과 게이트는 `hostProbe.phases.measure` 만 써야 한다.**
   */
  const hpRaw = repo.loadHostProbeRaw(runId);
  if (hpRaw && record.run.hostProbe && record.run.hostProbe.available) {
    const plan = record.run.phasePlan;
    const t0 = record.run.k6StartedAt || record.run.startedAt;
    const sliced = hostprobe.sliceByPhase(hpRaw.rows, plan, t0);
    if (sliced) {
      const idx = hostprobe.resolveIndex(hpRaw.header, hpRaw.rows[0].v.length);
      record.run.hostProbe.phases = {};
      for (const name of ['warmup', 'measure', 'rampdown']) {
        const rows = sliced[name];
        record.run.hostProbe.phases[name] = rows.length
          ? { samples: rows.length, counters: hostprobe.summarize(rows, idx) }
          : { samples: 0 };
      }
    } else {
      record.run.hostProbe.phaseSliceSkipped = plan ? 'k6 시작 시각 없음' : 'phasePlan 없음';
    }
  }

  /*
   * 구간별 RPS 정규화 — 2026-08-13 ~ 2026-08-18 에 저장된 실행은 분모가 틀렸다(S-26).
   *
   * `phases.js` 가 k6 의 `rate` 를 그대로 썼는데, k6 는 카운터 rate 를 **전체 테스트
   * 시간**으로 나눈다. 그래서 measure 구간 요청 수를 전체 실행 시간으로 나눈 값이 저장됐다.
   *
   * 여기서 다시 계산하는 이유: `collect.js` 는 k6.json 을 복사만 하므로 재수집해도 옛 값이
   * 그대로 남는다. 그러면 **고친 뒤의 실행이 옛 실행을 기준선으로 잡을 때 rps 가 +37%
   * 좋아진 것처럼 보인다** — rps 는 게이트 대상이라(warn 10% / fail 20%) 가짜 회귀 판정이
   * 나온다. 원자료(k6.json)는 건드리지 않고 파생 레코드에서만 바로잡는다.
   *
   * 새 실행은 이미 옳은 값이라 이 계산이 같은 값을 낸다(멱등).
   */
  for (const [name, ph] of Object.entries(record.k6.phases || {})) {
    if (!ph || !(ph.durationSec > 0) || ph.httpReqs == null) continue;
    const correct = ph.httpReqs / ph.durationSec;
    if (ph.rps != null && Math.abs(ph.rps - correct) > 0.01) {
      if (!opts.quiet) {
        console.log(`  · ${name} 구간 RPS 보정: ${ph.rps.toFixed(2)} → ${correct.toFixed(2)}` +
          ` (요청 ${ph.httpReqs} / 구간 ${ph.durationSec}s) — S-26`);
      }
      ph.rps = correct;
    }
  }

  // 실행 번호는 최초 수집 때만 부여한다(재생성해도 번호가 안 바뀌어야 한다).
  const existing = repo.loadRun(runId);
  record.run.number = (existing && existing.run && existing.run.number) || repo.nextRunNumber();

  // ---- 지표 조회 구간 결정 -------------------------------------------
  // run.phasePlan(=k6가 결정한 계획)만으로 창을 계산한다 — CLI 재입력 없이 재수집해도
  // 항상 같은 창이 재현된다(완료 조건). measureWindow()가 rampdown 제외, 조기 종료
  // clamp, phasePlan 없는 과거 실행 폴백까지 전부 처리한다.
  const window = measureWindow(record.run);

  const prom = new PromClient({ baseUrl: opts.prom, debug: !opts.quiet });
  const alive = await prom.ping();
  if (!alive && !opts.quiet) {
    console.warn(`  ⚠ Prometheus(${prom.baseUrl}) 응답 없음 — 인프라 지표를 건너뜁니다.`);
  }

  record.infra = alive
    ? await collectInfra(prom, window)
    : {
        window: { from: window.from.toISOString(), to: window.to.toISOString(), durationSec: window.durationSec, mode: window.mode, incomplete: window.incomplete },
        groups: [], flat: {}, errors: [{ key: '*', error: 'Prometheus 미응답' }], available: false,
      };

  // ---- 회귀 분석 --------------------------------------------------------
  // 기준선은 "직전 실행"이 아니라 "비교 가능한 가장 최근 실행"이다. 탈락 사유도 함께
  // 받아 리포트에 싣는다 — 비교하지 않았다면 왜 안 했는지 말할 수 있어야 한다.
  const search = repo.findBaseline(record);
  const prevRun = search.baseline ? repo.loadRun(search.baseline.id) : null;
  // hadPriorCandidates 를 함께 넘긴다 — 후보가 전부 탈락한 실행을 "첫 실행"으로 보고하지
  // 않기 위해서다(S-10). rejected 는 최근 몇 건만 담기므로 그 길이로는 판단할 수 없다.
  record.regression = analyze(record, prevRun, {
    rejected: search.rejected,
    hadPriorCandidates: search.hadPriorCandidates,
  });
  record.bottleneckHints = bottleneckHints(record);

  /*
   * 포화 판정 — measurementStatus 와 별개의 축이다(saturation.js 머리말).
   *
   * 지표가 멀쩡히 다 있어도 **그 값의 의미가 달라지는** 경우가 있다. 포화 상태의 p95 는
   * 애플리케이션 지연이 아니라 큐 대기이고, 그걸 표시하지 않아 닷새를 날렸다.
   * 게이트를 실패시키지는 않는다 — stress 계열은 포화가 목적이기 때문이다.
   */
  record.saturation = saturation.assess(record);
  const prevSat = prevRun && prevRun.saturation;
  const mismatch = saturation.regimeMismatch(record.saturation, prevSat);
  if (mismatch) record.saturation.baselineRegimeMismatch = mismatch;

  // ---- 링크 -------------------------------------------------------------
  // 전체 실행 링크와 measure 구간 링크의 의미가 섞이면 안 된다(S-08) — 별도로 만든다.
  // measure 구간이 없는 실행(진단 시나리오·과거 run.json)은 measured가 null이 되어
  // report.js가 "전체 실행 링크만 있다"고 구분해서 보여줄 수 있다.
  record.links = {
    full: grafana.buildLinks({
      startedAt: record.run.startedAt,
      endedAt: record.run.endedAt,
    }),
    measured: window.mode === 'measure'
      ? grafana.buildLinks({ startedAt: window.from.toISOString(), endedAt: window.to.toISOString() })
      : null,
  };

  // ---- 저장 -------------------------------------------------------------
  repo.saveRun(record);

  const trend = repo.recentRuns({
    scenario: record.run.scenario,
    environment: record.run.environment,
    seriesHash: record.regression.seriesHash,
    limit: 20,
  });
  const html = renderReport(record, { previous: prevRun, trend });
  fs.writeFileSync(repo.reportFile(runId), html);

  // 스테이징 승격은 산출물이 전부 안착한 뒤 마지막에 — 위 어느 단계가 실패해도
  // 스테이징 원본이 남아 있어야 재시도할 수 있다.
  repo.promoteStaged(runId);

  return record;
}

/** 여러 실행 중 "가장 최근 것" — 파일 mtime 기준. id 문자열 정렬은 시나리오명이 지배해 틀린다. */
function newestByMtime(ids) {
  let best = null;
  let bestT = -1;
  for (const id of ids) {
    for (const f of [repo.stagedK6File(id), repo.k6File(id)]) {
      if (fs.existsSync(f)) {
        const t = fs.statSync(f).mtimeMs;
        if (t > bestT) { bestT = t; best = id; }
        break;
      }
    }
  }
  return best;
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
    const pick = opts.force ? newestByMtime(ids) : newestByMtime(pending);
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
  let unmeasured = false;
  let errored = 0;
  for (const runId of targets) {
    try {
      const rec = await processRun(runId, opts);
      if (!opts.quiet) printConsole(rec);
      else console.log(`${runId}: ${rec.regression.verdict} (${rec.regression.measurementStatus})`);
      if (rec.regression.gateFailed) gateFailed = true;
      if (rec.regression.measurementStatus === 'UNMEASURED') unmeasured = true;
    } catch (e) {
      console.error(`✗ ${runId} 실패: ${e.message}`);
      errored++;
    }
  }

  // 수집 실패는 대상이 1건이든 --all 이든 실패다 — 전부 실패하고 exit 0 이면 CI가 속는다.
  if (errored > 0) {
    console.error(`수집 실패 ${errored}건 / ${targets.length}건`);
    process.exit(2);
  }
  // 두 사실은 항상 같이 알린다. 종료 코드는 하나뿐이라 하나를 골라야 하지만, 로그에서까지
  // 지워지면 다른 하나를 영영 모르게 된다.
  if (gateFailed) console.error('게이트 회귀 감지 — 기준을 넘은 지표가 있습니다.');
  if (unmeasured) console.error('필수 지표 결측 — 이 실행의 판정은 신뢰할 수 없습니다.');

  if (!opts.gate) process.exit(0);

  // 측정 불가를 게이트 회귀보다 먼저 본다. 게이트 회귀는 "가진 데이터로 확인된 사실"이라
  // 측정만 고치면 다음 실행에서 다시 잡히지만, 측정 파이프라인이 깨진 상태는 그냥 두면
  // 이후 모든 실행의 판정이 계속 무의미해진다. 재발견 가능한 신호보다 계통적 고장을
  // 먼저 알리는 쪽이 손해가 작다.
  if (unmeasured) process.exit(3);
  if (gateFailed) process.exit(1);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(2);
  });
}

// printConsole 은 콘솔 리포트와 HTML 리포트가 같은 사실을 말하는지 검증하기 위해 노출한다.
module.exports = { processRun, collectInfra, measureWindow, printConsole };
