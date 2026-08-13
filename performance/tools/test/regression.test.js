'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  pick, evaluateRule, analyze, validateRules, validateRequirements,
  loadRules, loadRuleSet, isRequired, bottleneckHints,
} = require('../lib/regression');

// ---------------------------------------------------------------------------
// pick — T-01 회귀 테스트. infra.flat 은 키에 점이 든 평면 맵이다.
// 이 테스트가 있었다면 infra 규칙 25개가 한 번도 평가되지 않는 버그는 첫날 잡혔다.
// ---------------------------------------------------------------------------
test('pick: 중첩 경로(k6.phases.measure.p95)를 꺼낸다', () => {
  const rec = { k6: { phases: { measure: { p95: 123 } } } };
  assert.equal(pick(rec, 'k6.phases.measure.p95'), 123);
});

test('pick: 평면 맵의 점 포함 키(infra.flat["saturation.cpuPct"])를 꺼낸다', () => {
  const rec = { infra: { flat: { 'saturation.cpuPct': 70.5, 'pool.hikariPending.max': 205 } } };
  assert.equal(pick(rec, 'infra.flat.saturation.cpuPct'), 70.5);
  assert.equal(pick(rec, 'infra.flat.pool.hikariPending.max'), 205);
});

test('pick: 없는 경로는 undefined', () => {
  assert.equal(pick({ a: { b: 1 } }, 'a.c'), undefined);
  assert.equal(pick({}, 'infra.flat.saturation.cpuPct'), undefined);
  assert.equal(pick(null, 'a.b'), undefined);
});

test('pick: 값이 null 인 평면 키는 undefined 로 정규화된다', () => {
  const rec = { infra: { flat: { 'cpu.throttledPct': null } } };
  assert.equal(pick(rec, 'infra.flat.cpu.throttledPct'), null); // own property 는 그대로 반환
});

// ---------------------------------------------------------------------------
// evaluateRule
// ---------------------------------------------------------------------------
test('evaluateRule: 현재 값이 없으면 SKIP', () => {
  const out = evaluateRule({ key: 'x', direction: 'lower_is_better' }, null, 10);
  assert.equal(out.verdict, 'SKIP');
  assert.ok(out.skipped);
});

test('evaluateRule: 절대 게이트 초과는 기준선 없이도 FAIL', () => {
  const rule = { key: 'x', direction: 'lower_is_better', absolute: { fail: { gt: 10 } } };
  assert.equal(evaluateRule(rule, 50, null).verdict, 'FAIL');
  assert.equal(evaluateRule(rule, 5, null).verdict, 'PASS');
});

test('evaluateRule: 노이즈 하한 미만 변화는 억제(PASS + skipped 사유)', () => {
  const rule = { key: 'x', direction: 'lower_is_better', fail: { changePct: 20 }, noiseFloor: 5 };
  const out = evaluateRule(rule, 12, 10); // +20% 지만 절대 변화 2 < 5
  assert.equal(out.verdict, 'PASS');
  assert.ok(out.skipped);
});

test('evaluateRule: higher_is_better 는 하락이 악화다', () => {
  const rule = { key: 'tps', direction: 'higher_is_better', fail: { changePct: 20 }, noiseFloor: 0 };
  assert.equal(evaluateRule(rule, 7, 10).verdict, 'FAIL');  // -30%
  assert.equal(evaluateRule(rule, 13, 10).verdict, 'PASS'); // +30% 개선
});

// ---------------------------------------------------------------------------
// analyze — 규칙 파일을 실제로 읽는 경로 전체를 검증
// ---------------------------------------------------------------------------
const PLAN_STEADY = {
  schemaVersion: 1, mode: 'steady-state', warmupSec: 300, measureSec: 1200, rampdownSec: 120,
  measureStartOffsetSec: 300, measureEndOffsetSec: 1500, gatePhase: 'measure',
};

/** 비교 가능한 실행 조건 — 기준선 비교가 성립하려면 양쪽에 있어야 한다. */
function conds(over = {}) {
  return {
    scenario: 'normal-day',
    environment: 'perf',
    dataset: 'large',
    loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 200 }] } },
    scriptVersion: 'abc123',
    phasePlan: PLAN_STEADY,
    ...over,
  };
}

