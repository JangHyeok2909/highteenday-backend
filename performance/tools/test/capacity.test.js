'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const capacity = require('../capacity');

const T0 = '2026-09-16T00:00:00.000Z';
const T0_SEC = Date.parse(T0) / 1000;

/** breakpoint.js 가 만드는 모양 — 계단마다 전환 30초 + 유지 90초. */
function scenario(targets, { startRate = 10, maxVUs = 4000 } = {}) {
  return {
    executor: 'ramping-arrival-rate',
    startRate,
    maxVUs,
    stages: targets.flatMap((target) => [
      { duration: '30s', target },
      { duration: '90s', target },
    ]),
  };
}

/** [fromSec, toSec) 을 5초 간격으로 채운 시계열. */
function series(segments) {
  const out = [];
  for (const [fromSec, toSec, value] of segments) {
    for (let s = fromSec; s < toSec; s += 5) out.push({ t: T0_SEC + s, v: value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// durationSec / holdWindows
// ---------------------------------------------------------------------------

test('durationSec: k6 duration 문자열을 초로 바꾼다', () => {
  assert.equal(capacity.durationSec('90s'), 90);
  assert.equal(capacity.durationSec('1m30s'), 90);
  assert.equal(capacity.durationSec('1h'), 3600);
  assert.equal(capacity.durationSec('없음'), null);
});

test('holdWindows: 전환 구간을 빼고 유지 구간만 남긴다', () => {
  const w = capacity.holdWindows(scenario([60, 100]), T0_SEC);
  assert.equal(w.length, 2);
  // 첫 계단: 0~30 전환, 30~120 유지.
  assert.deepEqual(w[0], { target: 60, fromSec: T0_SEC + 30, toSec: T0_SEC + 120, holdSec: 90 });
  // 둘째 계단: 120~150 전환, 150~240 유지.
  assert.deepEqual(w[1], { target: 100, fromSec: T0_SEC + 150, toSec: T0_SEC + 240, holdSec: 90 });
});

test('holdWindows: startRate 와 첫 target 이 같으면 첫 stage 도 유지 구간이다', () => {
  // 전환 없이 곧바로 유지로 들어가는 계획도 있을 수 있다. 그 stage 를 빠뜨리면
  // 첫 계단이 표에서 통째로 사라진다.
  const sc = { executor: 'ramping-arrival-rate', startRate: 60, maxVUs: 100, stages: [{ duration: '90s', target: 60 }] };
  const w = capacity.holdWindows(sc, T0_SEC);
  assert.equal(w.length, 1);
  assert.equal(w[0].fromSec, T0_SEC);
});

// ---------------------------------------------------------------------------
// analyze — 세 지점
// ---------------------------------------------------------------------------

/** 계단 둘짜리 실행. 둘째 계단에서 p95 가 SLO 를 넘고 도달률이 떨어지게 만든다. */
function record() {
  const s1 = [30, 120];   // 첫 계단 유지 구간 (앞 30초는 분석에서 잘린다)
  const s2 = [150, 240];  // 둘째 계단 유지 구간
  const seg = (win, v) => [win[0] + capacity.RATE_WINDOW_SEC, win[1], v];
  return {
    id: 'breakpoint-test',
    run: { startedAt: T0, loadProfile: { breakpoint: scenario([60, 100]) } },
    infra: { flat: { 'cpu.limitCores': 8, 'pool.tomcatMax': 50, 'pool.hikariMax': 60 } },
    series: {
      'k6ts.iterations': series([seg(s1, 60), seg(s2, 90)]),
      'k6ts.p95': series([seg(s1, 120), seg(s2, 900)]),
      'k6ts.errorPct': series([seg(s1, 0), seg(s2, 0)]),
      'cpu.cores': series([seg(s1, 2), seg(s2, 7.6)]),
      'pool.tomcatBusy': series([seg(s1, 8), seg(s2, 20)]),
      'pool.hikariActive': series([seg(s1, 6), seg(s2, 15)]),
      'k6ts.vus': series([seg(s1, 700), seg(s2, 1200)]),
    },
  };
}

test('analyze: 유지 구간마다 한 줄씩 낸다', () => {
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  assert.equal(r.steps.length, 2);
  assert.deepEqual(r.steps.map((s) => s.target), [60, 100]);
});

test('analyze: 도달률은 목표 대비 실제 반복 수다', () => {
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  assert.equal(r.steps[0].achievedPct, 100);      // 60 / 60
  assert.equal(r.steps[1].achievedPct, 90);       // 90 / 100
});

test('analyze: R_slo 는 통과한 계단과 걸린 계단을 함께 준다', () => {
  // 계단 간격이 40 iterations/s 라면 관측이 말할 수 있는 것은 "60 은 통과, 100 은 넘음"
  // 까지다. 한 값으로 못 박으면 다음 사람이 그 값을 잰 것으로 읽는다.
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  assert.equal(r.rSlo.step.target, 100);
  assert.equal(r.rSlo.lastOk.target, 60);
});

test('analyze: R_knee 도 구간으로 준다', () => {
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  assert.equal(r.rKnee.step.target, 100);
  assert.equal(r.rKnee.lastOk.target, 60);
});

test('analyze: 병목은 포화가 가장 심한 계단에서 고른다', () => {
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  // 둘째 계단이 CPU 7.6/8 = 95%, Tomcat 20/50 = 40%, Hikari 15/60 = 25%.
  assert.equal(r.bottleneck.at, 100);
  assert.equal(r.bottleneck.ranked[0].name, 'CPU');
  assert.equal(Math.round(r.bottleneck.ranked[0].pct), 95);
});

test('analyze: 도달률만 살짝 못 미친 여유로운 계단을 병목으로 삼지 않는다', () => {
  // 첫 계단이 97% 로 무릎 판정에 걸리지만 자원은 전부 한가하다. 무릎 계단 기준으로
  // 병목을 고르면 "CPU 25% 가 병목" 이라는 답이 나온다.
  const rec = record();
  const seg = (from, to, v) => [from, to, v];
  rec.series['k6ts.iterations'] = series([seg(60, 120, 58.2), seg(180, 240, 85)]);
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.rKnee.step.target, 60);   // 58.2/60 = 97%
  assert.equal(r.bottleneck.at, 100);      // 병목은 여전히 포화된 계단
});

test('analyze: 앱 스크레이프가 끊긴 계단은 판정에서 뺀다', () => {
  // 워커가 다 차면 /actuator/prometheus 도 같은 풀에서 응답하지 못해 Tomcat·Hikari 가
  // 정작 필요한 계단에서만 빈다. 그 계단을 "자원 여유 있음"으로 읽으면 정반대 결론이 된다.
  const rec = record();
  rec.series['pool.tomcatBusy'] = series([[30 + capacity.RATE_WINDOW_SEC, 120, 8]]);
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[1].valid, false);
  assert.equal(r.valid.length, 1);
  assert.equal(r.rSlo, null);   // 걸린 계단이 무효라 SLO 경계를 말할 수 없다
});

test('analyze: 처리율 상한은 실측 최대 반복 수다', () => {
  const r = capacity.analyze(record(), { sloP95Ms: 500 });
  assert.equal(r.ceiling.actualRate, 90);
  assert.equal(r.ceiling.target, 100);
});

test('analyze: 앞 30초를 버려 앞 계단 값이 섞이지 않는다', () => {
  // 둘째 계단의 앞 30초에 첫 계단 값(120ms)이 남아 있어도 중앙값이 오염되면 안 된다.
  const rec = record();
  rec.series['k6ts.p95'] = series([
    [30 + capacity.RATE_WINDOW_SEC, 120, 120],
    [150, 180, 120],   // 버려져야 하는 구간
    [180, 240, 900],
  ]);
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[1].p95Median, 900);
});

test('analyze: VU 가 maxVUs 에 닿은 계단을 표시하고 판정에서 뺀다', () => {
  const rec = record();
  rec.run.loadProfile.breakpoint.maxVUs = 1200;
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[0].generatorBound, false);
  assert.equal(r.steps[1].generatorBound, true);
  assert.equal(r.steps[1].valid, false);
});

