'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cmp = require('../lib/comparability');

const LOAD_200 = {
  normal_day: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '5m', target: 200 }] },
};
const LOAD_15 = {
  normal_day: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '5m', target: 15 }] },
};

const PLAN_STEADY = {
  schemaVersion: 1, mode: 'steady-state', warmupSec: 300, measureSec: 1200, rampdownSec: 120,
  measureStartOffsetSec: 300, measureEndOffsetSec: 1500, gatePhase: 'measure',
};

function run(over = {}) {
  return {
    run: {
      scenario: 'normal-day',
      environment: 'perf',
      dataset: 'large',
      loadProfile: LOAD_200,
      scriptVersion: 'abc123',
      phasePlan: PLAN_STEADY,
      ...over,
    },
  };
}

// ---------------------------------------------------------------------------
// T-02 회귀 테스트 — 이 비교가 실제로 일어났고, 다시 일어나면 안 된다.
// ---------------------------------------------------------------------------
test('T-02: 데이터셋이 다르면 비교 불가 (large 200VU vs small 15VU)', () => {
  const cur = cmp.conditionsOf(run());
  const base = cmp.conditionsOf(run({ dataset: 'small', loadProfile: LOAD_15 }));
  const res = cmp.compare(cur, base);

  assert.equal(res.comparable, false);
  assert.equal(res.level, 'incomparable');
  const keys = res.mismatches.map((m) => m.key).sort();
  assert.deepEqual(keys, ['dataset', 'loadProfile']);
  assert.ok(res.mismatches.every((m) => m.materiality === 'blocking'));
});

test('부하 프로파일만 달라도 비교 불가 (같은 데이터셋)', () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run({ loadProfile: LOAD_15 })));
  assert.equal(res.comparable, false);
  assert.deepEqual(res.mismatches.map((m) => m.key), ['loadProfile']);
});

test('조건이 모두 같으면 exact', () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run()));
  assert.equal(res.level, 'exact');
  assert.equal(res.mismatches.length, 0);
});

// ---------------------------------------------------------------------------
// 관측값이 조건에 새어 들어가면 안 된다 — 순진한 수정이 만드는 자기 무력화 버그.
// arrival-rate 시나리오에서 vusMax 는 서버가 느려질수록 올라가므로, 조건으로 쓰면
// "회귀가 심할수록 기준선이 탈락해 게이트가 열리는" 역전이 생긴다.
// ---------------------------------------------------------------------------
test('관측된 vusMax/durationSec 이 달라도 비교 가능성에 영향이 없다', () => {
  const cur = cmp.conditionsOf({ run: { ...run().run, vusMax: 812, durationSec: 1650 } });
  const base = cmp.conditionsOf({ run: { ...run().run, vusMax: 203, durationSec: 1621 } });
  assert.equal(cmp.compare(cur, base).level, 'exact');
});

// ---------------------------------------------------------------------------
// 등급 — 스크립트 지문은 비교를 막지 않고 낮춘다.
// ---------------------------------------------------------------------------
test('스크립트 지문만 다르면 degraded — 비교는 계속한다', () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run({ scriptVersion: 'zzz999' })));
  assert.equal(res.comparable, true);
  assert.equal(res.level, 'degraded');
  assert.equal(res.mismatches[0].materiality, 'degrading');
});

test("스크립트 지문이 'unknown' 이면 판정하지 않는다 (이관된 과거 실행)", () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run({ scriptVersion: 'unknown' })));
  assert.equal(res.level, 'exact');
});

// ---------------------------------------------------------------------------
// 기록되지 않은 조건 — "같음을 증명하지 못하면 비교하지 않는다"
// ---------------------------------------------------------------------------
test('blocking 조건이 한쪽에 없으면 비교 불가 (조건 도입 이전의 과거 실행)', () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run({ loadProfile: null })));
  assert.equal(res.comparable, false);
  assert.equal(res.mismatches[0].reason, 'unrecorded');
});

test('조건 자체가 없으면 비교 불가', () => {
  assert.equal(cmp.compare(null, cmp.conditionsOf(run())).comparable, false);
  assert.equal(cmp.compare(cmp.conditionsOf(run()), null).comparable, false);
});

// ---------------------------------------------------------------------------
// 해시
// ---------------------------------------------------------------------------
test('seriesHash: 키 순서가 달라도 같은 해시 (직렬화 안정성)', () => {
  const a = cmp.seriesHash({ scenario: 's', environment: 'perf', dataset: 'large', loadProfile: { x: { a: 1, b: 2 } } });
  const b = cmp.seriesHash({ loadProfile: { x: { b: 2, a: 1 } }, dataset: 'large', environment: 'perf', scenario: 's' });
  assert.equal(a, b);
});

