'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderReport } = require('../lib/report');

function sampleRecord() {
  const plan = {
    id: 'redis-hang', question: 'Redis 가 멈추면?',
    load: { rate: 4 }, phases: { preSec: 60, faultSec: 30, postSec: 60 },
    inject: [], expect: ['모든 호출이 60초 대기한다'], requires: { proxy: true },
  };
  const t0 = new Date('2026-09-08T10:00:00Z');
  return {
    id: 'redis-hang-2026-09-08T10-00-00', plan, note: '메모', startedAt: t0.toISOString(), t0: t0.toISOString(), t0Source: 'k6-setup', endedAt: new Date(t0.getTime() + 150000).toISOString(),
    env: { viaProxy: true, hikariMax: 10, tomcatMax: 400 },
    k6: {
      phases: { pre: { durationSec: 60, httpReqs: 100, rps: 1.6, med: 10, p95: 50, p99: 80, max: 100, errorRate: 0, tps: 0.5 },
        fault: { durationSec: 30, httpReqs: 20, rps: 0.6, med: 60000, p95: 60001, p99: 60001, max: 60001, errorRate: 0.9, tps: 0.1 },
        post: { durationSec: 60, httpReqs: 90, rps: 1.5, med: 12, p95: 55, p99: 90, max: 200, errorRate: 0.01, tps: 0.5 } },
      failedLatency: { pre: { count: 0 }, fault: { count: 18, med: 60001, p90: 60001, p95: 60001, max: 60002 }, post: { count: 1, med: 5, p90: 5, p95: 5, max: 5 } },
      featureByPhase: { hot: { pre: { count: 10, p95: 20, errorRate: 0 }, fault: { count: 3, p95: 60001, errorRate: 1 }, post: { count: 9, p95: 21, errorRate: 0 } } },
      droppedIterations: 7,
    },
    events: [{ kind: 'inject', tool: 'toxiproxy', action: 'add', target: 'redis', plannedAtSec: 60, actualAtSec: 60.2, ok: true, durationMs: 12, at: t0.toISOString() },
      { kind: 'cleanup', at: t0.toISOString(), reason: 'k6-exit', actions: ['toxic redis/hang 제거'] }],
    health: [{ tSec: 0, status: 'UP', httpStatus: 200 }, { tSec: 65, status: 'DOWN', httpStatus: 503, components: { redis: 'DOWN', db: 'UP' } }],
    healthTransitions: [{ tSec: 0, status: 'UP', httpStatus: 200 }, { tSec: 65, status: 'DOWN', httpStatus: 503, components: { redis: 'DOWN', db: 'UP' } }],
    infra: { pre: { groups: [{ id: 'pool', label: 'Pool', metrics: [{ key: 'pool.tomcatBusy.max', label: 'busy max', value: 12, unit: 'count' }] }], flat: {}, errors: [] },
      fault: { groups: [{ id: 'pool', label: 'Pool', metrics: [{ key: 'pool.tomcatBusy.max', label: 'busy max', value: 400, unit: 'count' }] }], flat: {}, errors: [] } },
    series: { rps: [{ t: t0.getTime() / 1000 + 10, v: 1.5 }, { t: t0.getTime() / 1000 + 70, v: 0.2 }], tomcatBusy: [] },
  };
}

test('renderReport: 판정 단어 없이 가설·구간·실패 지연·헬스 전이를 담는다', () => {
  const html = renderReport(sampleRecord(), { siblings: [{ id: 'redis-hang-earlier', startedAt: '2026-09-07' }] });
  assert.ok(html.includes('Redis 가 멈추면?'));
  assert.ok(html.includes('관측: (실행 뒤 채운다)'));
  assert.ok(html.includes('60,001') || html.includes('60001'));
  assert.ok(html.includes('DOWN'));
  assert.ok(html.includes('redis-hang-earlier'));
  assert.ok(html.includes('dropped_iterations'));
  assert.ok(!/PASS|FAIL|verdict|회귀/.test(html), '보고서에 판정 어휘가 있으면 안 된다');
});

test('renderReport: 프록시 필요한데 직결이면 경고를 띄운다', () => {
  const rec = sampleRecord();
  rec.env.viaProxy = false;
  const html = renderReport(rec);
  assert.ok(html.includes('프록시를 거치지 않는다'));
});

test('renderReport: 시계열이 비어도 렌더된다', () => {
  const rec = sampleRecord();
  rec.series = {};
  const html = renderReport(rec);
  assert.ok(html.includes('시계열 없음'));
});
