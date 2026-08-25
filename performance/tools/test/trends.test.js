'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const trends = require('../lib/trends');

/**
 * 실측 표본 — 계열 bfa06492dbb5 (normal-day / ramping-arrival-rate 4/s / medium) 9회.
 * 저장된 index.json 의 값을 그대로 옮겼다. 이 계열이 중요한 이유는 **9회 중 1회만
 * 커넥션 대기가 발생했고, 그 한 회차가 계열 전체의 CV 를 두 배 넘게 부풀린다**는 것이다.
 */
const SERIES = [
  { number: 1, p95: 305.3, p99: 2004, tps: 4.00, hikariPendingMax: 0, saturationStatus: null, gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 2, p95: 252.0, p99: 1834, tps: 3.98, hikariPendingMax: 0, saturationStatus: null, gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 3, p95: 275.7, p99: 1918, tps: 4.01, hikariPendingMax: 0, saturationStatus: null, gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 4, p95: 784.3, p99: 2530, tps: 4.03, hikariPendingMax: 21, saturationStatus: 'NEAR_LIMIT', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 5, p95: 357.7, p99: 2035, tps: 4.02, hikariPendingMax: 0, saturationStatus: 'HEADROOM', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 6, p95: 425.4, p99: 2210, tps: 4.00, hikariPendingMax: 0, saturationStatus: 'HEADROOM', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 7, p95: 286.4, p99: 1960, tps: 4.00, hikariPendingMax: 0, saturationStatus: 'HEADROOM', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 8, p95: 375.5, p99: 2078, tps: 3.98, hikariPendingMax: 0, saturationStatus: 'HEADROOM', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
  { number: 9, p95: 368.2, p99: 1679, tps: 3.98, hikariPendingMax: 0, saturationStatus: 'HEADROOM', gateFailures: ['k6.phases.measure.p99'], absoluteGateFailures: ['k6.phases.measure.p99'] },
];

test('stats: 표본 표준편차(n-1)를 쓴다 — n으로 나누면 변동성을 과소평가한다', () => {
  const s = trends.stats([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(s.n, 8);
  assert.equal(s.mean, 5);
  // 모표준편차는 2, 표본표준편차는 sqrt(32/7) ≈ 2.138
  assert.ok(Math.abs(s.sd - 2.138) < 0.01, `sd=${s.sd}`);
  assert.ok(Math.abs(s.cv - 42.76) < 0.1, `cv=${s.cv}`);
});

test('stats: 결측은 0이 아니라 없는 값이다', () => {
  const s = trends.stats([100, null, 200, undefined, NaN, 300]);
  assert.equal(s.n, 3);
  assert.equal(s.mean, 200);
});

test('stats: 표본이 1개 이하면 산포를 말할 수 없다', () => {
  assert.equal(trends.stats([42]), null);
  assert.equal(trends.stats([]), null);
});

test('stats: 평균이 0에 가까우면 CV를 내놓지 않는다', () => {
  const s = trends.stats([-1, 1, -1, 1]);
  assert.equal(s.cv, null, 'CV가 발산하는 구간에서는 큰 수보다 null이 정확하다');
});

test('mde: 표본이 늘면 검출 가능한 최소 효과가 작아진다', () => {
  const a = trends.mde(10, 4);
  const b = trends.mde(10, 16);
  assert.ok(a > b);
  // MDE = 2.8016 × 10 × sqrt(2/16) = 9.905
  assert.ok(Math.abs(b - 9.905) < 0.01, `mde=${b}`);
});

test('runsNeededFor: mde()의 역함수여야 한다 — 두 식이 어긋나면 조언이 거짓이 된다', () => {
  const cv = 18.05;
  const need = trends.runsNeededFor(10, cv);
  // 권고한 n으로 다시 MDE를 계산하면 목표치 이하여야 한다.
  assert.ok(trends.mde(cv, need.n) <= 10 + 1e-9, `mde(${need.n})=${trends.mde(cv, need.n)}`);
  // 한 회 적으면 목표를 못 맞춰야 한다(과잉 권고가 아님).
  assert.ok(trends.mde(cv, need.n - 1) > 10);
});

test('runsNeededFor: 도달 불가능한 요구는 상한에서 잘리고 그 사실을 알린다', () => {
  const need = trends.runsNeededFor(1, 42.28);
  assert.equal(need.capped, true, '수백 회는 "더 재라"가 아니라 "이렇게 해선 안 된다"는 뜻이다');
  assert.ok(need.exact > need.n);
});

test('regimeOf: 판정 없음을 여유 있음으로 승격시키지 않는다', () => {
  const g = trends.regimeOf({ saturationStatus: null, hikariPendingMax: 0 });
  assert.equal(g.status, 'UNASSESSED');
  assert.equal(g.source, 'none');
  assert.notEqual(g.status, 'HEADROOM');
});

test('regimeOf: 대기 발생은 체제 판정과 독립된 관측 사실이다', () => {
  // 판정이 없어도 대기 사실은 남는다 — 표본에서 뺄지 사람이 정할 수 있어야 하기 때문.
  const g = trends.regimeOf({ saturationStatus: null, hikariPendingMax: 21 });
  assert.equal(g.status, 'UNASSESSED');
  assert.equal(g.queued, true);
});

test('regimeMix: 체제가 섞인 계열을 잡아낸다', () => {
  const mix = trends.regimeMix(SERIES);
  assert.equal(mix.mixed, true, 'NEAR_LIMIT 1회 + HEADROOM 5회가 섞여 있다');
  assert.equal(mix.queued, 1);
});

test('핵심 회귀 — 대기 1회가 계열 CV를 두 배 넘게 부풀린다', () => {
  const all = trends.stats(SERIES.map((r) => r.p95));
  const clean = trends.stats(SERIES.filter((r) => !trends.regimeOf(r).queued).map((r) => r.p95));

  assert.equal(all.n, 9);
  assert.equal(clean.n, 8);
  assert.ok(Math.abs(all.cv - 42.28) < 0.1, `전체 CV=${all.cv}`);
  assert.ok(Math.abs(clean.cv - 18.05) < 0.1, `제외 CV=${clean.cv}`);
  // 이 배율이 체제 띠를 만든 이유다. 1.5배 아래로 좁혀지면 근거가 약해진 것이므로 알아야 한다.
  assert.ok(all.cv / clean.cv > 2, '한 회차가 변동성 추정을 2배 넘게 바꾼다');
});

test('sampleSets: 표본 구성 후보를 나란히 제시한다', () => {
  const sets = trends.sampleSets(SERIES);
  assert.deepEqual(sets.map((s) => s.key), ['all', 'no-queue', 'recent5']);
  assert.equal(sets[0].rows.length, 9);
  assert.equal(sets[1].rows.length, 8);
  assert.equal(sets[2].rows.length, 5);
});

test('sampleSets: 대기 회차가 없으면 제외 집합을 만들지 않는다', () => {
  const clean = SERIES.filter((r) => !r.hikariPendingMax);
  const sets = trends.sampleSets(clean);
  assert.ok(!sets.some((s) => s.key === 'no-queue'), '뺄 것이 없으면 같은 표본을 두 번 보여주지 않는다');
});

test('recommendAxis: 지연 축과 처리량 축을 각각 고른다', () => {
  const st = trends.stabilityOf(SERIES);
  const rec = trends.recommendAxis(st);
  // p99(CV 약 12%)가 p95(CV 42%)보다 예민하다 — 이 계열에서 판정 축을 재검토해야 하는 근거.
  assert.equal(rec.latency.key, 'p99');
  // 도착률을 고정했으므로 TPS는 극도로 안정적이다. 그건 "좋다"가 아니라 "우리가 고정했다"는 뜻이라
  // 지연 축과 반드시 분리해야 한다.
  assert.equal(rec.throughput.key, 'tps');
  assert.ok(rec.throughput.mde < rec.latency.mde);
});

test('failingAxes: 무엇이 실패시켰는지 세어 순위를 낸다', () => {
  const axes = trends.failingAxes(SERIES);
  assert.equal(axes.length, 1);
  assert.equal(axes[0].key, 'k6.phases.measure.p99');
  assert.equal(axes[0].runs, 9, '9회 전부 같은 축에서 실패했다 — 노이즈가 아니라 구조다');
  assert.equal(axes[0].absolute, 9, '절대 게이트라 기준선과 무관하게 걸렸다');
});

test('trendStat: 표본이 4개 미만이면 전반/후반을 나누지 않는다', () => {
  assert.equal(trends.trendStat([1, 2, 3]), null);
  assert.ok(trends.trendStat([1, 2, 3, 4]));
});

test('trendStat: 양 끝점이 아니라 절반씩의 중앙값을 비교한다', () => {
  // 마지막 값만 이상치인 계열 — 끝점 비교였다면 +900%로 읽힌다.
  const st = trendStatOf([100, 100, 100, 100, 100, 1000]);
  assert.ok(st.changePct < 250, `이상치 하나에 끌려가지 않아야 한다 (${st.changePct}%)`);
  function trendStatOf(v) { return trends.trendStat(v); }
});

test('seriesOf: 조건 해시가 다르면 같은 선에 잇지 않는다', () => {
  const grouped = trends.seriesOf([
    { scenario: 'normal-day', seriesHash: 'aaa' },
    { scenario: 'normal-day', seriesHash: 'bbb' },
    { scenario: 'normal-day', seriesHash: 'aaa' },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].rows.length, 2);
});

// ── 감시 레이어 축약 ────────────────────────────────────────────────────────
// 감시와 조사가 같은 계열에 대해 다른 말을 하면 안 된다. 축약도 계산이므로 여기서 고정한다.

test('headlineOf: 질문 수만큼 네 칸 — 지연/처리/비용/여유', () => {
  const h = trends.headlineOf(SERIES);
  assert.deepEqual(h.map((x) => x.title), ['지연', '처리', '비용', '여유']);
});

test('headlineOf: 지연 칸은 조사 화면의 권고 축과 같아야 한다', () => {
  const sets = trends.sampleSets(SERIES);
  const primary = sets.find((s) => s.key === 'no-queue');
  const rec = trends.recommendAxis(trends.stabilityOf(primary.rows));
  const h = trends.headlineOf(SERIES);
  assert.equal(h[0].key, rec.latency.key, '두 화면이 다른 축을 고르면 같은 계열에 다른 말을 하게 된다');
});

test('headlineOf: 값이 없는 칸을 0으로 채우지 않는다', () => {
  const noCost = SERIES.map((r) => ({ ...r, stackCpuMsPerReq: null }));
  const h = trends.headlineOf(noCost);
  assert.equal(h[2].current, null);
  assert.equal(h[2].stats, null, '미수집은 0이 아니라 없는 값이다');
});

test('pickHeadroom: 포화도가 가장 높은 자원을 자동으로 고른다', () => {
  const rows = [{ cpuMaxPct: 50, hikariPct: 20, heapPct: 71 }];
  assert.equal(trends.pickHeadroom(rows).key, 'heapPct');
  // 병목이 옮겨 가면 칸도 따라간다 — 고정 지표였다면 못 보는 변화다.
  assert.equal(trends.pickHeadroom([{ cpuMaxPct: 95, hikariPct: 20, heapPct: 71 }]).key, 'cpuMaxPct');
});

test('pickHeadroom: 후보가 전부 결측이면 아무것도 고르지 않는다', () => {
  assert.equal(trends.pickHeadroom([{ cpuMaxPct: null, hikariPct: null, heapPct: null }]), null);
});

test('stabilityLine: 대기 발생 회차를 제외한 표본을 기본으로 쓰고 그 사실을 밝힌다', () => {
  const line = trends.stabilityLine(SERIES);
  assert.equal(line.sampleLabel, '대기 발생 회차 제외');
  assert.equal(line.n, 8);
  assert.equal(line.excluded, 1, '몇 회를 뺐는지 말하지 않으면 근거 없는 수치가 된다');
  assert.equal(line.axis.key, 'p99');
});

test('dominantFailure: 지배적인 축 하나와 나머지 개수만 낸다 (전체 목록은 조사 화면 몫)', () => {
  const rows = SERIES.map((r, i) => (i < 2
    ? { ...r, gateFailures: [...r.gateFailures, 'infra.flat.cpu.throttledPct'] }
    : r));
  const d = trends.dominantFailure(rows);
  assert.equal(d.key, 'k6.phases.measure.p99');
  assert.equal(d.runs, 9);
  assert.equal(d.allRuns, true);
  assert.equal(d.others, 1);
});

test('dominantFailure: 실패가 없으면 null', () => {
  assert.equal(trends.dominantFailure([{ gateFailures: [] }]), null);
});