test('analyze: iterations 축이 비면 도달률을 만들어내지 않는다', () => {
  const rec = record();
  rec.series['k6ts.iterations'] = [];
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[0].achievedPct, null);
  assert.equal(r.rKnee, null);
});

test('analyze: 한 표본만 튄 계단과 계속 차 있던 계단을 가른다', () => {
  // 최댓값만 보면 둘 다 100% 다. 앞은 순간 부하이고 뒤는 지속 포화라 대응이 다르다.
  const rec = record();
  const spike = [];
  const sustained = [];
  for (let i = 0; i < 12; i += 1) {
    spike.push({ t: T0_SEC + 60 + i * 5, v: i === 3 ? 50 : 8 });
    sustained.push({ t: T0_SEC + 180 + i * 5, v: i < 7 ? 50 : 20 });
  }
  rec.series['pool.tomcatBusy'] = [...spike, ...sustained];
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[0].tomcatPct, 100);      // 최댓값은 둘 다 100%
  assert.equal(r.steps[1].tomcatPct, 100);
  assert.equal(r.steps[0].tomcatSatCount, 1);   // 갈라지는 것은 표본 수다
  assert.equal(r.steps[1].tomcatSatCount, 7);
  assert.equal(r.bottleneck.at, 100);           // 지속 포화가 넓은 쪽을 고른다
});

test('analyze: 도달률이 한 계단에서만 임계를 스치면 무릎으로 세지 않는다', () => {
  // 실측에서 65 가 97.96% 로 걸렸다가 80 에서 99.59% 로 돌아온 적이 있다. 뒤 계단이
  // 회복하면 그건 용량 한계가 아니라 실행기 지터다.
  const rec = record();
  rec.series['k6ts.iterations'] = series([[60, 120, 58.5], [180, 240, 99]]);
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.steps[0].achievedPct, 97.5);   // 임계 아래
  assert.equal(r.steps[1].achievedPct, 99);     // 회복
  assert.equal(r.rKnee, null);
});

test('analyze: 마지막까지 회복하지 못하면 무릎으로 센다', () => {
  const rec = record();
  rec.series['k6ts.iterations'] = series([[60, 120, 58.5], [180, 240, 90]]);
  const r = capacity.analyze(rec, { sloP95Ms: 500 });
  assert.equal(r.rKnee.step.target, 60);
});

test('analyze: 시계열이 없는 옛 실행은 이유를 밝히고 멈춘다', () => {
  const rec = record();
  rec.series = {};
  assert.throws(() => capacity.analyze(rec, { sloP95Ms: 500 }), /series 가 없다/);
});
