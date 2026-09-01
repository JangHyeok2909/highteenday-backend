'use strict';

/**
 * 접기·정렬 표의 **마크업 계약**을 검증한다.
 *
 * 정렬 동작 자체는 브라우저 안에서 일어나므로 여기서 실행할 수 없다. 대신 그 동작이
 * 딛고 서는 계약을 검사한다 — 정렬용 원시값이 `data-s` 로 실렸는가, 6번째부터 접혔는가,
 * 숨으면 안 되는 행에 `data-keep` 이 붙었는가, JS 가 없을 때의 폴백이 있는가.
 * 이 계약이 깨지면 화면은 멀쩡해 보이면서 정렬만 틀린다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { dataTable, TABLE_NOSCRIPT, TABLE_JS } = require('../lib/report-table');

const COLS = [
  { key: 'name', label: '이름', sort: 'text' },
  { key: 'ms', label: '지연', align: 'right', sort: 'num' },
  { key: 'note', label: '설명', sort: false },
];

/** n 행짜리 표를 만든다. 표시값은 일부러 단위가 섞인 문자열로 둔다. */
function rowsOf(n, extra = () => ({})) {
  return Array.from({ length: n }, (_, i) => ({
    cells: { name: `r${i}`, ms: i > 2 ? `${i}.0s` : `${i * 100}ms`, note: '—' },
    sort: { name: `r${i}`, ms: i > 2 ? i * 1000 : i * 100 },
    ...extra(i),
  }));
}

test('정렬용 원시값이 data-s 로 실린다 — 표시 문자열로 정렬하면 4.0s < 200ms 가 된다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(3) });
  assert.match(html, /<td class="num" data-s="0">0ms<\/td>/);
  assert.match(html, /<td class="num" data-s="200">200ms<\/td>/);
});

test('0 은 유효한 정렬값이라 data-s 가 붙는다 — falsy 검사로 지우면 조용히 사라진다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(1) });
  assert.match(html, /data-s="0"/);
});

test('정렬값이 없는 열에는 data-s 를 붙이지 않는다 — 표시 문자열로 정렬한다는 뜻이다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(1) });
  const noteCell = /<td>(—)<\/td>/.exec(html);
  assert.ok(noteCell, 'note 셀에 data-s 가 붙어 있다');
});

test('6번째 행부터 hidden 이 박힌다 (상위 5개)', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(8) });
  const trs = html.match(/<tr data-i="\d+"[^>]*>/g);
  assert.equal(trs.length, 8);
  assert.equal(trs.filter((t) => t.includes('hidden')).length, 3);
  assert.ok(!trs[4].includes('hidden'), '5번째 행이 숨겨졌다');
  assert.ok(trs[5].includes('hidden'), '6번째 행이 보인다');
});

test('5행 이하면 펼치기 버튼이 없다', () => {
  assert.ok(!dataTable({ columns: COLS, rows: rowsOf(5) }).includes('dt-more'));
  assert.ok(dataTable({ columns: COLS, rows: rowsOf(6) }).includes('dt-more'));
});

test('펼치기 버튼이 남은 개수를 정확히 말한다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(9) });
  assert.match(html, /data-n="4"[^>]*>나머지 4개 보기/);
});

test('keep 행은 6번째 이후여도 숨지 않는다 — 실패 행이 묻히면 표가 거짓말을 한다', () => {
  const rows = rowsOf(9, (i) => (i === 7 ? { keep: true } : {}));
  const html = dataTable({ columns: COLS, rows });
  const trs = html.match(/<tr data-i="\d+"[^>]*>/g);
  assert.ok(trs[7].includes('data-keep="1"'), 'keep 표시가 없다');
  assert.ok(!trs[7].includes('hidden'), 'keep 행이 숨겨졌다');
});

test('keep 행은 상위 5개 자리를 차지하지 않는다', () => {
  // keep 이 자리를 먹으면 "상위 5개"가 4개로 줄어든다. keep 은 정원 밖이다.
  const rows = rowsOf(9, (i) => (i === 8 ? { keep: true } : {}));
  const html = dataTable({ columns: COLS, rows });
  const trs = html.match(/<tr data-i="\d+"[^>]*>/g);
  assert.equal(trs.filter((t) => !t.includes('hidden')).length, 6); // 상위 5 + keep 1
});

test('collapseAfter: 0 이면 접지 않는다 (SLO 표처럼 전수 확인이 목적인 표)', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(20), collapseAfter: 0 });
  assert.ok(!html.includes('hidden'));
  assert.ok(!html.includes('dt-more'));
  assert.ok(!html.includes('data-collapse'));
});

test('sort: false 인 열에는 정렬 버튼과 data-k 가 없다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(2) });
  // `<thead>` 까지 잡히지 않게 여는 태그 뒤를 공백 또는 `>` 로 못박는다.
  const heads = html.match(/<th(?:\s[^>]*)?>/g);
  assert.ok(heads[0].includes('data-k="name"'));
  assert.ok(heads[1].includes('data-t="num"'));
  assert.ok(!heads[2].includes('data-k'), '정렬 불가 열에 data-k 가 붙었다');
});

test('defaultSort 는 aria-sort 로 표시된다 — 색·글리프만으로 의미를 전달하지 않는다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(2), defaultSort: { key: 'ms', dir: 'desc' } });
  assert.match(html, /data-k="ms" data-t="num" aria-sort="descending"/);
  assert.match(html, /aria-label="지연 기준 정렬">▼</);
});

test('정렬 버튼에 접근성 레이블이 붙는다', () => {
  const html = dataTable({ columns: COLS, rows: rowsOf(2) });
  assert.match(html, /aria-label="이름 기준 정렬"/);
});

test('셀 값에 HTML 을 그대로 넣을 수 있다 — 배지·code 태그가 들어온다', () => {
  const rows = [{ cells: { name: '<code>x</code>', ms: '1ms', note: '' }, sort: { ms: 1 } }];
  assert.ok(dataTable({ columns: COLS, rows }).includes('<code>x</code>'));
});

test('data-s 값은 이스케이프된다 — 정렬값에 따옴표가 들어와도 속성이 안 깨진다', () => {
  const rows = [{ cells: { name: 'a', ms: '1', note: '' }, sort: { name: 'a"b', ms: 1 } }];
  const html = dataTable({ columns: COLS, rows });
  assert.ok(!html.includes('data-s="a"b"'));
  assert.ok(html.includes('&quot;'));
});

test('JS 가 없을 때의 폴백이 데이터를 되살린다 — 기능만 없어지고 정보는 남는다', () => {
  // 방향이 중요하다. "기본 5개 → JS 로 펼치기"였다면 JS 차단 시 데이터가 사라진다.
  assert.match(TABLE_NOSCRIPT, /tr\[hidden\]\{display:table-row!important\}/);
  assert.match(TABLE_NOSCRIPT, /\.dt-more,button\.dt-sort\{display:none!important\}/);
});

test('초기화가 실패해도 숨은 행을 되살리는 경로가 있다', () => {
  assert.match(TABLE_JS, /catch \(e\)/);
  assert.match(TABLE_JS, /tr\[hidden\]/);
});
