'use strict';

/**
 * 추세 그래프의 점이 **자기 회차의 리포트**를 가리키는지 검증한다.
 *
 * 이게 정확히 `sparkline()` 의 옛 버그가 오작동으로 드러나는 자리다. 예전 구현은 결측
 * 회차를 버리고 남은 값을 다시 늘어놓았으므로, 그 좌표에 링크를 걸면 **엉뚱한 실행으로
 * 이동한다.** 눈으로는 선이 멀쩡해 보이기 때문에 사람이 알아챌 방법이 없다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sectionTrend, sparkPointsPct } = require('../lib/report');

const RUNS = [
  { id: 'run-a', number: 1, startedAt: '2026-08-01T00:00:00Z', commitShort: 'aaa1111', p95: 100, verdict: 'PASS', saturationStatus: 'HEADROOM' },
  { id: 'run-b', number: 2, startedAt: '2026-08-02T00:00:00Z', commitShort: 'bbb2222', p95: 200, verdict: 'PASS', saturationStatus: 'HEADROOM' },
  { id: 'run-c', number: 3, startedAt: '2026-08-03T00:00:00Z', commitShort: 'ccc3333', p95: 300, verdict: 'FAIL', saturationStatus: 'SATURATED', note: '풀 크기 실험' },
  { id: 'run-d', number: 4, startedAt: '2026-08-04T00:00:00Z', commitShort: 'ddd4444', p95: 400, verdict: 'PASS', saturationStatus: 'HEADROOM' },
];

const ALL_EXIST = () => true;
const html = (runs, exists = ALL_EXIST) => sectionTrend({}, runs, exists);

/** `left:` 퍼센트와 링크 대상 실행 ID 를 순서대로 뽑는다. */
function pointsOf(h) {
  return [...h.matchAll(/<(a|span) class="pt[^"]*" (?:href="\.\.\/([^/]+)\/report\.html" )?style="left:([\d.]+)%"/g)]
    .map((m) => ({ tag: m[1], id: m[2] || null, left: Number(m[3]) }));
}

test('점마다 그 회차의 리포트로 가는 링크가 붙는다', () => {
  const pts = pointsOf(html(RUNS)).slice(0, 4);
  assert.deepEqual(pts.map((p) => p.id), ['run-a', 'run-b', 'run-c', null]);
});

test('마지막 점은 이번 실행이라 링크가 아니다 — 자기 자신으로 가는 링크는 오작동이다', () => {
  const pts = pointsOf(html(RUNS)).slice(0, 4);
  assert.equal(pts[3].tag, 'span');
  assert.match(html(RUNS), /class="pt now"/);
});

test('결측 회차가 있어도 링크가 밀리지 않는다 — 이 어긋남이 옛 sparkline 버그다', () => {
  // 2번째 회차의 p95 가 없다. 예전 구현이라면 3번째 점이 2번째 자리로 당겨져,
  // run-c 의 점이 run-b 의 리포트를 가리키게 된다.
  const runs = RUNS.map((r, i) => (i === 1 ? { ...r, p95: null } : r));
  const pts = pointsOf(html(runs)).slice(0, 4);
  assert.deepEqual(pts.map((p) => p.id), ['run-a', 'run-b', 'run-c', null]);
  // 자리도 원래 인덱스를 지킨다 — 4회차라 0 / 33.33 / 66.67 / 100.
  assert.deepEqual(pts.map((p) => Math.round(p.left)), [0, 33, 67, 100]);
});

test('리포트 파일이 없는 회차에는 링크를 걸지 않는다 — 죽은 링크는 정보가 아니다', () => {
  const h = html(RUNS, (id) => id !== 'run-b');
  const pts = pointsOf(h).slice(0, 4);
  assert.equal(pts[1].tag, 'span');
  assert.equal(pts[1].id, null);
  assert.equal(pts[0].id, 'run-a');
});

test('툴팁에 회차·시각·커밋·포화 판정·메모가 들어간다', () => {
  const h = html(RUNS);
  assert.match(h, /data-l="#3 [^"]*ccc3333"/);
  assert.match(h, /data-st="포화 SATURATED · 판정 FAIL"/);
  assert.match(h, /data-note="풀 크기 실험"/);
});

test('JS 가 없어도 같은 설명이 나온다 — title 속성 폴백', () => {
  const h = html(RUNS);
  assert.match(h, /title="[^"]*ccc3333[^"]*"/);
  assert.match(h, /title="[^"]*클릭 → 이 실행의 리포트[^"]*"/);
});

test('툴팁 값은 esc() 로만 이스케이프한다 — sanitize-reports 의 원시 문자열 치환이 걸려야 한다', () => {
  // JSON.stringify 로 감싸면 이스케이프 방식이 달라져 게시 전 정화가 조용히 빗나간다.
  // note 가 원문 그대로(따옴표만 HTML 이스케이프) 파일에 있어야 치환이 잡는다.
  const runs = RUNS.map((r, i) => (i === 0 ? { ...r, note: 'user@host 실행' } : r));
  assert.match(html(runs), /data-note="user@host 실행"/);
});

test('회차가 2개 미만이면 추세를 그리지 않는다', () => {
  assert.equal(sectionTrend({}, [RUNS[0]], ALL_EXIST), '');
  assert.equal(sectionTrend({}, null, ALL_EXIST), '');
});
test('sparkPointsPct 는 결측 회차도 자리와 함께 그대로 돌려준다', () => {
  // 히트 영역은 결측 회차에도 자리가 있어야 한다 — 그 자리가 비어 있다는 사실 자체가
  // 정보이고, 링크를 걸 때 인덱스가 어긋나지 않는 근거이기도 하다.
  const pts = sparkPointsPct([10, null, 30]);
  assert.equal(pts.length, 3);
  assert.deepEqual(pts.map((p) => p.leftPct), [0, 50, 100]);
  assert.deepEqual(pts.map((p) => p.present), [true, false, true]);
  assert.deepEqual(pts.map((p) => p.index), [0, 1, 2]);
});