test('seriesHash: blocking 조건이 다르면 다른 계열', () => {
  assert.notEqual(
    cmp.seriesHash(cmp.conditionsOf(run())),
    cmp.seriesHash(cmp.conditionsOf(run({ dataset: 'small' }))),
  );
});

test('seriesHash: degrading 조건(스크립트)은 계열을 가르지 않는다', () => {
  assert.equal(
    cmp.seriesHash(cmp.conditionsOf(run())),
    cmp.seriesHash(cmp.conditionsOf(run({ scriptVersion: 'zzz999' }))),
  );
});

test('conditionsOf: 인덱스 엔트리의 conditions 를 그대로 쓴다', () => {
  const entry = { id: 'x', conditions: { scenario: 'a', environment: 'b', dataset: 'c', loadProfile: null, scriptVersion: 'd' } };
  assert.equal(cmp.conditionsOf(entry).scenario, 'a');
});

test('formatLoadProfile: 사람이 읽을 수 있는 한 줄을 만든다', () => {
  const s = cmp.formatLoadProfile(LOAD_200);
  assert.match(s, /ramping-vus/);
  assert.match(s, /200@5m/);
});

// ---------------------------------------------------------------------------
// measurementProfile — T-03/S-08/S-17: "어느 시간대를 판정했는가"가 다르면 비교 불가.
// ---------------------------------------------------------------------------
test('measurementProfile: 동일한 phasePlan이면 exact', () => {
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(run()));
  assert.equal(res.level, 'exact');
});

test('measurementProfile: warmupSec이 다르면 blocking', () => {
  const other = run({ phasePlan: { ...PLAN_STEADY, warmupSec: 60 } });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(other));
  assert.equal(res.comparable, false);
  assert.equal(res.mismatches[0].key, 'measurementProfile');
  assert.equal(res.mismatches[0].materiality, 'blocking');
});

test('measurementProfile: measureSec이 다르면 blocking', () => {
  const other = run({ phasePlan: { ...PLAN_STEADY, measureSec: 600 } });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(other));
  assert.equal(res.comparable, false);
  assert.deepEqual(res.mismatches.map((m) => m.key), ['measurementProfile']);
});

test('measurementProfile: rampdownSec이 다르면 blocking', () => {
  const other = run({ phasePlan: { ...PLAN_STEADY, rampdownSec: 0 } });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(other));
  assert.equal(res.comparable, false);
});

test('measurementProfile: mode가 다르면 blocking (cache-warm vs steady-state)', () => {
  const cacheWarm = run({ phasePlan: { ...PLAN_STEADY, mode: 'cache-warm' } });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(cacheWarm));
  assert.equal(res.comparable, false);
});

test('measurementProfile: gatePhase가 다르면 blocking (진단 시나리오 vs 게이트 대상)', () => {
  const diagnostic = run({ phasePlan: { ...PLAN_STEADY, gatePhase: null } });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(diagnostic));
  assert.equal(res.comparable, false);
});

test('measurementProfile: phasePlan이 기록되지 않은 과거 실행은 비교 불가 (소급 금지)', () => {
  const legacy = run({ phasePlan: null });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(legacy));
  assert.equal(res.comparable, false);
  assert.equal(res.mismatches.find((m) => m.key === 'measurementProfile').reason, 'unrecorded');
});

test('measurementProfile: loadProfile과 동시에 달라도 두 mismatch가 각각 기록된다 (report.js가 표시를 합친다)', () => {
  // stagesFor()가 phase-plan 초 수로 stages를 생성하므로 실제로는 이렇게 같이 바뀐다.
  const other = run({
    loadProfile: LOAD_15,
    phasePlan: { ...PLAN_STEADY, warmupSec: 60 },
  });
  const res = cmp.compare(cmp.conditionsOf(run()), cmp.conditionsOf(other));
  assert.deepEqual(res.mismatches.map((m) => m.key).sort(), ['loadProfile', 'measurementProfile']);
});

test('seriesHash: measurementProfile이 다르면 다른 계열로 분리된다', () => {
  const other = run({ phasePlan: { ...PLAN_STEADY, mode: 'cache-warm' } });
  assert.notEqual(
    cmp.seriesHash(cmp.conditionsOf(run())),
    cmp.seriesHash(cmp.conditionsOf(other)),
  );
});

test('formatMeasurementProfile: 사람이 읽을 수 있는 한 줄을 만든다', () => {
  const s = cmp.formatMeasurementProfile({ mode: 'steady-state', warmupSec: 300, measureSec: 1200, rampdownSec: 120, gatePhase: 'measure' });
  assert.match(s, /steady-state/);
  assert.match(s, /warmup 300s/);
  assert.match(s, /gate:measure/);
});
