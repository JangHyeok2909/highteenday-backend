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
  assert.equal(rec.k6.overall.failedRequests, 400);
  assert.equal(rec.k6.overall.errorRate, 0.4);
  // 교차 검증: errorRate × httpReqs ≈ failedRequests
  assert.equal(Math.round(rec.k6.overall.errorRate * rec.k6.overall.httpReqs), rec.k6.overall.failedRequests);
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

test('breakdown: 다중 태그 서브메트릭({phase:...,op:...})은 축 분해에서 제외된다', () => {
  const out = breakdown({
    'http_req_duration{phase:measurement,op:read}': { values: { avg: 5 } },
  });
  assert.equal(out.phase, undefined, '오파싱된 "phase" 축이 생기면 안 된다');
  assert.deepEqual(Object.keys(out), []);
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
