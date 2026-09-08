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