function tmpRules(rules) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-rules-')), 'rules.json');
  fs.writeFileSync(file, JSON.stringify({ rules }));
  return file;
}

test('analyze: infra.flat 게이트 규칙이 실제로 평가된다 (T-01 회귀 테스트)', () => {
  const rulesFile = tmpRules([
    {
      key: 'infra.flat.cpu.throttledPct',
      direction: 'lower_is_better',
      absolute: { fail: { gt: 10 } },
      gate: true,
    },
  ]);
  const record = {
    run: { ...conds(), scriptVersion: 'sha256:aaa' },
    infra: { flat: { 'cpu.throttledPct': 99.98 } },
  };
  const res = analyze(record, null, { rulesFile });
  const c = res.comparisons[0];
  assert.equal(c.verdict, 'FAIL', 'infra 평면 키가 SKIP 이 아니라 FAIL 로 평가되어야 한다');
  assert.equal(c.current, 99.98);
  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true);
  assert.equal(res.counts.skipped, 0);
});

test('analyze: 값이 수집 안 된 규칙은 skipped, 노이즈 억제는 suppressed 로 분리 집계', () => {
  const rulesFile = tmpRules([
    { key: 'infra.flat.mysql.slowQueries', direction: 'lower_is_better', gate: true }, // 값 없음 → skipped
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', fail: { changePct: 20 }, noiseFloor: 100 }, // 억제 → suppressed
  ]);
  const record = { run: conds(), k6: { phases: { measure: { p95: 110 } } }, infra: { flat: {} } };
  const prev = { run: { ...conds(), id: 'prev', startedAt: 't' }, k6: { phases: { measure: { p95: 100 } } } };
  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.counts.skipped, 1);
  assert.equal(res.counts.suppressed, 1);
});

test('analyze: 기준선 없으면 상대 비교 없이 절대 판정만 수행', () => {
  const rulesFile = tmpRules([
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', fail: { changePct: 20 }, absolute: { fail: { gt: 500 } }, gate: true },
  ]);
  const record = { run: conds(), k6: { phases: { measure: { p95: 100 } } } };
  const res = analyze(record, null, { rulesFile });
  assert.equal(res.hasBaseline, false);
  assert.equal(res.verdict, 'PASS');
});

// ---------------------------------------------------------------------------
// validateRules — T-26. 잘못된 규칙은 조용히 건너뛰지 않고 멈춘다.
// ---------------------------------------------------------------------------
test('validateRules: 알 수 없는 direction 은 예외', () => {
  assert.throws(() => validateRules([{ key: 'x', direction: 'lower' }]), /direction/);
});

test('validateRules: fail 이 warn 보다 먼저 걸리는 역전은 예외', () => {
  assert.throws(
    () => validateRules([{ key: 'x', warn: { changePct: 30 }, fail: { changePct: 10 } }]),
    /먼저/,
  );
});

test('validateRules: key 없는 규칙은 예외', () => {
  assert.throws(() => validateRules([{ direction: 'lower_is_better' }]), /key/);
});

test('validateRules: 숫자가 아닌 noiseFloor 는 예외', () => {
  assert.throws(() => validateRules([{ key: 'x', noiseFloor: '5' }]), /noiseFloor/);
});

test('실제 rules.json 이 검증을 통과한다', () => {
  assert.doesNotThrow(() => loadRules());
});

// ---------------------------------------------------------------------------
// 비교 가능성 (T-02) — 조건이 다른 기준선은 판정에 들어오면 안 되고,
// 그렇다고 조용히 통과해서도 안 된다.
// ---------------------------------------------------------------------------
test('analyze: 조건이 다른 기준선은 상대 비교에서 배제된다 (T-02 회귀 테스트)', () => {
  const rulesFile = tmpRules([
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  // large/200VU 실행이 small/15VU 실행을 기준선으로 받았던 그 상황.
  const record = { run: conds(), k6: { phases: { measure: { p95: 60001 } } } };
  const prev = {
    run: { ...conds({ dataset: 'small', loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 15 }] } } }), id: 'prev', startedAt: 't' },
    k6: { phases: { measure: { p95: 101 } } },
  };

  const res = analyze(record, prev, { rulesFile });

  assert.equal(res.hasBaseline, false, '조건이 다르면 기준선으로 쓰지 않는다');
  assert.equal(res.baselineStatus, 'incomparable');
  assert.equal(res.baselineRunId, null);
  assert.equal(res.comparisons[0].baseline, null, '+59,000% 같은 가짜 증감이 만들어지면 안 된다');
  assert.equal(res.comparisons[0].deltaPct, null);
  assert.equal(res.verdict, 'PASS', '상대 규칙뿐이라면 절대 게이트가 없으므로 통과');
});

