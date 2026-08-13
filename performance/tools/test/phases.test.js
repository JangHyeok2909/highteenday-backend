'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * scripts/lib/phases.js 는 ES 모듈이다(k6가 이 문법만 받는다 — scripts/lib 의 다른 파일과 동일).
 * CJS 테스트 파일에서는 top-level await 를 쓸 수 없으므로, 각 테스트 콜백 안에서
 * `await import()`로 동적 로드한다. Node가 이걸 ESM으로 해석하려면 performance/scripts/
 * 아래에 `{"type":"module"}`을 선언한 package.json이 있어야 한다(추가해 둠).
 */
const phasesUrl = require('path').join(__dirname, '..', '..', 'scripts', 'lib', 'phases.js');
const phasesHref = require('url').pathToFileURL(phasesUrl).href;

async function loadPhases() {
  return import(phasesHref);
}

// ---------------------------------------------------------------------------
// toSeconds — duration 정규화
// ---------------------------------------------------------------------------
test('toSeconds: 5m 과 300s 는 같은 값으로 정규화된다', async () => {
  const { toSeconds } = await loadPhases();
  assert.equal(toSeconds('5m'), 300);
  assert.equal(toSeconds('300s'), 300);
  assert.equal(toSeconds(300), 300);
  assert.equal(toSeconds('300'), 300);
});

test('toSeconds: ms/h 단위도 초로 정규화된다', async () => {
  const { toSeconds } = await loadPhases();
  assert.equal(toSeconds('1h'), 3600);
  assert.equal(toSeconds('500ms'), 0.5);
});

test('toSeconds: 값이 없으면 fallback을 쓴다 (0과 미지정을 구분)', async () => {
  const { toSeconds } = await loadPhases();
  assert.equal(toSeconds(undefined, 60), 60);
  assert.equal(toSeconds(null, 60), 60);
  assert.equal(toSeconds('', 60), 60);
  assert.equal(toSeconds(0, 60), 0); // 명시적 0은 fallback을 쓰지 않는다
});

test('toSeconds: fallback 도 없이 값이 없으면 throw', async () => {
  const { toSeconds } = await loadPhases();
  assert.throws(() => toSeconds(undefined));
});

test('toSeconds: 파싱 불가/음수는 throw (조용히 기본값으로 빠지지 않는다)', async () => {
  const { toSeconds } = await loadPhases();
  assert.throws(() => toSeconds('five minutes'));
  assert.throws(() => toSeconds('-5m'));
  assert.throws(() => toSeconds(-1));
  assert.throws(() => toSeconds(NaN));
});

test('toSeconds: measure 0 은 유효한 값이다', async () => {
  const { toSeconds } = await loadPhases();
  assert.equal(toSeconds('0s'), 0);
  assert.equal(toSeconds(0), 0);
});

// ---------------------------------------------------------------------------
// buildPhasePlan
// ---------------------------------------------------------------------------
test('buildPhasePlan: 초 단위 필드와 파생 오프셋을 정규화한다', async () => {
  const { buildPhasePlan } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'steady-state', warmupSec: 300, measureSec: 1200, rampdownSec: 120 });
  assert.equal(plan.measureStartOffsetSec, 300);
  assert.equal(plan.measureEndOffsetSec, 1500);
  assert.equal(plan.gatePhase, 'measure');
  assert.equal(plan.schemaVersion, 1);
});

test('buildPhasePlan: gatePhase 는 measure 또는 null만 허용', async () => {
  const { buildPhasePlan } = await loadPhases();
  assert.throws(() => buildPhasePlan({ warmupSec: 0, measureSec: 60, rampdownSec: 0, gatePhase: 'bogus' }));
  assert.doesNotThrow(() => buildPhasePlan({ warmupSec: 0, measureSec: 60, rampdownSec: 0, gatePhase: null }));
});

// ---------------------------------------------------------------------------
// phaseAt — 경계 직전/정확/직후 + warmup=0 케이스
// ---------------------------------------------------------------------------
test('phaseAt: warmup → measure → rampdown 경계', async () => {
  const { buildPhasePlan, phaseAt } = await loadPhases();
  const plan = buildPhasePlan({ warmupSec: 300, measureSec: 1200, rampdownSec: 120 });

  assert.equal(phaseAt(plan, 0), 'warmup');
  assert.equal(phaseAt(plan, 299), 'warmup');       // 경계 직전
  assert.equal(phaseAt(plan, 300), 'measure');       // 경계 정확
  assert.equal(phaseAt(plan, 301), 'measure');       // 경계 직후
  assert.equal(phaseAt(plan, 1499), 'measure');      // 다음 경계 직전
  assert.equal(phaseAt(plan, 1500), 'rampdown');     // 경계 정확
  assert.equal(phaseAt(plan, 1501), 'rampdown');     // 경계 직후
  assert.equal(phaseAt(plan, 999999), 'rampdown');   // 종료 후에도 rampdown 유지
});

