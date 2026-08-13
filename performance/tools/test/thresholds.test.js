'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const url = require('url');

/**
 * scripts/lib/thresholds.js 는 ES 모듈이다(k6가 이 문법만 받는다). phases.test.js 와 같은
 * 이유로 각 테스트 안에서 `await import()`로 동적 로드한다.
 *
 * 이 파일이 검증하는 것은 "무엇을 어느 구간에서 판정하는가"다.
 *   - phase가 없는 실행(단독 스크립트·진단 시나리오)  → 전체 구간에 공통 SLO 적용
 *   - phase가 있는 시나리오                          → measure 구간에만 공통 SLO 적용
 * 후자에서 태그 없는 SLO가 하나라도 남으면 warmup 구간의 이상치가 그대로 실행을 FAIL로
 * 만든다 — warmup을 선언한 목적 자체가 사라지므로, 그 회귀를 여기서 잡는다.
 */
const esm = (rel) => import(url.pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'lib', rel)).href);
const loadThresholds = () => esm('thresholds.js');
const loadPhases = () => esm('phases.js');

/** 공통 SLO의 태그 없는 키 — PHASED_THRESHOLDS에 이 중 하나라도 있으면 안 된다. */
const BARE_SLO_KEYS = [
  'http_req_failed',
  'http_req_duration{op:read}',
  'http_req_duration{op:write}',
  'checks',
];

/** 위 키에 대응하는 measure-scoped selector — 태그 정렬 규칙(op → phase)까지 포함한다. */
const MEASURE_SLO_KEYS = [
  'http_req_failed{phase:measure}',
  'http_req_duration{op:read,phase:measure}',
  'http_req_duration{op:write,phase:measure}',
  'checks{phase:measure}',
];

// ---------------------------------------------------------------------------
// DEFAULT_THRESHOLDS — phase 없는 실행은 전체 구간을 그대로 판정한다
// ---------------------------------------------------------------------------
test('DEFAULT_THRESHOLDS: 태그 없는 공통 SLO를 그대로 갖는다 (전체 구간 판정 유지)', async () => {
  const { DEFAULT_THRESHOLDS, COMMON_SLO_THRESHOLDS } = await loadThresholds();
  for (const key of BARE_SLO_KEYS) {
    assert.ok(key in DEFAULT_THRESHOLDS, `${key} 가 DEFAULT_THRESHOLDS 에 있어야 한다`);
    assert.deepEqual(DEFAULT_THRESHOLDS[key], COMMON_SLO_THRESHOLDS[key]);
  }
});

test('DEFAULT_THRESHOLDS: phase로 스코프된 SLO는 들어 있지 않다', async () => {
  const { DEFAULT_THRESHOLDS } = await loadThresholds();
  const phaseScoped = Object.keys(DEFAULT_THRESHOLDS).filter((k) => k.includes('phase:'));
  assert.deepEqual(phaseScoped, [], 'phase 개념이 없는 실행에 phase 태그 축이 생기면 안 된다');
});

test('DEFAULT_THRESHOLDS: 기능별 분해축(BREAKDOWN)을 포함한다', async () => {
  const { DEFAULT_THRESHOLDS, BREAKDOWN_THRESHOLDS } = await loadThresholds();
  for (const key of Object.keys(BREAKDOWN_THRESHOLDS)) {
    assert.deepEqual(DEFAULT_THRESHOLDS[key], BREAKDOWN_THRESHOLDS[key], `${key} 축이 사라졌다`);
  }
});

// ---------------------------------------------------------------------------
// PHASED_THRESHOLDS — 실제 SLO는 measure 구간에만
// ---------------------------------------------------------------------------
test('PHASED_THRESHOLDS: 태그 없는 공통 SLO가 하나도 없다 (전체 구간 이중 판정 제거)', async () => {
  const { PHASED_THRESHOLDS } = await loadThresholds();
  for (const key of BARE_SLO_KEYS) {
    assert.ok(!(key in PHASED_THRESHOLDS), `${key} 가 남아 있으면 warmup 이상치로 실행이 FAIL 된다`);
  }
});

test('PHASED_THRESHOLDS: measure-scoped 공통 SLO를 값 그대로 갖는다', async () => {
  const { PHASED_THRESHOLDS, COMMON_SLO_THRESHOLDS } = await loadThresholds();
  const pairs = BARE_SLO_KEYS.map((bare, i) => [bare, MEASURE_SLO_KEYS[i]]);
  for (const [bare, scoped] of pairs) {
    assert.ok(scoped in PHASED_THRESHOLDS, `${scoped} 가 있어야 한다`);
    assert.deepEqual(PHASED_THRESHOLDS[scoped], COMMON_SLO_THRESHOLDS[bare], '기준값 자체는 바뀌지 않아야 한다');
  }
});