test('analyze: 상대 비교가 꺼져도 절대 게이트는 계속 돈다 (조용한 통과 방지)', () => {
  const rulesFile = tmpRules([
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', absolute: { fail: { gt: 500 } }, gate: true },
  ]);
  const record = { run: conds(), k6: { phases: { measure: { p95: 60001 } } } };
  const prev = { run: { ...conds({ dataset: 'small' }), id: 'prev', startedAt: 't' }, k6: { phases: { measure: { p95: 101 } } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.hasBaseline, false);
  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true, 'SLO 위반은 기준선 유무와 무관하게 CI 를 멈춘다');
});

test('analyze: 조건이 같으면 정상 비교하고 baselineStatus 가 compared', () => {
  const rulesFile = tmpRules([
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  const record = { run: conds(), k6: { phases: { measure: { p95: 200 } } } };
  const prev = { run: { ...conds(), id: 'prev', startedAt: 't', commitShort: 'deadbeef' }, k6: { phases: { measure: { p95: 100 } } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.baselineStatus, 'compared');
  assert.equal(res.baselineRunId, 'prev');
  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true);
});

test('analyze: 스크립트 지문만 다르면 비교는 하되 게이트를 연다 (degraded)', () => {
  const rulesFile = tmpRules([
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  const record = { run: conds(), k6: { phases: { measure: { p95: 200 } } } };
  const prev = { run: { ...conds({ scriptVersion: 'zzz999' }), id: 'prev', startedAt: 't' }, k6: { phases: { measure: { p95: 100 } } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.hasBaseline, true);
  assert.equal(res.comparability.level, 'degraded');
  assert.equal(res.downgradedFrom, 'FAIL');
  assert.equal(res.verdict, 'WARN');
  assert.equal(res.gateFailed, false);
});

test('analyze: 기준선이 아예 없으면 first-run', () => {
  const rulesFile = tmpRules([{ key: 'k6.phases.measure.p95', direction: 'lower_is_better' }]);
  const res = analyze({ run: conds(), k6: { phases: { measure: { p95: 100 } } } }, null, { rulesFile });
  assert.equal(res.baselineStatus, 'first-run');
  assert.ok(res.seriesHash, '계열 해시는 기준선 없이도 계산된다');
});

// ---------------------------------------------------------------------------
// bottleneckHints — T-03/S-08: 병목 진단은 measure 구간을 우선 봐야 한다.
// warmup/rampdown이 섞인 전체 구간(k6.all)으로 진단하면 왜곡될 수 있다.
// ---------------------------------------------------------------------------
test('bottleneckHints: k6.phases.measure가 있으면 그걸로 진단한다 (slow query 비율)', () => {
  const record = {
    infra: { flat: { 'mysql.slowQueries': 20 } },
    k6: {
      all: { httpReqs: 100000 }, // measure 대비 훨씬 커서, all을 썼다면 비율이 희석돼 힌트가 안 뜬다
      phases: { measure: { httpReqs: 1000 } }, // 20/1000*1000 = 20건/1000 요청 → 힌트 발생
    },
  };
  const hints = bottleneckHints(record);
  assert.ok(hints.some((h) => h.title.includes('Slow Query')), 'measure 구간 기준으로 slow query 비율 힌트가 떠야 한다');
});

test('bottleneckHints: k6.phases.measure가 없으면(진단 시나리오) k6.all로 폴백한다', () => {
  const record = {
    infra: { flat: { 'mysql.slowQueries': 20 } },
    k6: { all: { httpReqs: 1000 }, phases: {} },
  };
  const hints = bottleneckHints(record);
  assert.ok(hints.some((h) => h.title.includes('Slow Query')), 'phases가 비어 있으면 k6.all로 폴백해야 한다');
});

// ---------------------------------------------------------------------------
// 측정 상태 — T-08. "성능이 나쁘다"와 "잴 수 없었다"를 다른 축으로 가른다.
//
// 지금까지는 값이 없는 규칙이 SKIP 으로 빠지고 analyze 는 FAIL/WARN 개수만 세어 최종
// 판정을 만들었다. 그래서 Prometheus 가 죽어 인프라 지표를 하나도 못 받아도 결과가
// PASS + exit 0 이었다. 아래 테스트가 그 경로를 고정한다.
// ---------------------------------------------------------------------------

/** requirements 블록까지 담은 규칙 파일 — 인프라 필수 판정은 이 블록이 있어야 켜진다. */
function tmpRuleSet(rules, requirements) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-rules-')), 'rules.json');
  fs.writeFileSync(file, JSON.stringify({ rules, requirements }));
  return file;
}

const REQ_PERF = { infraRequiredEnvironmentPrefixes: ['perf'] };

/** k6 게이트 3개 + 인프라 게이트 1개 + 참고 지표 1개 — 실제 rules.json 의 축소판. */
function gateRules() {
  return [
    { key: 'k6.phases.measure.p95', direction: 'lower_is_better', absolute: { fail: { gt: 500 } }, gate: true },
    { key: 'k6.phases.measure.errorRate', direction: 'lower_is_better', absolute: { fail: { gt: 0.01 } }, gate: true },
    { key: 'k6.phases.measure.checkRate', direction: 'higher_is_better', absolute: { fail: { lt: 0.99 } }, gate: true },
    { key: 'infra.flat.cpu.throttledPct', direction: 'lower_is_better', absolute: { fail: { gt: 10 } }, gate: true },
    { key: 'infra.flat.redis.hitRatioPct', direction: 'higher_is_better', gate: false },
  ];
}

/** 정상적으로 측정된 실행. */
function healthyRecord(over = {}) {
  return {
    run: conds(),
    k6: { phases: { measure: { p95: 120, errorRate: 0.001, checkRate: 0.999 } } },
    infra: { flat: { 'cpu.throttledPct': 0.2, 'redis.hitRatioPct': 99.1 }, window: { incomplete: false } },
    ...over,
  };
}

test('analyze: 필수 지표가 모두 있으면 MEASURED', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const res = analyze(healthyRecord(), null, { rulesFile });
  assert.equal(res.measurementStatus, 'MEASURED');
  assert.deepEqual(res.missingRequired, []);
  assert.deepEqual(res.missingOptional, []);
});

test('analyze: 참고 지표만 빠지면 PARTIAL — 판정 자체는 유효하다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord();
  delete rec.infra.flat['redis.hitRatioPct'];
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'PARTIAL');
  assert.deepEqual(res.missingRequired, []);
  assert.deepEqual(res.missingOptional, ['infra.flat.redis.hitRatioPct']);
  assert.equal(res.verdict, 'PASS', 'PARTIAL 은 성능 판정을 바꾸지 않는다');
});

test('analyze: Prometheus 전면 미응답이면 UNMEASURED (T-08 원래 시나리오)', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord({ infra: { flat: {}, available: false, window: {} } });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'UNMEASURED');
  assert.deepEqual(res.missingRequired, ['infra.flat.cpu.throttledPct']);
  assert.equal(res.verdict, 'PASS', 'verdict 와 측정 상태는 별도 축이다 — 섞지 않는다');
});