test('phaseAt: warmup=0 이면 t=0부터 곧바로 measure', async () => {
  const { buildPhasePlan, phaseAt } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cold-start', warmupSec: 0, measureSec: 600, rampdownSec: 0 });
  assert.equal(phaseAt(plan, 0), 'measure');
  assert.equal(phaseAt(plan, 599), 'measure');
  assert.equal(phaseAt(plan, 600), 'rampdown'); // rampdown이 0이어도 논리상 그 이후는 rampdown으로 분류
});

// ---------------------------------------------------------------------------
// stagesFor / startVusFor — iteration이 경계를 넘는 실제 stage 구조를 만드는지
// ---------------------------------------------------------------------------
test('stagesFor: warmup/rampdown이 0이면 해당 stage를 생략한다', async () => {
  const { buildPhasePlan, stagesFor, startVusFor } = await loadPhases();
  const full = buildPhasePlan({ warmupSec: 300, measureSec: 1200, rampdownSec: 120 });
  assert.deepEqual(stagesFor(full, 200), [
    { duration: '300s', target: 200 },
    { duration: '1200s', target: 200 },
    { duration: '120s', target: 0 },
  ]);
  assert.equal(startVusFor(full, 200), 0);

  const noWarmup = buildPhasePlan({ warmupSec: 0, measureSec: 600, rampdownSec: 0 });
  assert.deepEqual(stagesFor(noWarmup, 100), [{ duration: '600s', target: 100 }]);
  assert.equal(startVusFor(noWarmup, 100), 100);
});

// ---------------------------------------------------------------------------
// parseSelector / buildSelector — 태그 순서 무관성
// ---------------------------------------------------------------------------
test('parseSelector: 태그 없는 metric', async () => {
  const { parseSelector } = await loadPhases();
  assert.deepEqual(parseSelector('http_req_failed'), { metric: 'http_req_failed', tags: {} });
});

test('parseSelector: 태그 1개 이상', async () => {
  const { parseSelector } = await loadPhases();
  assert.deepEqual(parseSelector('http_req_duration{op:read}'), {
    metric: 'http_req_duration', tags: { op: 'read' },
  });
  assert.deepEqual(parseSelector('http_req_duration{phase:measure,op:read}'), {
    metric: 'http_req_duration', tags: { phase: 'measure', op: 'read' },
  });
});

test('buildSelector: 태그 키 정렬로 순서가 달라도 같은 selector', async () => {
  const { buildSelector } = await loadPhases();
  const a = buildSelector('http_req_duration', { phase: 'measure', op: 'read' });
  const b = buildSelector('http_req_duration', { op: 'read', phase: 'measure' });
  assert.equal(a, b);
  assert.equal(a, 'http_req_duration{op:read,phase:measure}');
});

test('parseSelector → buildSelector 라운드트립은 태그 순서와 무관하게 동일 결과', async () => {
  const { parseSelector, buildSelector } = await loadPhases();
  const p1 = parseSelector('http_req_duration{phase:measure,op:read}');
  const p2 = parseSelector('http_req_duration{op:read,phase:measure}');
  assert.equal(buildSelector(p1.metric, p1.tags), buildSelector(p2.metric, p2.tags));
});

// ---------------------------------------------------------------------------
// scopeThresholds — threshold selector 병합 헬퍼
// ---------------------------------------------------------------------------
test('scopeThresholds: 태그 없는 metric에 phase 태그를 추가한다', async () => {
  const { scopeThresholds } = await loadPhases();
  const out = scopeThresholds({ http_req_failed: ['rate<0.01'], checks: ['rate>0.99'] }, { phase: 'measure' });
  assert.deepEqual(out, {
    'http_req_failed{phase:measure}': ['rate<0.01'],
    'checks{phase:measure}': ['rate>0.99'],
  });
});

test('scopeThresholds: 기존 태그가 있는 metric에 병합한다 (사용자 예시)', async () => {
  const { scopeThresholds } = await loadPhases();
  const out = scopeThresholds({ 'http_req_duration{op:read}': ['p(95)<300', 'p(99)<800'] }, { phase: 'measure' });
  assert.deepEqual(out, {
    'http_req_duration{op:read,phase:measure}': ['p(95)<300', 'p(99)<800'],
  });
});

