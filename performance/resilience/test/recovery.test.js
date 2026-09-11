'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const recovery = require('../lib/recovery');

const T0_MS = 1700000000000;
const T0_SEC = T0_MS / 1000;
const STEP = 5;

/** pre/fault/post 를 이어 붙인 5초 간격 시계열. 각 구간은 `[값, 초]` 쌍의 배열로 준다. */
function series(segments) {
  const out = [];
  let sec = 0;
  for (const [value, durationSec] of segments) {
    for (let i = 0; i < durationSec / STEP; i += 1) {
      out.push({ t: T0_SEC + sec, v: value });
      sec += STEP;
    }
  }
  return out;
}

const SPEC = { key: 'p95', label: '응답 p95', unit: 'ms', digits: 0, tolerance: 1.2, floor: 50, smoothedSec: 0, direction: 'upper' };
const MARKS = { t0Sec: T0_SEC, faultStartSec: 100, faultEndSec: 160 };
const OPTS = recovery.DEFAULTS;

// ---------------------------------------------------------------------------
// recoveryOf — 회복 상태 다섯 가지
// ---------------------------------------------------------------------------

test('회복: 장애 제거 뒤 대역으로 돌아와 유지되면 초를 낸다', () => {
  // pre 100초(100ms) → fault 60초(5000ms) → post 20초는 아직 높고, 그 뒤 100초는 정상.
  const r = recovery.recoveryOf(series([[100, 100], [5000, 60], [5000, 20], [110, 100]]), SPEC, MARKS, OPTS);
  assert.equal(r.status, 'recovered');
  assert.equal(r.base, 100);
  assert.equal(r.limit, 150); // max(100×1.2, 100+50)
  assert.equal(r.worst, 5000);
  assert.equal(r.recoveredAtSec, 180); // fault 종료(160) + 높은 상태 20초
  assert.equal(r.recoverySec, 20);
});

test('회복: 유지 조건이 중간 스파이크를 회복으로 읽지 않는다', () => {
  // 대역 안 10초 → 다시 스파이크 20초 → 그 뒤 정상. 첫 정상 구간은 30초 유지에 못 미친다.
  const r = recovery.recoveryOf(series([[100, 100], [5000, 60], [110, 10], [5000, 20], [110, 100]]), SPEC, MARKS, OPTS);
  assert.equal(r.status, 'recovered');
  assert.equal(r.recoveredAtSec, 190); // 스파이크가 끝난 뒤
  assert.equal(r.recoverySec, 30);
});

test('미회복: 실행이 끝날 때까지 대역 밖이면 숫자를 내지 않는다', () => {
  const r = recovery.recoveryOf(series([[100, 100], [5000, 60], [5000, 100]]), SPEC, MARKS, OPTS);
  assert.equal(r.status, 'not-recovered');
  assert.equal(r.recoverySec, undefined);
  assert.equal(r.lastValue, 5000);
});

test('확인 불가: 대역에 들어왔지만 유지 구간이 모자라면 미회복과 구분한다', () => {
  // post 가 20초뿐이라 30초 유지를 증명할 표본이 없다.
  const r = recovery.recoveryOf(series([[100, 100], [5000, 60], [110, 20]]), SPEC, MARKS, OPTS);
  assert.equal(r.status, 'unproven');
  assert.equal(r.enteredAtSec, 160);
  assert.equal(r.shortBySec, 15); // 마지막 표본이 175s, 유지 종료는 190s
});

test('영향 없음: 대역을 한 번도 벗어나지 않으면 회복 0초가 아니다', () => {
  const r = recovery.recoveryOf(series([[100, 100], [120, 60], [110, 100]]), SPEC, MARKS, OPTS);
  assert.equal(r.status, 'no-impact');
  assert.equal(r.recoverySec, undefined);
});

test('자료 없음: pre 표본이 없으면 기준을 만들지 않는다', () => {
  const points = series([[100, 200]]).filter((p) => p.t - T0_SEC >= 100);
  const r = recovery.recoveryOf(points, SPEC, MARKS, OPTS);
  assert.equal(r.status, 'no-data');
  assert.match(r.reason, /pre/);
});

test('빈 시계열은 수집 실패로 표시한다', () => {
  const r = recovery.recoveryOf([], SPEC, MARKS, OPTS);
  assert.equal(r.status, 'no-data');
});

// ---------------------------------------------------------------------------
// 대역 규칙
// ---------------------------------------------------------------------------

test('대역: 기준이 0 이면 곱셈이 아니라 고정폭이 대역을 만든다', () => {
  const zeroBase = { ...SPEC, key: 'hikariPending', floor: 1, tolerance: 1.2 };
  assert.equal(recovery.bandLimit(0, zeroBase), 1);
  // pending 이 0 인 실행에서 곱셈만 쓰면 대역이 0 이라 잡음 하나가 미회복이 된다.
  const r = recovery.recoveryOf(series([[0, 100], [50, 60], [0, 100]]), zeroBase, MARKS, OPTS);
  assert.equal(r.status, 'recovered');
  assert.equal(r.recoverySec, 0);
});

test('대역: 값이 큰 쪽이 정상인 지표는 하한으로 판단한다', () => {
  const spec = { ...SPEC, key: 'rps', tolerance: 0.9, floor: 0.5, direction: 'lower' };
  assert.equal(recovery.bandLimit(4, spec), 3.5); // min(3.6, 3.5)
  const r = recovery.recoveryOf(series([[4, 100], [0.5, 60], [4, 100]]), spec, MARKS, OPTS);
  assert.equal(r.status, 'recovered');
  assert.equal(r.worst, 0.5);
  assert.equal(r.recoverySec, 0);
});