test('analyze: measure 구간 표본 0건이면 UNMEASURED (성능 오진이 아니라 측정 불가로)', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  // phases.js 가 표본 0건 구간을 null 로 남긴 뒤의 모양.
  const rec = healthyRecord({
    k6: { phases: { measure: { p95: null, errorRate: null, checkRate: null, httpReqs: 0, iterations: null } } },
  });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'UNMEASURED');
  assert.deepEqual(res.missingRequired, [
    'k6.phases.measure.p95', 'k6.phases.measure.errorRate', 'k6.phases.measure.checkRate',
  ]);
  assert.equal(res.verdict, 'PASS',
    'checkRate 0 으로 인한 가짜 FAIL(성능 오진)이 아니라 측정 불가로 잡혀야 한다');
});

test('analyze: 진단 시나리오(gatePhase != measure)는 measure 결측이 면제된다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord({
    run: conds({ phasePlan: { ...PLAN_STEADY, gatePhase: null } }),
    k6: { all: { p95: 300 }, phases: {} },
  });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'MEASURED', 'measure 구간이라는 개념 자체가 없는 실행이다');
  assert.deepEqual(res.missingRequired, []);
});

test('analyze: phasePlan 없는 과거 실행도 measure 결측이 면제된다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord({ run: conds({ phasePlan: undefined }), k6: { all: { p95: 300 }, phases: {} } });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'MEASURED');
});