test('scopeThresholds: 이미 같은 태그 키가 있으면 병합 값이 덮어쓴다', async () => {
  const { scopeThresholds } = await loadPhases();
  const out = scopeThresholds({ 'http_req_duration{phase:warmup}': ['p(95)<9999'] }, { phase: 'measure' });
  assert.deepEqual(out, { 'http_req_duration{phase:measure}': ['p(95)<9999'] });
});

test('scopeThresholds: 결과는 buildSelector와 동일한 태그 정렬을 쓴다', async () => {
  const { scopeThresholds, parseSelector } = await loadPhases();
  const out = scopeThresholds({ 'http_req_duration{feature:post}': ['p(99)<600000'] }, { phase: 'measure' });
  const key = Object.keys(out)[0];
  const { tags } = parseSelector(key);
  assert.deepEqual(tags, { feature: 'post', phase: 'measure' });
});

// ---------------------------------------------------------------------------
// trendStats
// ---------------------------------------------------------------------------
test('trendStats: 없는 분위수는 0이 아니라 null (p(99) 미측정 케이스)', async () => {
  const { trendStats } = await loadPhases();
  const out = trendStats({ avg: 10, min: 1, max: 50, 'p(90)': 20, 'p(95)': 30 }); // p(99) 없음
  assert.equal(out.p99, null);
  assert.equal(out.p95, 30);
});

test('trendStats: 값이 없으면 null 을 반환한다', async () => {
  const { trendStats } = await loadPhases();
  assert.equal(trendStats(null), null);
  assert.equal(trendStats(undefined), null);
});

// ---------------------------------------------------------------------------
// metricsByPhase — S-17 회귀 테스트: cache-warm의 warmup/measurement가 한 overall로
// 섞이던 문제. multi-tag(phase+op) 서브메트릭도 별도 축으로 안전하게 공존해야 한다.
// ---------------------------------------------------------------------------
function fakeK6Metrics() {
  return {
    'http_req_duration{phase:warmup}': { values: { avg: 500, 'p(95)': 900, 'p(99)': 1200 } },
    'http_req_duration{phase:measure}': { values: { avg: 50, 'p(95)': 100, 'p(99)': 200 } },
    'http_reqs{phase:warmup}': { values: { count: 100, rate: 0.33 } },
    'http_reqs{phase:measure}': { values: { count: 5000, rate: 4.16 } },
    'http_req_failed{phase:warmup}': { values: { rate: 0.02 } },
    'http_req_failed{phase:measure}': { values: { rate: 0.001 } },
    'checks{phase:warmup}': { values: { rate: 0.9, passes: 90, fails: 10 } },
    'checks{phase:measure}': { values: { rate: 0.999, passes: 4995, fails: 5 } },
    'phase_iterations{phase:warmup}': { values: { count: 50 } },
    'phase_iterations{phase:measure}': { values: { count: 2000 } },
    // op 태그가 섞인 게이트용 서브메트릭 — bare {phase:measure} 축과 별개로 공존해야 한다.
    'http_req_duration{op:read,phase:measure}': { values: { avg: 40, 'p(95)': 80 } },
  };
}

test('metricsByPhase: plan이 없으면 빈 객체', async () => {
  const { metricsByPhase } = await loadPhases();
  assert.deepEqual(metricsByPhase(fakeK6Metrics(), null), {});
});

test('metricsByPhase: warmup/measure를 서로 다른 값으로 분리한다 (S-17)', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cache-warm', warmupSec: 300, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase(fakeK6Metrics(), plan);

  assert.equal(out.warmup.p95, 900);
  assert.equal(out.measure.p95, 100);
  assert.notEqual(out.warmup.p95, out.measure.p95);
  assert.equal(out.rampdown, undefined); // rampdownSec:0 이므로 버킷 자체가 없다
});

test('metricsByPhase: measure의 오류율/RPS/TPS/checks를 정확히 추출한다', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const plan = buildPhasePlan({ warmupSec: 300, measureSec: 500, rampdownSec: 0 });
  const out = metricsByPhase(fakeK6Metrics(), plan);

  assert.equal(out.measure.errorRate, 0.001);
  assert.equal(out.measure.rps, 4.16);
  assert.equal(out.measure.tps, 2000 / 500); // phase_iterations{phase:measure}.count / measureSec
  assert.equal(out.measure.checkRate, 0.999);
  assert.equal(out.measure.checksPassed, 4995);
});

test('metricsByPhase: 시간이 배정되지 않은 phase는 버킷을 만들지 않는다 (cold-start형 plan)', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cold-start', warmupSec: 0, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase(fakeK6Metrics(), plan);
  assert.equal(out.warmup, undefined);
  assert.equal(out.rampdown, undefined);
  assert.ok(out.measure);
});

