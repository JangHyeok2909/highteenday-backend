'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { measureWindow } = require('../collect');

const PLAN = {
  schemaVersion: 1,
  mode: 'steady-state',
  warmupSec: 300,
  measureSec: 1200,
  rampdownSec: 120,
  measureStartOffsetSec: 300,
  measureEndOffsetSec: 1500,
  gatePhase: 'measure',
};

function run(over = {}) {
  return {
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:27:00.000Z', // 27분 = 300+1200+120초 정상 완주
    phasePlan: PLAN,
    ...over,
  };
}

test('measureWindow: measure 구간과 정확히 일치한다 (T-03/S-08)', () => {
  const w = measureWindow(run());
  assert.equal(w.mode, 'measure');
  assert.equal(w.incomplete, false);
  assert.equal(w.from.toISOString(), '2026-01-01T00:05:00.000Z'); // startedAt + 300s
  assert.equal(w.to.toISOString(), '2026-01-01T00:25:00.000Z');   // from + 1200s
  assert.equal(w.durationSec, 1200);
});

test('measureWindow: rampdown/gracefulRampDown이 창에서 제외된다', () => {
  const w = measureWindow(run());
  const rampdownStart = new Date('2026-01-01T00:25:00.000Z'); // measure 종료 = rampdown 시작
  const endedAt = new Date('2026-01-01T00:27:00.000Z');
  assert.ok(w.to.getTime() === rampdownStart.getTime());
  assert.ok(w.to.getTime() < endedAt.getTime(), 'to는 실제 종료 시각보다 앞서야 한다(rampdown 제외)');
});

test('measureWindow: 조기 종료 — measure 종료 전에 끝나면 실제 가용 구간으로 clamp되고 incomplete=true', () => {
  // 27분 계획인데 20분(00:20:00)에 끝났다 — measure 구간(00:05~00:25) 도중 조기 종료.
  const w = measureWindow(run({ endedAt: '2026-01-01T00:20:00.000Z' }));
  assert.equal(w.incomplete, true);
  assert.equal(w.to.toISOString(), '2026-01-01T00:20:00.000Z'); // endedAt으로 clamp
  assert.equal(w.durationSec, 15 * 60); // 00:05~00:20
});

test('measureWindow: warmup 도중 조기 종료 — measure 구간 자체가 존재하지 않는다', () => {
  // measure는 00:05부터 시작인데 00:02에 끝났다.
  const w = measureWindow(run({ endedAt: '2026-01-01T00:02:00.000Z' }));
  assert.equal(w.incomplete, true);
  assert.equal(w.durationSec, 0);
});

test('measureWindow: phasePlan이 없는 과거 실행은 전체 구간으로 폴백한다 (legacy)', () => {
  const w = measureWindow(run({ phasePlan: null }));
  assert.equal(w.mode, 'legacy-no-phase-plan');
  assert.equal(w.from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(w.to.toISOString(), '2026-01-01T00:27:00.000Z');
});

test('measureWindow: gatePhase:null(진단 시나리오)은 전체 구간으로 폴백한다', () => {
  const w = measureWindow(run({
    phasePlan: { ...PLAN, gatePhase: null, mode: 'diagnostic' },
  }));
  assert.equal(w.mode, 'diagnostic-full-run');
  assert.equal(w.incomplete, false);
});

test('measureWindow: cold-start형(warmupSec:0) plan은 시작 시각부터 곧바로 measure', () => {
  const coldPlan = { ...PLAN, mode: 'cold-start', warmupSec: 0, measureSec: 630, rampdownSec: 0, measureStartOffsetSec: 0, measureEndOffsetSec: 630 };
  const w = measureWindow(run({ phasePlan: coldPlan, endedAt: '2026-01-01T00:10:30.000Z' }));
  assert.equal(w.from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(w.durationSec, 630);
});

// ---------------------------------------------------------------------------
// 재수집 재현성 — measureWindow()는 opts(CLI 인자)를 아예 받지 않는다. run.phasePlan만의
// 함수이므로, 같은 run을 몇 번을 다시 넣어도 항상 같은 창이 나온다 — "--warmup을 다시
// 입력해야 하는가"라는 질문 자체가 성립하지 않는다(완료 조건).
// ---------------------------------------------------------------------------
test('measureWindow: 같은 run을 반복 호출해도(재수집 시뮬레이션) 항상 같은 창 — CLI 재입력 불필요', () => {
  const r = run();
  const first = measureWindow(r);
  const second = measureWindow(r); // --force로 재수집한다고 가정 — opts를 전혀 안 넘겨도 됨
  assert.equal(first.from.toISOString(), second.from.toISOString());
  assert.equal(first.to.toISOString(), second.to.toISOString());
  assert.equal(first.durationSec, second.durationSec);
  assert.equal(measureWindow.length, 1, 'measureWindow는 run 하나만 받는다 — opts로 창을 바꿀 방법 자체가 없다');
});
