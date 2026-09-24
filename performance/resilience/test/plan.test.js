'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

const FAULTS = path.join(__dirname, '..', 'faults');

function basePlan(over = {}) {
  return {
    id: 'x', question: 'q',
    load: { rate: 4 },
    phases: { preSec: 300, faultSec: 60, postSec: 300 },
    inject: [
      { at: 'fault.start', tool: 'docker', action: 'stop', container: 'perf-redis' },
      { at: 'fault.end', tool: 'docker', action: 'start', container: 'perf-redis' },
    ],
    expect: ['e'],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// validatePlan — faults/ 의 계획 파일은 전부 유효해야 한다
// ---------------------------------------------------------------------------
test('faults/*.json 은 전부 검증을 통과한다', () => {
  for (const f of fs.readdirSync(FAULTS).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(FAULTS, f), 'utf8'));
    assert.deepEqual(plan.validatePlan(p), [], `${f}`);
  }
});

test('validatePlan: 가설 없는 계획은 거부한다', () => {
  const errs = plan.validatePlan(basePlan({ expect: [] }));
  assert.ok(errs.some((e) => /expect/.test(e)));
});

test('validatePlan: faultSec 0 은 거부한다', () => {
  const errs = plan.validatePlan(basePlan({ phases: { preSec: 10, faultSec: 0, postSec: 10 } }));
  assert.ok(errs.some((e) => /faultSec/.test(e)));
});

test('validatePlan: toxiproxy add 에는 toxic{name,type} 이 필요하다', () => {
  const errs = plan.validatePlan(basePlan({ inject: [{ at: 'fault.start', tool: 'toxiproxy', action: 'add', proxy: 'redis', toxic: { name: 'x' } }] }));
  assert.ok(errs.some((e) => /toxic\{name,type\}/.test(e)));
});

test('validatePlan: 모르는 load.scenario 를 잡는다', () => {
  const errs = plan.validatePlan(basePlan({ load: { rate: 4, scenario: 'retry-strom' } }));
  assert.ok(errs.some((e) => /load\.scenario 를 모른다/.test(e)));
  // 오타가 아니라 아는 이름이면 통과한다.
  assert.deepEqual(plan.validatePlan(basePlan({ load: { rate: 4, scenario: 'retry-storm' } })), []);
});

test('validatePlan: 계단은 fault-breakpoint 에서만 쓴다', () => {
  const errs = plan.validatePlan(basePlan({
    load: { rate: 4, scenario: 'retry-storm', steps: [4, 8], stepRampSec: 30, stepHoldSec: 90 },
    phases: { preSec: 10, faultSec: 240, postSec: 10 },
  }));
  assert.ok(errs.some((e) => /load\.steps 는 fault-breakpoint 에서만/.test(e)));
});

test('validatePlan: requires.appProxy 는 불리언이어야 한다', () => {
  const errs = plan.validatePlan(basePlan({ requires: { appProxy: 'yes' } }));
  assert.ok(errs.some((e) => /appProxy/.test(e)));
  assert.deepEqual(plan.validatePlan(basePlan({ requires: { appProxy: true } })), []);
});

test('validatePlan: 모르는 tool·at 형식을 잡는다', () => {
  const errs = plan.validatePlan(basePlan({ inject: [{ at: 'sometime', tool: 'magic' }] }));
  assert.ok(errs.some((e) => /tool 을 모른다/.test(e)));
  assert.ok(errs.some((e) => /at 형식/.test(e)));
});

// ---------------------------------------------------------------------------
// resolveAt / schedule — 주입 시각
// ---------------------------------------------------------------------------
test('resolveAt: 앵커와 오프셋', () => {
  const ph = { preSec: 300, faultSec: 60, postSec: 300 };
  assert.equal(plan.resolveAt('run.start', ph), 0);
  assert.equal(plan.resolveAt('fault.start', ph), 300);
  assert.equal(plan.resolveAt('fault.end', ph), 360);
  assert.equal(plan.resolveAt('run.end', ph), 660);
  assert.equal(plan.resolveAt('fault.start+30', ph), 330);
  assert.equal(plan.resolveAt('fault.end-5.5', ph), 354.5);
  assert.equal(plan.resolveAt(42, ph), 42);
});