test('metricsByPhase: op 태그가 섞인 게이트용 서브메트릭({op:read,phase:measure})은 bare 축과 공존하고 서로 섞이지 않는다', async () => {
  const { buildPhasePlan, metricsByPhase, parseSelector } = await loadPhases();
  const m = fakeK6Metrics();
  const plan = buildPhasePlan({ warmupSec: 300, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase(m, plan);

  // bare {phase:measure} 축은 op:read 값(avg 40)이 아니라 전체 평균(avg 50)이어야 한다.
  assert.equal(out.measure.avg, 50);

  // op:read,phase:measure 서브메트릭 자체는 원본 m에 온전히 남아 있다 — multi-tag 파싱이
  // 손실 없이 이뤄졌는지 별도로 확인.
  const opReadKey = Object.keys(m).find((k) => {
    const { metric, tags } = parseSelector(k);
    return metric === 'http_req_duration' && tags.op === 'read' && tags.phase === 'measure';
  });
  assert.ok(opReadKey, 'op:read,phase:measure 조합을 파싱으로 찾을 수 있어야 한다');
  assert.equal(m[opReadKey].values.avg, 40);
});

// ---------------------------------------------------------------------------
// iteration 수 소스 폴백 — cache-warm처럼 executor 태그로 phase를 나누는 시나리오는
// setActivePhasePlan()을 부르지 않아 workload.js의 phase_iterations Counter가 한 번도
// 증가하지 않는다. 그때 k6 builtin iterations{phase:X}로 폴백하지 않으면 TPS가 0으로 찍힌다.
// ---------------------------------------------------------------------------

/** cache-warm 형태: 정적 executor 태그라 커스텀 Counter는 0, builtin iterations에 값이 있다. */
function staticTaggedMetrics() {
  return {
    'http_req_duration{phase:warmup}': { values: { avg: 500, 'p(95)': 900 } },
    'http_req_duration{phase:measure}': { values: { avg: 50, 'p(95)': 100 } },
    'phase_iterations{phase:warmup}': { values: { count: 0 } },
    'phase_iterations{phase:measure}': { values: { count: 0 } },
    'iterations{phase:warmup}': { values: { count: 300 } },
    'iterations{phase:measure}': { values: { count: 1800 } },
  };
}

test('metricsByPhase: phase_iterations가 0이면 builtin iterations{phase:X}로 TPS를 계산한다 (cache-warm)', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cache-warm', warmupSec: 300, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase(staticTaggedMetrics(), plan);

  assert.equal(out.warmup.iterations, 300);
  assert.equal(out.warmup.tps, 300 / 300);
  assert.equal(out.measure.iterations, 1800);
  assert.equal(out.measure.tps, 1800 / 600);
});

test('metricsByPhase: phase_iterations에 값이 있으면 builtin iterations보다 우선한다', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const m = fakeK6Metrics();
  // 동적 태깅 시나리오에서도 builtin 축은 선언돼 있다(보통 0이지만 값이 들어와도 져야 한다).
  m['iterations{phase:measure}'] = { values: { count: 9999 } };
  const plan = buildPhasePlan({ warmupSec: 300, measureSec: 500, rampdownSec: 0 });
  const out = metricsByPhase(m, plan);

  assert.equal(out.measure.iterations, 2000);       // phase_iterations 쪽 값
  assert.equal(out.measure.tps, 2000 / 500);
});

test('metricsByPhase: 두 소스 모두 비어 있으면 tps/iterations는 0이 아니라 null이다', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const m = {
    'http_req_duration{phase:measure}': { values: { avg: 50, 'p(95)': 100 } },
    'phase_iterations{phase:measure}': { values: { count: 0 } },
    'iterations{phase:measure}': { values: { count: 0 } },
  };
  const plan = buildPhasePlan({ warmupSec: 0, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase(m, plan);

  assert.equal(out.measure.tps, null);
  assert.equal(out.measure.iterations, null);
  assert.equal(out.measure.p95, 100); // 나머지 지표는 정상적으로 남는다
});

test('metricsByPhase: builtin iterations{phase:X} 축만 있어도 그 phase 버킷을 만든다', async () => {
  const { buildPhasePlan, metricsByPhase } = await loadPhases();
  const plan = buildPhasePlan({ warmupSec: 0, measureSec: 600, rampdownSec: 0 });
  const out = metricsByPhase({ 'iterations{phase:measure}': { values: { count: 1200 } } }, plan);

  assert.ok(out.measure, 'iterations 축만 존재해도 버킷이 있어야 한다');
  assert.equal(out.measure.tps, 1200 / 600);
});