test('analyze: 인프라 필수 환경이 아니면 Prometheus 가 없어도 UNMEASURED 가 아니다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord({
    run: conds({ environment: 'local' }),
    infra: { flat: {}, available: false, window: {} },
  });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'PARTIAL', '결측 사실은 남기되 판정을 막지는 않는다');
  assert.deepEqual(res.missingRequired, []);
});

test('analyze: 환경 prefix 로 판정한다 (perf-mi-smoke 같은 변형도 필수 대상)', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord({
    run: conds({ environment: 'perf-mi-smoke' }),
    infra: { flat: {}, available: false, window: {} },
  });
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'UNMEASURED');
});

test('analyze: 측정 구간이 잘린 실행(window.incomplete)은 PARTIAL 로 낮춘다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord();
  rec.infra.window = { incomplete: true };
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.measurementStatus, 'PARTIAL');
  assert.equal(res.windowIncomplete, true);
});

test('analyze: 필수 결측과 게이트 실패는 동시에 성립한다', () => {
  const rulesFile = tmpRuleSet(gateRules(), REQ_PERF);
  const rec = healthyRecord();
  rec.k6.phases.measure.p95 = 900;           // 절대 게이트 초과 → FAIL
  rec.infra.flat['cpu.throttledPct'] = null; // 필수 인프라 결측 → UNMEASURED
  const res = analyze(rec, null, { rulesFile });

  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true);
  assert.equal(res.measurementStatus, 'UNMEASURED');
});

// ---------------------------------------------------------------------------
// isRequired / requirements 검증
// ---------------------------------------------------------------------------
test('isRequired: gate:false 규칙은 어떤 환경에서도 필수가 아니다', () => {
  const rec = healthyRecord();
  assert.equal(isRequired({ key: 'infra.flat.redis.hitRatioPct', gate: false }, rec, REQ_PERF), false);
  assert.equal(isRequired({ key: 'infra.flat.cpu.throttledPct', gate: true }, rec, REQ_PERF), true);
});

test('validateRequirements: 형식이 틀리면 조용히 기본값으로 떨어지지 않고 예외', () => {
  assert.throws(() => validateRequirements({ infraRequiredEnvironmentPrefixes: 'perf' }), /infraRequiredEnvironmentPrefixes/);
  assert.throws(() => validateRequirements({ infraRequiredEnvironmentPrefixes: [''] }), /infraRequiredEnvironmentPrefixes/);
  assert.throws(() => validateRequirements([]), /requirements/);
  assert.doesNotThrow(() => validateRequirements(undefined));
  assert.doesNotThrow(() => validateRequirements({ infraRequiredEnvironmentPrefixes: ['perf'] }));
});

test('loadRuleSet: 실제 rules.json 의 requirements 가 인프라 게이트를 필수로 만든다', () => {
  const { rules, requirements } = loadRuleSet();
  assert.ok(requirements.infraRequiredEnvironmentPrefixes.includes('perf'));
  const infraGate = rules.filter((r) => r.gate && r.key.startsWith('infra.flat.'));
  assert.ok(infraGate.length > 0, '인프라 게이트 규칙이 하나도 없으면 이 정책은 무의미하다');
  for (const rule of infraGate) {
    assert.equal(isRequired(rule, healthyRecord(), requirements), true);
  }
});