test('schedule: 시각순 정렬, 같은 시각은 선언 순서', () => {
  const p = basePlan({ inject: [
    { at: 'fault.end', tool: 'docker', action: 'start', container: 'a' },
    { at: 'fault.start', tool: 'docker', action: 'stop', container: 'a' },
    { at: 'fault.start', tool: 'docker', action: 'pause', container: 'b' },
  ] });
  const s = plan.schedule(p);
  assert.deepEqual(s.map((x) => [x.plannedAtSec, x.action]), [[300, 'stop'], [300, 'pause'], [360, 'start']]);
});

// ---------------------------------------------------------------------------
// phaseWindows — Prometheus 조회 창
// ---------------------------------------------------------------------------
test('phaseWindows: 세 창이 t0 기준으로 이어지고 durationSec 가 맞다', () => {
  const t0 = new Date('2026-09-08T10:00:00Z');
  const w = plan.phaseWindows(t0, { preSec: 300, faultSec: 60, postSec: 300 });
  assert.equal(w.pre.from.toISOString(), '2026-09-08T10:00:00.000Z');
  assert.equal(w.pre.to.toISOString(), '2026-09-08T10:05:00.000Z');
  assert.equal(w.fault.from.toISOString(), '2026-09-08T10:05:00.000Z');
  assert.equal(w.fault.to.toISOString(), '2026-09-08T10:06:00.000Z');
  assert.equal(w.post.to.toISOString(), '2026-09-08T10:11:00.000Z');
  assert.equal(w.fault.durationSec, 60);
  assert.equal(w.fault.mode, 'fault-window:fault');
});

test('phaseWindows: 길이 0 인 구간은 만들지 않는다', () => {
  const w = plan.phaseWindows(new Date(), { preSec: 0, faultSec: 60, postSec: 0 });
  assert.deepEqual(Object.keys(w), ['fault']);
});

// ---------------------------------------------------------------------------
// relabel — k6 phase 이름 되돌리기
// ---------------------------------------------------------------------------
test('relabelPhases: warmup/measure/rampdown → pre/fault/post', () => {
  const out = plan.relabelPhases({ warmup: { p95: 1 }, measure: { p95: 2 }, rampdown: { p95: 3 } });
  assert.deepEqual(out, { pre: { p95: 1 }, fault: { p95: 2 }, post: { p95: 3 } });
});

test('relabelBreakdown: byPhase 의 키만 바꾸고 나머지는 그대로', () => {
  const out = plan.relabelBreakdown({ feature: { hot: { count: 10, p95: 5, byPhase: { measure: { p95: 9 }, warmup: { p95: 1 } } } } });
  assert.deepEqual(out.feature.hot, { count: 10, p95: 5, byPhase: { fault: { p95: 9 }, pre: { p95: 1 } } });
});

test('failedLatencyByPhase: 실패 표본이 없는 구간은 count 0 만', () => {
  const raw = {
    'http_reqs{expected_response:false,phase:measure}': { values: { count: 12 } },
    'http_req_duration{expected_response:false,phase:measure}': { values: { med: 30001, 'p(90)': 30010, 'p(95)': 30020, max: 60001 } },
    'http_reqs{expected_response:false,phase:warmup}': { values: { count: 0 } },
  };
  const out = plan.failedLatencyByPhase(raw);
  assert.deepEqual(out.pre, { count: 0 });
  assert.equal(out.fault.count, 12);
  assert.equal(out.fault.max, 60001);
  assert.deepEqual(out.post, { count: 0 });
});

test('featureByPhase: 기능 × 구간의 요청·p95·오류율', () => {
  const raw = {
    'http_reqs{feature:hot,phase:measure}': { values: { count: 40 } },
    'http_req_duration{feature:hot,phase:measure}': { values: { 'p(95)': 1234, max: 5000 } },
    'http_req_failed{feature:hot,phase:measure}': { values: { rate: 0.5 } },
  };
  const out = plan.featureByPhase(raw, ['hot', 'school']);
  assert.deepEqual(out.hot.fault, { count: 40, p95: 1234, max: 5000, errorRate: 0.5 });
  assert.equal(out.hot.pre.count, 0);
  assert.equal(out.school.fault.count, 0);
});