test('PHASED_THRESHOLDS: 판정용 항목은 전부 phase:measure 로 스코프돼 있다', async () => {
  const { PHASED_THRESHOLDS, BREAKDOWN_THRESHOLDS, PHASE_DIAGNOSTIC_THRESHOLDS } = await loadThresholds();
  const observability = new Set([
    ...Object.keys(BREAKDOWN_THRESHOLDS),
    ...Object.keys(PHASE_DIAGNOSTIC_THRESHOLDS),
  ]);
  const gates = Object.keys(PHASED_THRESHOLDS).filter((k) => !observability.has(k));
  assert.ok(gates.length > 0, '게이트가 하나도 없으면 이 테스트가 무의미하다');
  for (const key of gates) {
    assert.match(key, /phase:measure/, `${key} 는 measure 구간으로 스코프돼야 한다`);
  }
});

test('PHASED_THRESHOLDS: phase 진단축(집계 축 생성용)이 3개 phase 모두 유지된다', async () => {
  const { PHASED_THRESHOLDS, PHASE_DIAGNOSTIC_THRESHOLDS } = await loadThresholds();
  const metrics = ['http_req_duration', 'http_req_failed', 'checks', 'http_reqs', 'phase_iterations', 'iterations'];
  for (const phase of ['warmup', 'measure', 'rampdown']) {
    for (const metric of metrics) {
      const key = `${metric}{phase:${phase}}`;
      assert.ok(key in PHASE_DIAGNOSTIC_THRESHOLDS, `${key} 진단축이 사라졌다`);
      // measure의 http_req_duration/http_req_failed/checks 는 게이트 값이 진단값을 덮어쓴다.
      assert.ok(key in PHASED_THRESHOLDS, `${key} 축이 최종 집합에서 사라졌다 — p95/오류율/TPS 집계가 끊긴다`);
    }
  }
});

test('phase 진단축은 어떤 값에도 통과한다 (판정에 끼면 안 된다)', async () => {
  const { PHASE_DIAGNOSTIC_THRESHOLDS } = await loadThresholds();
  // 실측 근거: 오류율 축이 'rate<1'이면 warmup 요청이 전부 실패할 때(rate=1) FAIL 이 된다.
  // 진단축은 집계 축 생성이 목적이므로 상한 자체가 도달 불가능하거나 등호를 포함해야 한다.
  const ALWAYS_PASS = new Set(['p(99)<600000', 'rate<=1', 'rate>=0', 'count>=0']);
  for (const [key, exprs] of Object.entries(PHASE_DIAGNOSTIC_THRESHOLDS)) {
    for (const expr of exprs) {
      assert.ok(ALWAYS_PASS.has(expr), `${key}: '${expr}' 는 실패할 수 있는 표현식이다`);
    }
  }
});

test('PHASED_THRESHOLDS: 기능별 분해축도 그대로 유지된다', async () => {
  const { PHASED_THRESHOLDS, BREAKDOWN_THRESHOLDS } = await loadThresholds();
  for (const key of Object.keys(BREAKDOWN_THRESHOLDS)) {
    assert.deepEqual(PHASED_THRESHOLDS[key], BREAKDOWN_THRESHOLDS[key], `${key} 축이 사라졌다`);
  }
});

// ---------------------------------------------------------------------------
// measureOnly — 시나리오 고유 SLO를 measure로 옮기는 유일한 경로
// ---------------------------------------------------------------------------
test('measureOnly: 기존 태그가 있는 selector에 phase:measure를 병합한다', async () => {
  const { measureOnly } = await loadThresholds();
  const out = measureOnly({ 'http_req_duration{name:login}': ['p(95)<800'] });
  assert.deepEqual(Object.keys(out), ['http_req_duration{name:login,phase:measure}']);
  assert.deepEqual(out['http_req_duration{name:login,phase:measure}'], ['p(95)<800']);
});

test('measureOnly: 태그 없는 selector에는 phase:measure만 붙는다', async () => {
  const { measureOnly } = await loadThresholds();
  assert.deepEqual(Object.keys(measureOnly({ http_req_duration: ['p(95)<300'] })), ['http_req_duration{phase:measure}']);
});

test('measureOnly: 생성 키가 buildSelector 규칙(태그 이름 정렬)과 동일하다', async () => {
  const { measureOnly } = await loadThresholds();
  const { buildSelector } = await loadPhases();
  const out = measureOnly({ 'http_req_duration{op:write}': ['p(95)<500'] });
  const expected = buildSelector('http_req_duration', { op: 'write', phase: 'measure' });
  assert.deepEqual(Object.keys(out), [expected]);
});

