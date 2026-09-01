'use strict';

/**
 * 스파크라인이 **결측 회차의 자리를 비워 두는지** 검증한다.
 *
 * 왜 이걸 테스트하는가: 예전 구현은 `values.filter(nz)` 로 결측을 버리고 남은 값을
 * 0..m-1 로 다시 늘어놓았다. 눈으로는 멀쩡한 선이 그려지므로 회귀가 나도 아무도 모른다.
 * 그런데 그 상태에서 점마다 실행 리포트 링크를 달면 **엉뚱한 실행으로 이동한다.**
 * 좌표가 원래 인덱스를 따르는지는 경로 문자열로만 확인할 수 있다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sparkline } = require('../lib/report');

/** `M12.34,5.67 L…` 형태의 경로에서 x 좌표만 뽑는다. */
function xsOf(svg) {
  const m = /<path d="(M[^"]+?)" fill="none"/.exec(svg);
  assert.ok(m, '선 경로를 찾지 못했다');
  return m[1].split(' ').map((seg) => Number(seg.slice(1).split(',')[0]));
}

test('결측이 없으면 점이 0..100 을 균등하게 채운다', () => {
  const xs = xsOf(sparkline([10, 20, 30, 40, 50]));
  assert.deepEqual(xs, [0, 25, 50, 75, 100]);
});

test('중간 결측은 자리를 비운다 — 남은 점을 다시 늘어놓지 않는다', () => {
  // 5회 중 2·3번째가 결측. 그려지는 점은 index 0, 3, 4 이므로 x 는 0, 75, 100 이어야 한다.
  // 옛 구현은 세 점을 0, 50, 100 으로 재배치해 이력이 촘촘한 것처럼 보였다.
  const xs = xsOf(sparkline([10, null, null, 40, 50]));
  assert.deepEqual(xs, [0, 75, 100]);
});

test('앞뒤 결측은 선이 양 끝에 닿지 않는다', () => {
  const xs = xsOf(sparkline([null, 20, 30, null, null]));
  assert.deepEqual(xs, [25, 50]);
});

test('면적은 그려진 첫 점과 마지막 점 사이에서만 닫힌다', () => {
  // 예전에는 항상 L100,40 L0,40 으로 닫아, 앞뒤가 결측인 계열에서 존재하지 않는
  // 구간까지 칠해졌다.
  const svg = sparkline([null, 20, 30, null, null]);
  const area = /<path d="(M[^"]+?)" fill="var/.exec(svg);
  assert.ok(area, '면적 경로를 찾지 못했다');
  assert.ok(area[1].endsWith('L50.00,40 L25.00,40 Z'), `면적이 양 끝까지 칠해졌다: ${area[1]}`);
});

test('강조 원은 마지막으로 **값이 있는** 회차에 찍힌다', () => {
  const svg = sparkline([10, 20, 30, null, null]);
  const m = /<circle cx="([\d.]+)"/.exec(svg);
  assert.equal(Number(m[1]), 50);
});

test('그릴 점이 2개 미만이면 빈 SVG 를 낸다', () => {
  assert.ok(!/<path/.test(sparkline([])));
  assert.ok(!/<path/.test(sparkline([5])));
  assert.ok(!/<path/.test(sparkline([null, 5, null])));
});