test('statusByPhase: 구간 × 상태 코드를 세고 없는 코드는 빼고 총합을 낸다', () => {
  const raw = {
    'http_reqs{phase:measure,status:500}': { values: { count: 12 } },
    'http_req_duration{phase:measure,status:500}': { values: { 'p(95)': 30001, max: 30050 } },
    'http_reqs{phase:measure,status:0}': { values: { count: 3 } },
    'http_req_duration{phase:measure,status:0}': { values: { 'p(95)': 60000, max: 60001 } },
    'http_reqs{phase:warmup,status:500}': { values: { count: 0 } },
  };
  const out = plan.statusByPhase(raw, ['0', '500', '503']);
  assert.equal(out.fault.total, 15);
  assert.equal(out.fault.byStatus['500'].count, 12);
  assert.equal(out.fault.byStatus['500'].p95, 30001);
  assert.equal(out.fault.byStatus['0'].count, 3);
  assert.ok(!('503' in out.fault.byStatus), '한 건도 없는 코드는 행을 만들지 않는다');
  assert.equal(out.pre.total, 0, 'count 0 은 세지 않는다');
});

test('contentChecksByPhase: 구간별 통과·실패 건수를 세고 축이 없으면 null 로 남긴다', () => {
  const raw = {
    'checks{check:hot_daily_nonempty,phase:warmup}': { values: { rate: 1, passes: 100, fails: 0 } },
    'checks{check:hot_daily_nonempty,phase:measure}': { values: { rate: 0.5, passes: 20, fails: 20 } },
    'checks{check:hot_daily_nonempty,phase:rampdown}': { values: { rate: 1, passes: 0, fails: 0 } },
  };
  const out = plan.contentChecksByPhase(raw, ['hot_daily_nonempty', 'post_list_nonempty']);

  assert.deepEqual(out.hot_daily_nonempty.pre, { total: 100, passes: 100, fails: 0, rate: 1 });
  assert.deepEqual(out.hot_daily_nonempty.fault, { total: 40, passes: 20, fails: 20, rate: 0.5 });
  assert.equal(out.hot_daily_nonempty.post.total, 0, '축은 있는데 표본이 없으면 0 이다');

  // 이 구분이 핵심이다. 축 자체가 없는 것을 0 으로 적으면 "검사가 꺼져 있었다"가
  // "전부 통과했다"로 읽혀, 없는 근거로 안심하게 된다.
  assert.deepEqual(out.post_list_nonempty.fault,
    { total: null, passes: null, fails: null, rate: null },
    '선언되지 않은 축은 0 이 아니라 모름이다');
});

/**
 * 내용 검사 이름이 세 곳에 흩어져 있고, 어긋나도 아무것도 에러를 내지 않는다.
 *
 *   1. 검사를 부르는 곳       scripts/boards.js, scripts/posts.js 의 contentCheck(res, '<이름>', ...)
 *   2. 집계 축을 선언하는 곳  resilience/scenarios/fault-window.js 의 CONTENT_CHECK_NAMES
 *   3. 결과를 읽는 곳         resilience/fault-run.js 의 CONTENT_CHECK_NAMES
 *
 * 1 에만 있으면 k6 가 서브메트릭을 안 만들어 구간별 분해가 통째로 비고, 2·3 에만 있으면
 * 표에 "표본 없음" 행이 영원히 남는다. 둘 다 12분짜리 실행이 끝난 뒤에야 눈치챈다.
 */
