'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { pick, evaluateRule, analyze, validateRules, loadRules } = require('../lib/regression');

// ---------------------------------------------------------------------------
// pick — T-01 회귀 테스트. infra.flat 은 키에 점이 든 평면 맵이다.
// 이 테스트가 있었다면 infra 규칙 25개가 한 번도 평가되지 않는 버그는 첫날 잡혔다.
// ---------------------------------------------------------------------------
test('pick: 중첩 경로(k6.overall.p95)를 꺼낸다', () => {
  const rec = { k6: { overall: { p95: 123 } } };
  assert.equal(pick(rec, 'k6.overall.p95'), 123);
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
/** 비교 가능한 실행 조건 — 기준선 비교가 성립하려면 양쪽에 있어야 한다. */
function conds(over = {}) {
  return {
    scenario: 'normal-day',
    environment: 'perf',
    dataset: 'large',
    loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 200 }] } },
    scriptVersion: 'abc123',
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
    { key: 'k6.overall.p95', direction: 'lower_is_better', fail: { changePct: 20 }, noiseFloor: 100 }, // 억제 → suppressed
  ]);
  const record = { run: conds(), k6: { overall: { p95: 110 } }, infra: { flat: {} } };
  const prev = { run: { ...conds(), id: 'prev', startedAt: 't' }, k6: { overall: { p95: 100 } } };
  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.counts.skipped, 1);
  assert.equal(res.counts.suppressed, 1);
});

test('analyze: 기준선 없으면 상대 비교 없이 절대 판정만 수행', () => {
  const rulesFile = tmpRules([
    { key: 'k6.overall.p95', direction: 'lower_is_better', fail: { changePct: 20 }, absolute: { fail: { gt: 500 } }, gate: true },
  ]);
  const record = { run: conds(), k6: { overall: { p95: 100 } } };
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
    { key: 'k6.overall.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  // large/200VU 실행이 small/15VU 실행을 기준선으로 받았던 그 상황.
  const record = { run: conds(), k6: { overall: { p95: 60001 } } };
  const prev = {
    run: { ...conds({ dataset: 'small', loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 15 }] } } }), id: 'prev', startedAt: 't' },
    k6: { overall: { p95: 101 } },
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
    { key: 'k6.overall.p95', direction: 'lower_is_better', absolute: { fail: { gt: 500 } }, gate: true },
  ]);
  const record = { run: conds(), k6: { overall: { p95: 60001 } } };
  const prev = { run: { ...conds({ dataset: 'small' }), id: 'prev', startedAt: 't' }, k6: { overall: { p95: 101 } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.hasBaseline, false);
  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true, 'SLO 위반은 기준선 유무와 무관하게 CI 를 멈춘다');
});

test('analyze: 조건이 같으면 정상 비교하고 baselineStatus 가 compared', () => {
  const rulesFile = tmpRules([
    { key: 'k6.overall.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  const record = { run: conds(), k6: { overall: { p95: 200 } } };
  const prev = { run: { ...conds(), id: 'prev', startedAt: 't', commitShort: 'deadbeef' }, k6: { overall: { p95: 100 } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.baselineStatus, 'compared');
  assert.equal(res.baselineRunId, 'prev');
  assert.equal(res.verdict, 'FAIL');
  assert.equal(res.gateFailed, true);
});

test('analyze: 스크립트 지문만 다르면 비교는 하되 게이트를 연다 (degraded)', () => {
  const rulesFile = tmpRules([
    { key: 'k6.overall.p95', direction: 'lower_is_better', fail: { changePct: 20 }, gate: true },
  ]);
  const record = { run: conds(), k6: { overall: { p95: 200 } } };
  const prev = { run: { ...conds({ scriptVersion: 'zzz999' }), id: 'prev', startedAt: 't' }, k6: { overall: { p95: 100 } } };

  const res = analyze(record, prev, { rulesFile });
  assert.equal(res.hasBaseline, true);
  assert.equal(res.comparability.level, 'degraded');
  assert.equal(res.downgradedFrom, 'FAIL');
  assert.equal(res.verdict, 'WARN');
  assert.equal(res.gateFailed, false);
});

test('analyze: 기준선이 아예 없으면 first-run', () => {
  const rulesFile = tmpRules([{ key: 'k6.overall.p95', direction: 'lower_is_better' }]);
  const res = analyze({ run: conds(), k6: { overall: { p95: 100 } } }, null, { rulesFile });
  assert.equal(res.baselineStatus, 'first-run');
  assert.ok(res.seriesHash, '계열 해시는 기준선 없이도 계산된다');
});