test('measureOnly 결과는 공통 게이트와 같은 키가 되어 값을 덮어쓴다 (중복 적용 없음)', async () => {
  const { measureOnly, PHASED_THRESHOLDS } = await loadThresholds();
  // write-heavy / peak-hour 가 실제로 하는 일 — 같은 대상에 두 기준이 겹치면 안 된다.
  const override = measureOnly({
    'http_req_duration{op:write}': ['p(95)<500', { threshold: 'p(99)<3000', abortOnFail: true }],
    http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true }],
  });
  for (const key of Object.keys(override)) {
    assert.ok(key in PHASED_THRESHOLDS, `${key} 가 기존 게이트 키와 달라 중복 게이트가 된다`);
  }
  const merged = { ...PHASED_THRESHOLDS, ...override };
  assert.deepEqual(merged['http_req_failed{phase:measure}'], override['http_req_failed{phase:measure}']);
  assert.notDeepEqual(merged['http_req_failed{phase:measure}'], PHASED_THRESHOLDS['http_req_failed{phase:measure}'],
    '시나리오 값이 공통 게이트를 대체해야 한다 (1%와 2%가 동시에 걸리면 안 된다)');
});

test('measureOnly: abortOnFail/delayAbortEval 설정을 그대로 통과시킨다', async () => {
  const { measureOnly } = await loadThresholds();
  const spec = { threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '420s' };
  const out = measureOnly({ chat_ws_rtt: ['p(95)<500', spec] });
  assert.deepEqual(out['chat_ws_rtt{phase:measure}'], ['p(95)<500', spec]);
});

// ---------------------------------------------------------------------------
// abortDelayAfterMeasure — abort 평가가 measure 시작 전에 일어나지 않게 한다
// ---------------------------------------------------------------------------
test('abortDelayAfterMeasure: measure 시작 오프셋에 관측 시간을 더한다', async () => {
  const { abortDelayAfterMeasure } = await loadThresholds();
  const { buildPhasePlan } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'steady-state', warmupSec: 300, measureSec: 7200, rampdownSec: 300 });
  assert.equal(abortDelayAfterMeasure(plan, 600), '900s');
});

test('abortDelayAfterMeasure: 반환값은 언제나 measure 시작 이후를 가리킨다', async () => {
  const { abortDelayAfterMeasure } = await loadThresholds();
  const { buildPhasePlan, toSeconds } = await loadPhases();
  // 실제 시나리오 조합 (warmupSec, 원래 지연) — measure 시작 전에는 절대 평가되면 안 된다.
  const cases = [
    { warmupSec: 240, after: 180 }, // chat-heavy
    { warmupSec: 180, after: 120 }, // peak-hour
    { warmupSec: 120, after: 120 }, // registration-day
    { warmupSec: 300, after: 600 }, // soak
    { warmupSec: 180, after: 180 }, // write-heavy
  ];
  for (const { warmupSec, after } of cases) {
    const plan = buildPhasePlan({ mode: 'steady-state', warmupSec, measureSec: 900, rampdownSec: 120 });
    const delaySec = toSeconds(abortDelayAfterMeasure(plan, after));
    assert.ok(delaySec > plan.measureStartOffsetSec,
      `warmup ${warmupSec}s 인데 평가 시작이 ${delaySec}s — measure 시작 전에 중단될 수 있다`);
    assert.equal(delaySec, plan.measureStartOffsetSec + after, '원래 관측 시간이 바뀌면 안 된다');
  }
});

test('abortDelayAfterMeasure: warmup이 0이면 원래 지연 그대로다 (cold-start형)', async () => {
  const { abortDelayAfterMeasure } = await loadThresholds();
  const { buildPhasePlan } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cold-start', warmupSec: 0, measureSec: 630, rampdownSec: 0 });
  assert.equal(abortDelayAfterMeasure(plan, 60), '60s');
});

// ---------------------------------------------------------------------------
// cold-start — 초기 30초 ramp 자체가 측정 대상이라 SLO 평가에서 빠지면 안 된다
// ---------------------------------------------------------------------------
test('cold-start: warmupSec 0 이라 30초 ramp 구간 전체가 phase:measure 다', async () => {
  const { buildPhasePlan, phaseAt } = await loadPhases();
  const plan = buildPhasePlan({ mode: 'cold-start', warmupSec: 0, measureSec: 600 + 30, rampdownSec: 0 });
  for (const t of [0, 1, 15, 29, 30, 300, 629]) {
    assert.equal(phaseAt(plan, t), 'measure', `t=${t}s 가 measure 밖으로 빠졌다 — 콜드 구간이 판정에서 제외된다`);
  }
});

test('cold-start: measure-scoped 게이트가 곧 전체 실행 게이트다', async () => {
  const { PHASED_THRESHOLDS } = await loadThresholds();
  // 모든 트래픽이 phase:measure 로 태깅되므로, measure 게이트만 있어도 전 구간이 평가된다.
  for (const key of MEASURE_SLO_KEYS) {
    assert.ok(key in PHASED_THRESHOLDS, `${key} 가 없으면 cold-start 는 판정 자체가 사라진다`);
  }
});