test('내용 검사 이름이 호출부·축 선언·읽는 쪽 세 곳에서 같다', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const namesIn = (src, constName) => {
    const block = src.match(new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    assert.ok(block, `${constName} 선언을 못 찾았다`);
    return [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
  };

  const declared = namesIn(read('scenarios', 'fault-window.js'), 'CONTENT_CHECK_NAMES');
  const consumed = namesIn(read('fault-run.js'), 'CONTENT_CHECK_NAMES');
  const scripts = read('..', 'scripts', 'boards.js') + read('..', 'scripts', 'posts.js');
  const called = [...scripts.matchAll(/contentCheck\(\s*res\s*,\s*'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();

  assert.ok(declared.length > 0, '축 선언이 비어 있으면 이 테스트가 아무것도 지키지 않는다');
  assert.deepEqual(consumed, declared, 'fault-run.js 와 fault-window.js 의 목록이 다르다');
  assert.deepEqual(called, declared, '부하 스크립트가 부르는 이름과 선언한 축이 다르다');
});

/**
 * 경로 카탈로그가 틀리면 보고서가 **조용히 거짓말을 한다** — 없는 검사 이름을 가리키면 그
 * 경로가 영원히 "모름"으로 찍히고, 없는 메서드 이름을 가리키면 폴백이 돌았는데도 0 회로
 * 보인다. 둘 다 에러를 안 내므로 실행을 끝내고 표를 봐야 알게 된다.
 */
test('폴백 경로 카탈로그의 검사 이름이 실제 선언된 축과 같다', () => {
  const { PATHS } = require('../lib/fallback-paths');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scenarios', 'fault-window.js'), 'utf8');
  const block = src.match(/CONTENT_CHECK_NAMES\s*=\s*\[([\s\S]*?)\]/);
  const declared = new Set([...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));

  for (const p of PATHS) {
    assert.ok(declared.has(p.check), `경로 '${p.id}' 의 check '${p.check}' 가 선언된 축에 없다`);
  }
  assert.equal(PATHS.length, declared.size, '선언한 축마다 경로가 하나씩 있어야 표가 축을 빠뜨리지 않는다');
});

test('폴백 경로 카탈로그의 Redis 메서드가 실제 @ResilientRedis 메서드와 같다', () => {
  const { PATHS } = require('../lib/fallback-paths');
  const javaRoot = path.join(__dirname, '..', '..', '..', 'src', 'main', 'java');

  // 앱이 내는 태그 값은 "<선언 클래스>.<메서드>" 다(ResilientRedisAspect). 소스에서 같은
  // 규칙으로 뽑아 대조한다 — 리팩터링으로 클래스나 메서드 이름이 바뀌면 여기서 걸린다.
  const declared = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.java')) continue;
      const src = fs.readFileSync(full, 'utf8');
      const cls = e.name.replace(/\.java$/, '');
      for (const m of src.matchAll(/@ResilientRedis[\s\S]{0,200}?\b(\w+)\s*\(/g)) {
        if (m[1] !== 'Override') declared.add(`${cls}.${m[1]}`);
      }
      // AOP 를 안 쓰고 직접 세는 경로. 상수로 이름을 박아 두므로 그 문자열을 읽는다.
      for (const m of src.matchAll(/"(\w+\.\w+)"/g)) {
        if (src.includes('fallbackMetrics') && m[1].startsWith(cls + '.')) declared.add(m[1]);
      }
    }
  };
  walk(javaRoot);

  const used = PATHS.flatMap((p) => p.redisMethods);
  assert.ok(used.length > 0, '메서드를 하나도 안 가리키면 이 테스트가 아무것도 지키지 않는다');
  for (const m of used) {
    assert.ok(declared.has(m), `카탈로그가 가리키는 '${m}' 에 폴백이 걸려 있지 않다 (실제: ${[...declared].sort().join(', ')})`);
  }
});

test('validatePlan: warmupSec 은 선택이지만 숫자가 아니면 잡는다', () => {
  // 예열이 조용히 꺼지는 것이 가장 나쁘다 — 캐시가 빈 채로 pre 를 재고도 그 사실이 안 남는다.
  assert.deepEqual(plan.validatePlan(basePlan({ phases: { warmupSec: 180, preSec: 60, faultSec: 60, postSec: 60 } })), []);
  assert.deepEqual(plan.validatePlan(basePlan({ phases: { preSec: 60, faultSec: 60, postSec: 60 } })), [],
    'warmupSec 을 안 적은 계획은 그대로 통과해야 한다');

  const bad = plan.validatePlan(basePlan({ phases: { warmupSec: '180', preSec: 60, faultSec: 60, postSec: 60 } }));
  assert.ok(bad.some((e) => /warmupSec/.test(e)), `문자열 warmupSec 을 잡아야 한다: ${bad.join(', ')}`);
  assert.ok(plan.validatePlan(basePlan({ phases: { warmupSec: -1, preSec: 60, faultSec: 60, postSec: 60 } })).some((e) => /warmupSec/.test(e)));
});

test('totalSec: 예열은 측정 구간이 아니므로 합계에 넣지 않는다', () => {
  // 이 합계는 시계열 수집 창의 길이를 정한다. 예열을 더하면 측정 전 구간까지 긁어 온다.
  assert.equal(plan.totalSec({ warmupSec: 180, preSec: 60, faultSec: 60, postSec: 180 }), 300);
});

test('healthByPhase: 무응답(폴러 상한)과 DOWN(앱이 보고)을 구분해 센다', () => {
  const phases = { preSec: 30, faultSec: 20, postSec: 30 };
  const samples = [
    { tSec: null, status: 'UP', httpStatus: 200, latencyMs: 10 },   // t0 전 — 어느 구간에도 안 들어간다
    { tSec: 5, status: 'UP', httpStatus: 200, latencyMs: 12 },
    { tSec: 25, status: 'UNREACHABLE', httpStatus: null, error: 'timeout after 4000ms: GET /x', latencyMs: 4001 },
    { tSec: 35, status: 'DOWN', httpStatus: 503, latencyMs: 40 },
    { tSec: 45, status: 'UNREACHABLE', httpStatus: null, error: 'connect ECONNREFUSED', latencyMs: 3 },
    { tSec: 60, status: 'UP', httpStatus: 200, latencyMs: 80 },
  ];
  const out = plan.healthByPhase(samples, phases);
  assert.equal(out.pre.count, 2);
  assert.equal(out.pre.up, 1);
  assert.equal(out.pre.timeout, 1, '폴러 상한 초과는 timeout 으로 센다');
  assert.equal(out.pre.unreachable, 0, '상한 초과를 연결 실패로 세면 안 된다');
  assert.equal(out.fault.down, 1, '앱이 응답하며 DOWN 이라 한 것은 down');
  assert.equal(out.fault.unreachable, 1, '접속 자체 실패는 unreachable');
  assert.equal(out.post.up, 1);
  assert.equal(out.pre.latency.max, 4001);
});

test('healthCause: 표본 하나의 원인을 네 갈래로 분류한다', () => {
  assert.equal(plan.healthCause({ httpStatus: 200, status: 'UP' }), 'up');
  assert.equal(plan.healthCause({ httpStatus: 503, status: 'DOWN' }), 'down');
  assert.equal(plan.healthCause({ httpStatus: null, error: 'timeout after 4000ms: GET /x' }), 'timeout');
  assert.equal(plan.healthCause({ httpStatus: null, error: 'connect ECONNREFUSED' }), 'unreachable');
});

// ---------------------------------------------------------------------------
// --latency 덮어쓰기 — 같은 계획을 지연만 바꿔 여러 번 돌릴 때 쓴다
// ---------------------------------------------------------------------------

test('faults/redis-slow.json 은 latency toxic 을 쓴다', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FAULTS, 'redis-slow.json'), 'utf8'));
  assert.deepEqual(plan.validatePlan(p), []);
  const add = p.inject.find((s) => s.action === 'add');
  assert.equal(add.toxic.type, 'latency');
  assert.equal(typeof add.toxic.attributes.latency, 'number');
});

