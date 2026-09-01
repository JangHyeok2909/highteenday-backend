'use strict';

/**
 * `--render-only` 가 **그 실행 시점까지의 추세만** 그리는지 검증한다.
 *
 * 수집 시점에는 그 실행이 언제나 계열의 마지막이라 자를 일이 없었다. 과거 실행을 다시
 * 그릴 때는 다르다 — 자르지 않으면 그 실행 이후에 나온 회차까지 선에 들어가고, 리포트가
 * 스스로 붙인 설명("오른쪽 끝이 이번 실행이다")이 거짓이 된다. 추세 점에 실행 리포트
 * 링크를 달면 그 어긋남이 곧 오작동이다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { trendUpTo } = require('../collect');

const ROWS = [
  { id: 'r1', startedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'r2', startedAt: '2026-08-02T00:00:00.000Z' },
  { id: 'r3', startedAt: '2026-08-03T00:00:00.000Z' },
  { id: 'r4', startedAt: '2026-08-04T00:00:00.000Z' },
  { id: 'r5', startedAt: '2026-08-05T00:00:00.000Z' },
];

test('과거 실행을 다시 그리면 그 이후 회차는 추세에서 빠진다', () => {
  const t = trendUpTo(ROWS, '2026-08-03T00:00:00.000Z');
  assert.deepEqual(t.map((r) => r.id), ['r1', 'r2', 'r3']);
});

test('자기 자신은 남는다 — 오른쪽 끝이 그 실행이어야 한다', () => {
  const t = trendUpTo(ROWS, '2026-08-03T00:00:00.000Z');
  assert.equal(t[t.length - 1].id, 'r3');
});

test('최신 실행이면 전부 남는다 (수집 시점과 같은 결과)', () => {
  assert.equal(trendUpTo(ROWS, '2026-08-05T00:00:00.000Z').length, 5);
});

test('limit 은 오래된 쪽부터 버린다', () => {
  const t = trendUpTo(ROWS, '2026-08-05T00:00:00.000Z', 3);
  assert.deepEqual(t.map((r) => r.id), ['r3', 'r4', 'r5']);
});

test('startedAt 이 없는 옛 레코드는 자르지 않는다 — 조용히 빈 추세를 만들지 않는다', () => {
  // 여기서 전부 버리면 "이력이 없다"로 보이는데, 사실은 시각을 모를 뿐이다.
  // 없는 사실을 만들기보다 자르지 않는 쪽이 덜 틀린다.
  assert.equal(trendUpTo(ROWS, null).length, 5);
  assert.equal(trendUpTo(ROWS, undefined).length, 5);
});
