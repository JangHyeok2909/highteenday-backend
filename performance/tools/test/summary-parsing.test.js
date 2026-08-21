'use strict';

/**
 * k6 요약 파싱 검증.
 *
 * scripts/lib/summary.js 는 k6 런타임(ESM + jslib import) 전용이라 Node 에서 require 할 수
 * 없다. 동일한 파싱 로직의 사본이 migrate-raw.js 에 있으므로 그쪽을 검증한다 —
 * 두 파일은 같은 규칙을 유지해야 한다(수정 시 양쪽 함께).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { convert, breakdown, parseName } = require('../migrate-raw');

function fakeData(overrides = {}) {
  return {
    state: { testRunDurationMs: 60000 },
    metrics: {
      http_req_duration: { values: { avg: 50, min: 1, med: 40, max: 900, 'p(90)': 80, 'p(95)': 100, 'p(99)': 200 } },
      http_reqs: { values: { count: 1000, rate: 16.6 } },
      // Rate 메트릭: passes = 조건("실패했다")이 참 = 실패 요청. fails = 성공 요청.
      http_req_failed: { values: { rate: 0.4, passes: 400, fails: 600 } },
      iterations: { values: { count: 100, rate: 1.6 } },
      checks: { values: { rate: 0.95, passes: 950, fails: 50 } },
      vus_max: { values: { max: 20 } },
      ...overrides,
    },
    root_group: { checks: [], groups: {} },
  };
}

const INFO = { runId: 'posts-2026-01-01T00-00-00', scenario: 'posts', endedAt: new Date('2026-01-01T00:00:00Z') };

// S-05 회귀 테스트 — failedRequests 가 성공 수(fails=600)가 아니라 실패 수(passes=400)여야 한다.
test('convert: failedRequests 는 실패한 요청 수다 (passes/fails 의미 반전 주의)', () => {
  const rec = convert(fakeData(), INFO);
  assert.equal(rec.k6.all.failedRequests, 400);
  assert.equal(rec.k6.all.errorRate, 0.4);
  // 교차 검증: errorRate × httpReqs ≈ failedRequests
  assert.equal(Math.round(rec.k6.all.errorRate * rec.k6.all.httpReqs), rec.k6.all.failedRequests);
});

// T-03/S-08 — 이관된 과거 실행은 phase 개념 자체가 없던 데이터라 phasePlan을 복원할 수 없다.
// 임의의 기본값을 소급 적용하지 않고 명시적으로 null/빈 객체로 남겨야 한다.
test('convert: 이관 레코드는 phasePlan이 null이고 phases가 빈 객체다 (소급 금지)', () => {
  const rec = convert(fakeData(), INFO);
  assert.equal(rec.run.phasePlan, null);
  assert.deepEqual(rec.k6.phases, {});
});

// S-17 회귀 테스트 — 다중 태그 서브메트릭이 엉뚱한 축을 만들면 안 된다.
test('breakdown: 단일 태그 서브메트릭은 축별로 분해된다', () => {
  const out = breakdown({
    'http_req_duration{feature:posts}': { values: { avg: 10, 'p(95)': 20 } },
    'http_req_duration{op:read}': { values: { avg: 5, 'p(95)': 9 } },
    'http_req_duration{op:auth}': { values: { avg: 50, 'p(95)': 80 } },
  });
  assert.ok(out.feature && out.feature.posts);
  assert.ok(out.op && out.op.read);
  assert.ok(out.op && out.op.auth);
  assert.equal(out.feature.posts.p95, 20);
  assert.equal(out.op.auth.p95, 80);
});

test('breakdown: phase 가 섞인 2태그는 그 축의 구간별 값으로 받는다 (S-28)', () => {
  // 2026-08-20 규칙 변경. 예전에는 다중 태그를 전부 버렸는데, 그 때문에 op:read/op:write
  // 의 p95 가 리포트에서 통째로 비어 있었다 — 이 둘은 실제 SLO 축이라 measure 구간으로만
  // 선언되기 때문이다. 오파싱 위험(첫 콜론 오인)은 태그를 쉼표로 먼저 쪼개어 없앴다.
  const out = breakdown({
    'http_req_duration{phase:measurement,op:read}': { values: { avg: 5 } },
  });
  assert.equal(out.phase, undefined, '오파싱된 "phase" 축이 생기면 안 된다');
  assert.ok(out.op && out.op.read, 'op 축은 살아야 한다');
  assert.equal(out.op.read.byPhase.measurement.avg, 5);
  assert.equal(out.op.read.p95, undefined, '전체 구간 칸은 비어 있어야 한다');
});

test('breakdown: 태그 값에 콜론이 있어도 첫 콜론 기준으로 자른다', () => {
  const out = breakdown({
    'http_req_duration{name:GET http://x/y}': { values: { avg: 5 } },
  });
  assert.ok(out.name && out.name['GET http://x/y']);
});

test('breakdown: http_req_duration 이외 메트릭은 무시', () => {
  const out = breakdown({ 'http_req_waiting{feature:posts}': { values: { avg: 1 } } });
  assert.deepEqual(Object.keys(out), []);
});

test('parseName: 파일명에서 시나리오와 종료 시각을 복원한다', () => {
  const info = parseName('normal-day-2026-08-05T09-39-43.summary.json');
  assert.equal(info.scenario, 'normal-day');
  assert.equal(info.runId, 'normal-day-2026-08-05T09-39-43');
  assert.equal(info.endedAt.toISOString(), '2026-08-05T09:39:43.000Z');
});

// ── S-28: op 축 통계 결손 회귀 테스트 ──
// `op:read`/`op:write` 는 실제 SLO 축이라 PHASED_THRESHOLDS 에서 measure 구간으로만
// 선언된다. 예전 breakdown 은 2태그 서브메트릭을 전부 버려서 read·write 에 p95 가 없었다.

const trend = (p95) => ({ values: { avg: p95 / 3, min: 1, med: p95 / 4, max: p95 * 2, 'p(90)': p95 * 0.8, 'p(95)': p95, 'p(99)': p95 * 1.5, count: 100 } });

test('measure 구간 서브메트릭에서 op 축 통계를 만든다', () => {
  const b = breakdown({
    'http_req_duration{op:read,phase:measure}': trend(300),
    'http_req_duration{op:write,phase:measure}': trend(500),
  });
  assert.equal(b.op.read.byPhase.measure.p95, 300);
  assert.equal(b.op.write.byPhase.measure.p95, 500);
});

test('전체 구간과 measure 구간을 섞지 않는다', () => {
  const b = breakdown({
    'http_req_duration{feature:comment}': trend(1868),
    'http_req_duration{feature:comment,phase:measure}': trend(1200),
  });
  assert.equal(b.feature.comment.p95, 1868, '전체 구간 값은 최상위에');
  assert.equal(b.feature.comment.byPhase.measure.p95, 1200, 'measure 값은 byPhase 에');
});

test('phase 단독 태그는 분해 축이 아니다', () => {
  const b = breakdown({ 'http_req_duration{phase:measure}': trend(100) });
  assert.equal(b.phase, undefined);
});

test('태그 3개 이상은 여전히 제외한다', () => {
  const b = breakdown({ 'http_req_duration{op:read,phase:measure,page:0}': trend(100) });
  assert.deepEqual(b, {});
});
