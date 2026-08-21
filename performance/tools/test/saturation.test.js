'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sat = require('../lib/saturation');

// 이 판정 축이 없어서 큐 대기를 애플리케이션 지연으로 닷새간 읽었다.
// 실제 저장된 두 실행의 값을 그대로 넣어 회귀를 고정한다.

/** 2026-08-19 #90~98 평균 — closed model 200VU 포화 */
const SATURATED = {
  infra: {
    flat: {
      'pool.hikariPending.avg': 145,
      'pool.hikariAcquireP95Ms': 6364,
      'cpu.throttledPct': 99.86,
      'cpu.cores.avg': 1.998,
      'cpu.limitCores': 2,
    },
  },
  k6: { phases: { measure: { p95: 10685, iterations: 1788, durationSec: 300 } } },
  run: {},
};

/** 2026-08-20 #109~111 평균 — open model RATE=4 비포화 */
const HEADROOM = {
  infra: {
    flat: {
      'pool.hikariPending.avg': 0,
      'pool.hikariAcquireP95Ms': 1,
      'cpu.throttledPct': 4.1,
      'cpu.cores.avg': 0.68,
      'cpu.limitCores': 2,
    },
  },
  k6: { phases: { measure: { p95: 278, iterations: 1200, durationSec: 300 } } },
  run: {
    loadProfile: {
      normal_day: { executor: 'ramping-arrival-rate', stages: [{ target: 4 }, { target: 4 }, { target: 0 }] },
    },
  },
};

test('포화 실행을 SATURATED 로 판정한다', () => {
  const r = sat.assess(SATURATED);
  assert.equal(r.status, 'SATURATED');
  assert.ok(r.reasons.length >= 3, '사유가 여러 개 나와야 한다');
});

test('비포화 실행을 HEADROOM 으로 판정한다', () => {
  const r = sat.assess(HEADROOM);
  assert.equal(r.status, 'HEADROOM');
});

test('포화 실행에는 경고 배너가 붙고 비포화에는 안 붙는다', () => {
  assert.match(sat.banner(sat.assess(SATURATED)), /애플리케이션 지연이 아니라/);
  assert.equal(sat.banner(sat.assess(HEADROOM)), null);
});

test('커넥션 대기만 있어도 포화로 잡는다', () => {
  const r = sat.assess({
    infra: { flat: { 'pool.hikariPending.avg': 65 } },
    k6: { phases: { measure: { p95: 11871 } } },
    run: {},
  });
  assert.equal(r.status, 'SATURATED');
});

test('큐가 막 생기기 시작하면 NEAR_LIMIT', () => {
  const r = sat.assess({
    infra: { flat: { 'pool.hikariPending.avg': 2, 'cpu.throttledPct': 3.5, 'cpu.cores.avg': 0.74, 'cpu.limitCores': 2 } },
    k6: { phases: { measure: { p95: 690 } } },
    run: {},
  });
  assert.equal(r.status, 'NEAR_LIMIT');
});

test('지표가 없으면 UNKNOWN — 값을 만들어내지 않는다', () => {
  const r = sat.assess({ infra: { flat: {} }, k6: {}, run: {} });
  assert.equal(r.status, 'UNKNOWN');
});

// 도착률 달성도 — open model 에서만 의미가 있다.

test('도착률 미달을 포화 신호로 잡는다', () => {
  const r = sat.assess({
    infra: { flat: { 'pool.hikariPending.avg': 0 } },
    k6: { phases: { measure: { p95: 11871, iterations: 1149, durationSec: 300 } } }, // 3.83/s
    run: { loadProfile: { normal_day: { executor: 'ramping-arrival-rate', stages: [{ target: 5 }] } } },
  });
  const s = r.signals.find((x) => x.key === 'achievedRate');
  assert.equal(s.level, 'fail');
  assert.ok(s.value < 80, `도달률이 77% 근처여야 한다 (받은 값 ${s.value})`);
  assert.equal(r.status, 'SATURATED');
});

test('closed model 에는 도착률 신호를 만들지 않는다', () => {
  const r = sat.assess({
    infra: { flat: { 'pool.hikariPending.avg': 0 } },
    k6: { phases: { measure: { p95: 300, iterations: 1000, durationSec: 300 } } },
    run: { loadProfile: { normal_day: { executor: 'ramping-vus', stages: [{ target: 200 }] } } },
  });
  assert.equal(r.signals.find((x) => x.key === 'achievedRate'), undefined);
});

// 영역이 다르면 상대 비교가 성립하지 않는다.

test('포화 영역과 비포화 영역의 비교를 막는다', () => {
  const msg = sat.regimeMismatch(sat.assess(HEADROOM), sat.assess(SATURATED));
  assert.match(msg, /서로 다른 물리량/);
});

test('같은 영역끼리는 경고하지 않는다', () => {
  assert.equal(sat.regimeMismatch(sat.assess(HEADROOM), sat.assess(HEADROOM)), null);
});
