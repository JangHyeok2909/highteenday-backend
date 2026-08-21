'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadbench = require('../lib/loadbench');

// ── 시점 결정 ──
// 핵심 계약: measure 창을 침범하느니 재지 않는다. warmup 이 짧거나 없으면 null 이어야 한다.

test('warmup 의 1/3 지점을 벤치 시점으로 정한다', () => {
  assert.equal(loadbench.deriveDelaySec(180), 60);
  assert.equal(loadbench.deriveDelaySec(300), 100);
});

test('벤치가 끝날 시점이 warmup 안에 들어온다', () => {
  for (const warmup of [120, 180, 300, 600]) {
    const at = loadbench.deriveDelaySec(warmup);
    assert.ok(at + loadbench.APPROX_DURATION_SEC < warmup,
      `warmup ${warmup}초: 시작 ${at}초 + 소요 ${loadbench.APPROX_DURATION_SEC}초가 warmup 을 넘음`);
  }
});

test('warmup 이 짧으면 시점을 정하지 않는다', () => {
  assert.equal(loadbench.deriveDelaySec(loadbench.MIN_WARMUP_SEC - 1), null);
  assert.equal(loadbench.deriveDelaySec(30), null);
  assert.equal(loadbench.deriveDelaySec(0), null);
});

test('warmup 을 지정하지 않았으면 시점을 정하지 않는다', () => {
  assert.equal(loadbench.deriveDelaySec(undefined), null);
  assert.equal(loadbench.deriveDelaySec(null), null);
  assert.equal(loadbench.deriveDelaySec(NaN), null);
});

// ── 예약 ──

test('시점이 없으면 벤치를 예약하지 않고 사유를 남긴다', () => {
  const handle = loadbench.start({ delaySec: null });
  assert.equal(handle.enabled, false);
  assert.match(handle.reason, /시점을 정할 수 없음/);
});

test('예약하지 않은 핸들은 결과 대신 사유를 돌려준다', () => {
  const summary = loadbench.stop(loadbench.start({ delaySec: null }));
  assert.equal(summary.available, false);
  assert.match(summary.reason, /시점을 정할 수 없음/);
});

test('아직 끝나지 않은 벤치는 값을 만들어내지 않고 미완료로 남긴다', () => {
  // 1시간 뒤로 예약하고 즉시 회수한다 — 워커는 아직 결과 파일을 쓰지 않았다.
  const handle = loadbench.start({ delaySec: 3600 });
  assert.equal(handle.enabled, true);
  const summary = loadbench.stop(handle);
  assert.equal(summary.available, false);
  assert.match(summary.reason, /미완료/);
});

// ── 요약 표시 ──

test('벤치가 없으면 사유를 그대로 보여준다', () => {
  const line = loadbench.describe({ available: false, reason: '테스트 사유' });
  assert.match(line, /테스트 사유/);
});

test('유휴 벤치와 나란히 놓으면 변화율을 보여준다', () => {
  const line = loadbench.describe(
    { available: true, delaySec: 60, repeat: 3, axes: { single: { ms: 6000 } } },
    { axes: { single: { ms: 5000 } } },
  );
  assert.match(line, /single 6000ms/);
  assert.match(line, /20\.0%/); // 6000 / 5000 - 1
});

test('유휴 벤치가 없으면 절대값만 보여준다', () => {
  const line = loadbench.describe({ available: true, delaySec: 60, repeat: 3, axes: { single: { ms: 6000 } } }, null);
  assert.match(line, /single 6000ms/);
  assert.doesNotMatch(line, /유휴 대비/);
});