// ---------------------------------------------------------------------------
// load.steps — 계단 총합과 faultSec 의 일치
// ---------------------------------------------------------------------------

test('load.steps: 계단 총합이 faultSec 과 같으면 통과한다', () => {
  const p = basePlan({
    load: { rate: 40, steps: [40, 55, 70], stepRampSec: 30, stepHoldSec: 90 },
    phases: { preSec: 120, faultSec: 360, postSec: 180 },
  });
  assert.deepEqual(plan.validatePlan(p), []);
});

test('load.steps: 계단 총합이 faultSec 과 다르면 막는다', () => {
  // 어긋나면 램프 도중에 장애가 걷히고 그 뒤 계단은 무장애 값이 된다. k6 도 실행기도
  // 오류로 보지 않아 리포트가 정상으로 나오므로, 계획 단계에서 잡아야 한다.
  const p = basePlan({
    load: { rate: 40, steps: [40, 55, 70], stepRampSec: 30, stepHoldSec: 90 },
    phases: { preSec: 120, faultSec: 300, postSec: 180 },
  });
  const errors = plan.validatePlan(p);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /계단 총합/);
});

test('load.steps: 전환·유지 길이를 안 주면 30·90 을 기본으로 센다', () => {
  const p = basePlan({
    load: { rate: 40, steps: [40, 55] },
    phases: { preSec: 120, faultSec: 240, postSec: 180 },
  });
  assert.deepEqual(plan.validatePlan(p), []);
});

test('load.steps: 빈 배열이나 음수 계단을 막는다', () => {
  assert.match(plan.validatePlan(basePlan({ load: { rate: 4, steps: [] } })).join(), /비어 있지 않은 배열/);
  assert.match(plan.validatePlan(basePlan({ load: { rate: 4, steps: [40, -1] } })).join(), /양수/);
});