test('기준값은 pre 앞 웜업 구간을 빼고 만든다', () => {
  // 앞 30초가 1000ms, 나머지 70초가 100ms. 웜업을 안 빼면 기준이 올라가 대역이 헐거워진다.
  const r = recovery.recoveryOf(series([[1000, 30], [100, 70], [5000, 60], [100, 100]]), SPEC, MARKS, OPTS);
  assert.equal(r.base, 100);
  assert.equal(r.warmupSkipped, true);
});

test('pre 가 웜업 구간보다 짧으면 자르지 않고 전체를 쓴다', () => {
  const marks = { t0Sec: T0_SEC, faultStartSec: 10, faultEndSec: 30 };
  const r = recovery.recoveryOf(series([[100, 10], [5000, 20], [100, 100]]), SPEC, marks, OPTS);
  assert.equal(r.base, 100);
  assert.equal(r.warmupSkipped, false);
});

// ---------------------------------------------------------------------------
// detectionLag — 탐지·해제 지연
// ---------------------------------------------------------------------------

/** 5초 간격 헬스 표본. `bad` 에 든 인덱스는 폴러 상한 초과(무응답)로 만든다. */
function health(count, bad, latencyMs = 20) {
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(T0_MS + i * 5000).toISOString();
    return bad.includes(i)
      ? { at, httpStatus: null, status: 'UNREACHABLE', error: 'timeout after 4000ms', latencyMs: 4000 }
      : { at, httpStatus: 200, status: 'UP', components: { db: 'UP', redis: 'UP' }, latencyMs };
  });
}

function rec(over = {}) {
  return {
    t0: new Date(T0_MS).toISOString(),
    plan: { phases: { preSec: 100, faultSec: 60, postSec: 100 } },
    events: [
      { kind: 'inject', tool: 'docker', action: 'stop', target: 'perf-redis', plannedAtSec: 100, actualAtSec: 100, at: new Date(T0_MS + 100000).toISOString() },
      { kind: 'inject', tool: 'docker', action: 'start', target: 'perf-redis', plannedAtSec: 160, actualAtSec: 160, at: new Date(T0_MS + 160000).toISOString() },
    ],
    ...over,
  };
}

test('탐지: 주입 시각과 첫 비정상 표본의 완료 시각 차를 낸다', () => {
  // 표본은 5초 간격이고 20~23번(100~115초)이 무응답이다. 주입은 100초.
  const d = recovery.detectionLag(rec({ health: health(60, [20, 21, 22, 23]) }));
  assert.equal(d.status, 'detected');
  assert.equal(d.cause, 'timeout');
  assert.equal(d.lagSec, 4); // 100초 표본이 4초 상한까지 기다린 뒤 실패
  assert.equal(d.faultStart.source, 'event');
});

test('탐지: 지연은 요청 시작이 아니라 완료 시각으로 잰다', () => {
  const d = recovery.detectionLag(rec({ health: health(60, [22]) }));
  assert.equal(d.lagSec, 14); // 110초에 시작해 4초 뒤 완료
  assert.equal(d.lastGoodBeforeSec, 5); // 직전 정상 표본이 105초 — 그 사이 어딘가에서 장애가 났다
});

test('탐지: 장애 내내 UP 이면 미탐지로 남긴다 — 0초가 아니다', () => {
  const d = recovery.detectionLag(rec({ health: health(60, []) }));
  assert.equal(d.status, 'undetected');
  assert.equal(d.lagSec, undefined);
});

test('해제: 장애를 걷은 뒤 다시 UP 이 될 때까지를 잰다', () => {
  // 160초에 장애 제거, 표본 32~34(160~170초)가 아직 무응답이다.
  const d = recovery.detectionLag(rec({ health: health(60, [20, 21, 32, 33, 34]) }));
  assert.equal(d.clearLagSec, 15); // 175초 표본에서 정상 복귀
  assert.equal(d.badAfterEnd, 3);
});

test('해제: 끝까지 UP 으로 돌아오지 않으면 null 로 남긴다', () => {
  const d = recovery.detectionLag(rec({ health: health(40, [20, 21, 32, 33, 34, 35, 36, 37, 38, 39]) }));
  assert.equal(d.clearLagSec, null);
});

test('주입 기록이 없으면 계획 시각으로 물러나고 그 사실을 남긴다', () => {
  const d = recovery.detectionLag(rec({ events: [], health: health(60, [21]) }));
  assert.equal(d.faultStart.source, 'plan');
  assert.equal(d.lagSec, 9); // 105초 표본이 4초 뒤 실패, 기준은 계획상 100초
});

test('폴링 간격을 표본에서 읽어 남긴다 — 측정 오차의 폭이다', () => {
  const d = recovery.detectionLag(rec({ health: health(60, [21]) }));
  assert.equal(d.resolutionSec, 5);
});

// ---------------------------------------------------------------------------
// analyze — 레코드 한 건 전체
// ---------------------------------------------------------------------------

test('analyze: 수집된 시계열만 골라 계산한다', () => {
  const a = recovery.analyze(rec({
    health: health(60, [20, 21]),
    series: { p95: series([[100, 100], [5000, 60], [100, 100]]), errorPct: [], notAMetric: series([[1, 260]]) },
  }));
  assert.deepEqual(a.metrics.map((m) => m.key), ['errorPct', 'p95']);
  assert.equal(a.metrics.find((m) => m.key === 'p95').status, 'recovered');
  assert.equal(a.metrics.find((m) => m.key === 'errorPct').status, 'no-data');
  assert.equal(a.marks.faultEndSec, 160);
});

test('analyze: t0 나 구간 정보가 없으면 null 을 준다', () => {
  assert.equal(recovery.analyze({ series: {} }), null);
  assert.equal(recovery.analyze(rec({ plan: { phases: {} }, series: {} })), null);
});
