'use strict';
/**
 * report-table — 리포트의 **긴 목록**을 상위 몇 개로 접고 열 기준으로 정렬한다.
 *
 * 왜 공용 모듈인가
 * ----------------
 * 리포트에는 표가 28개 있고 전부 각 섹션에서 `<table>` 문자열을 손으로 조립하고 있었다.
 * 접기와 정렬을 섹션마다 따로 붙이면 28곳에서 조금씩 다르게 동작한다. 이 저장소는 이미
 * 같은 사고를 겪었다 — `scripts/lib/sampling.js` 가 분리된 이유가 Zipf 근사식이 두 곳에
 * 복제돼 **양쪽에 같은 버그가 동시에** 있었기 때문이다. 규칙은 하나만 존재해야 한다.
 *
 * 왜 접기와 정렬이 같은 코드인가
 * ------------------------------
 * 따로 만들면 틀린다. 정렬을 바꾸면 **"상위 5개"의 내용도 바뀌어야** 하기 때문이다.
 * P95 내림차순으로 5개를 보다가 "요청 수" 오름차순을 누르면, 보여야 할 5개는 요청 수가
 * 가장 적은 5개다. 접힘을 마크업에 고정해 두면 정렬 후에도 원래의 5개가 남아 완전히 틀린
 * 화면이 된다. 그래서 접힘은 **정렬 후 위치 기준**으로 다시 계산된다.
 *
 * 왜 `data-s` 로 원시값을 따로 싣는가 — 이게 가장 흔한 함정이다
 * -------------------------------------------------------------
 * 표에 찍히는 값은 전부 포맷된 문자열이다. `fmt.ms()` 는 같은 열에 `429.55ms` 와 `4.02s` 를
 * 섞어 낸다.
 *   - 문자열 정렬: `"4.02s" < "429.55ms"` → 4초짜리가 429밀리초보다 작다고 나온다
 *   - `parseFloat`: `4.02` vs `429.55` → 단위를 잃어 똑같이 틀린다
 * `1,514.5` 의 천 단위 쉼표, `12.3%`, `sha256:…` 도 같은 문제다. 그래서 셀마다 **정렬에 쓸
 * 원시 숫자를 `data-s` 로 따로** 싣는다. 표시와 정렬 근거를 분리하지 않으면 조용히 틀린다.
 *
 * JavaScript 를 쓰는 것이 설계 원칙에 어긋나지 않는가
 * ---------------------------------------------------
 * `report.js` 머리말의 원칙 1은 *"외부 CDN/폰트/스크립트를 쓰지 않는다"* 다. 금지 대상은
 * **외부 의존**이지 스크립트 자체가 아니다. 인라인 `<script>` 는 파일 하나로 자기완결이라는
 * 원칙을 그대로 지킨다.
 *
 * 그래도 JS 없이 리포트가 온전해야 한다. 세 겹으로 막는다.
 *   1. 6번째 행부터 `hidden` 을 마크업에 박는다 (깜빡임 없음)
 *   2. `<noscript>` 가 그 `hidden` 을 무효화하고 조작 버튼을 숨긴다 (JS 차단 시 전체 표시)
 *   3. 초기화가 예외로 죽으면 catch 가 모든 행을 다시 보이게 한다 (JS 오류 시 전체 표시)
 * 어느 경우에도 **데이터가 사라지지 않는다.** 기능만 없어진다.
 */

const { escapeHtml: esc } = require('./format');

/** 접기 기본 개수. 사용자가 "상위 5개"로 정한 값이다. */
const COLLAPSE_AFTER = 5;

/**
 * 정렬 가능한 데이터 표 하나를 그린다.
 *
 * @param {object}   spec
 * @param {Array}    spec.columns  `{ key, label, align, sort, width, title }`
 *   - `sort`: `'num'` | `'text'` | `false`(정렬 불가). 기본 `'text'`.
 *   - `align`: `'right'` 면 `class="num"` 이 붙는다(기존 표와 같은 정렬).
 * @param {Array}    spec.rows     `{ cells, sort, keep, cls }`
 *   - `cells`: `{ [key]: html }` — **이미 이스케이프된 HTML**. 배지·코드 태그가 들어온다.
 *   - `sort` : `{ [key]: number|string }` — 정렬용 원시값. 없으면 표시 문자열로 정렬한다.
 *   - `keep` : `true` 면 접어도 항상 보인다. 실패 행처럼 숨으면 안 되는 행에 쓴다.
 * @param {number}   [spec.collapseAfter]  0 이나 null 이면 접지 않는다.
 * @param {object}   [spec.defaultSort]    `{ key, dir }` — 헤더에 현재 정렬을 표시만 한다.
 *   행 순서는 **호출부가 이미 정렬해서 넘긴다** — 정렬 규칙이 서버(Node)와 브라우저 두 곳에
 *   갈라지면 첫 화면과 재정렬 결과가 달라질 수 있다.
 */
function dataTable(spec) {
  const cols = spec.columns || [];
  const rows = spec.rows || [];
  const limit = spec.collapseAfter == null ? COLLAPSE_AFTER : spec.collapseAfter;
  const ds = spec.defaultSort || {};

  const head = cols.map((c) => {
    const cls = c.align === 'right' ? ' class="num"' : '';
    const w = c.width ? ` style="width:${esc(String(c.width))}"` : '';
    const sortType = c.sort === false ? null : (c.sort || 'text');
    if (!sortType) return `<th${cls}${w}>${esc(c.label)}</th>`;
    const active = ds.key === c.key ? ds.dir : null;
    // aria-sort 는 스크린리더가 "무엇으로 정렬돼 있는가"를 읽는 표준 속성이다.
    // 화살표 글리프만 두면 색·모양만으로 의미를 전달하는 것이 되어 원칙 3에 어긋난다.
    const aria = active ? ` aria-sort="${active === 'desc' ? 'descending' : 'ascending'}"` : '';
    const glyph = active === 'desc' ? '▼' : active === 'asc' ? '▲' : '⇅';
    return `<th${cls}${w} data-k="${esc(c.key)}" data-t="${sortType}"${aria}>`
      + `${esc(c.label)}<button type="button" class="dt-sort" `
      + `aria-label="${esc(c.label)} 기준 정렬">${glyph}</button></th>`;
  }).join('');

  let shown = 0;
  const body = rows.map((r, i) => {
    const keep = r.keep ? ' data-keep="1"' : '';
    let hide = '';
    if (limit > 0 && !r.keep) {
      if (shown < limit) shown += 1;
      else hide = ' hidden';
    }
    const tds = cols.map((c) => {
      const cls = c.align === 'right' ? ' class="num"' : '';
      const raw = r.sort ? r.sort[c.key] : undefined;
      // 0 과 빈 문자열은 유효한 정렬값이다 — falsy 검사로 거르면 조용히 사라진다.
      const s = raw === undefined || raw === null ? '' : ` data-s="${esc(String(raw))}"`;
      return `<td${cls}${s}>${r.cells[c.key] == null ? '' : r.cells[c.key]}</td>`;
    }).join('');
    // data-i 는 "원래 순서"다. 정렬을 세 번 누르면 기본 순서로 돌아오는데, 그 기본이
    // 무엇이었는지는 렌더 시점에만 알 수 있다.
    return `<tr data-i="${i}"${keep}${hide}${r.cls ? ` class="${esc(r.cls)}"` : ''}>${tds}</tr>`;
  }).join('');

  const hiddenCount = limit > 0 ? rows.filter((r) => !r.keep).length - Math.min(shown, limit) : 0;
  const more = hiddenCount > 0
    ? `<button type="button" class="dt-more" data-n="${hiddenCount}">나머지 ${hiddenCount}개 보기</button>`
    : '';

  return `<div class="card scroll dt-wrap" data-expanded="0">`
    + `<table class="dt"${limit > 0 ? ` data-collapse="${limit}"` : ''}>`
    + `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${more}</div>`;
}

/** 접기·정렬 UI 의 스타일. `report.js` 의 CSS 뒤에 이어 붙는다. */
const TABLE_CSS = `
.dt-wrap { position: relative; }
th[data-k] { white-space: nowrap; }
button.dt-sort {
  background: none; border: 0; padding: 0 0 0 5px; cursor: pointer;
  color: var(--ink-muted); font: inherit; font-size: 11px; line-height: 1;
  vertical-align: baseline;
}
button.dt-sort:hover { color: var(--ink); }
th[aria-sort] button.dt-sort { color: var(--series-1); }
button.dt-more {
  display: block; width: 100%; background: none; cursor: pointer;
  border: 0; border-top: 1px solid var(--border);
  padding: 8px 0; color: var(--ink-2); font: inherit; font-size: 12px;
}
button.dt-more:hover { color: var(--ink); background: var(--plane); }
button.dt-sort:focus-visible, button.dt-more:focus-visible {
  outline: 2px solid var(--series-1); outline-offset: 1px;
}
`;

/**
 * JS 가 없거나 막혔을 때의 폴백. `<head>` 에 넣는다.
 *
 * 방향이 중요하다. "기본 5개 → JS 로 펼치기"가 아니라 **"기본 전체 → JS 로 접기"** 여야
 * 한다. 전자는 JS 가 막히면 데이터가 사라진 리포트가 되고, 후자는 기능만 없어진다.
 */
const TABLE_NOSCRIPT = '<noscript><style>'
  + '.dt tbody tr[hidden]{display:table-row!important}'
  + 'button.dt-more,button.dt-sort{display:none!important}'
  + '</style></noscript>';

/**
 * 접기·정렬 동작. `</body>` 직전에 한 번 들어간다.
 *
 * 이벤트를 표마다 걸지 않고 `document` 에 한 번만 위임한다 — 표가 28개라 개별 등록은
 * 그만큼의 리스너를 만들고, 앞으로 표가 늘어도 코드가 안 바뀌어야 한다.
 */
const TABLE_JS = `
(function () {
  'use strict';
  var NUM = 'num';

  function cellValue(tr, idx, type) {
    var td = tr.cells[idx];
    if (!td) return null;
    var raw = td.getAttribute('data-s');
    if (type === NUM) {
      if (raw === null || raw === '') return null;
      var n = parseFloat(raw);
      return isFinite(n) ? n : null;
    }
    return (raw !== null ? raw : td.textContent).trim().toLowerCase();
  }

  /* 접힘은 정렬이 끝난 **뒤의 위치**로 다시 계산한다. 마크업에 고정하면 정렬을 바꿔도
     원래의 5개가 남아, 보이는 것과 정렬 기준이 어긋난 화면이 된다. */
  function applyCollapse(wrap) {
    var tbl = wrap.querySelector('table.dt');
    var limit = parseInt(tbl.getAttribute('data-collapse') || '0', 10);
    var more = wrap.querySelector('.dt-more');
    var expanded = wrap.getAttribute('data-expanded') === '1';
    var rows = tbl.tBodies[0] ? tbl.tBodies[0].rows : [];
    var shown = 0, hiddenCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!limit || expanded || tr.getAttribute('data-keep') === '1') { tr.hidden = false; continue; }
      if (shown < limit) { tr.hidden = false; shown++; } else { tr.hidden = true; hiddenCount++; }
    }
    if (more) {
      more.textContent = expanded ? '접기' : '나머지 ' + hiddenCount + '개 보기';
      more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      more.hidden = !expanded && hiddenCount === 0;
    }
  }

  function sortBy(wrap, th) {
    var tbl = wrap.querySelector('table.dt');
    var heads = tbl.tHead.rows[0].cells;
    var idx = -1;
    for (var i = 0; i < heads.length; i++) if (heads[i] === th) idx = i;
    if (idx < 0) return;

    /* desc → asc → 기본순서 의 3단계. 기본순서로 돌아갈 길이 있어야 한다 —
       "P95 내림차순"처럼 기본 정렬 자체가 분석상 의미를 가지는 표가 있다. */
    var cur = th.getAttribute('aria-sort');
    var next = cur === 'descending' ? 'asc' : cur === 'ascending' ? null : 'desc';

    for (var j = 0; j < heads.length; j++) {
      heads[j].removeAttribute('aria-sort');
      var b = heads[j].querySelector('.dt-sort');
      if (b) b.textContent = '⇅';
    }
    if (next) {
      th.setAttribute('aria-sort', next === 'desc' ? 'descending' : 'ascending');
      th.querySelector('.dt-sort').textContent = next === 'desc' ? '▼' : '▲';
    }

    var type = th.getAttribute('data-t');
    var tb = tbl.tBodies[0];
    var rows = Array.prototype.slice.call(tb.rows);
    rows.sort(function (a, b2) {
      if (!next) return (+a.getAttribute('data-i')) - (+b2.getAttribute('data-i'));
      var va = cellValue(a, idx, type), vb = cellValue(b2, idx, type);
      /* 결측은 방향과 무관하게 항상 뒤로 보낸다. 없는 값은 "가장 작은 값"이 아니다 —
         오름차순에서 맨 위로 올라오면 그 표는 결측 목록이 된다. */
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      var c = va < vb ? -1 : va > vb ? 1 : 0;
      return next === 'desc' ? -c : c;
    });
    for (var k = 0; k < rows.length; k++) tb.appendChild(rows[k]);
    applyCollapse(wrap);
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target;
    var sortBtn = el.closest ? el.closest('.dt-sort') : null;
    if (sortBtn) { sortBy(sortBtn.closest('.dt-wrap'), sortBtn.closest('th')); return; }
    var moreBtn = el.closest ? el.closest('.dt-more') : null;
    if (moreBtn) {
      var wrap = moreBtn.closest('.dt-wrap');
      wrap.setAttribute('data-expanded', wrap.getAttribute('data-expanded') === '1' ? '0' : '1');
      applyCollapse(wrap);
    }
  });

  /* ── 추세 점 툴팁 ─────────────────────────────────────────────────────────
     점에는 title 속성도 있어서 이 코드가 없어도 브라우저 기본 툴팁이 뜬다. 이건 그것을
     빠르고 읽기 좋게 대체할 뿐이다 — 없어도 정보는 사라지지 않는다. */
  var tip = null;
  function showTip(el) {
    if (!tip) { tip = document.createElement('div'); tip.id = 'tt'; document.body.appendChild(tip); }
    var bits = ['<b>' + el.getAttribute('data-l') + '</b>', el.getAttribute('data-v')];
    if (el.getAttribute('data-st')) bits.push('<span class="m">' + el.getAttribute('data-st') + '</span>');
    if (el.getAttribute('data-note')) bits.push('<span class="m">' + el.getAttribute('data-note') + '</span>');
    bits.push(el.tagName === 'A'
      ? '<span class="go">클릭 → 이 실행의 리포트</span>'
      : '<span class="m">' + (el.className.indexOf('now') >= 0 ? '이번 실행' : '리포트 없음') + '</span>');
    tip.innerHTML = bits.join('<br>');
    var r = el.getBoundingClientRect();
    tip.style.display = 'block';
    /* 화면 밖으로 나가지 않게 좌우를 물린다. 오른쪽 끝 점(=이번 실행)이 가장 자주
       걸리는데 그 툴팁이 잘리면 정작 제일 중요한 회차를 못 읽는다. */
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 6)) + 'px';
    tip.style.top = (r.top - h - 8 < 6 ? r.bottom + 8 : r.top - h - 8) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  document.addEventListener('mouseover', function (ev) {
    var pt = ev.target.closest ? ev.target.closest('.spark-plot .pt') : null;
    if (pt) showTip(pt); else if (!ev.target.closest || !ev.target.closest('#tt')) hideTip();
  });
  /* 키보드로 링크를 훑을 때도 같은 설명이 보여야 한다. */
  document.addEventListener('focusin', function (ev) {
    var pt = ev.target.closest ? ev.target.closest('.spark-plot .pt') : null;
    if (pt) showTip(pt);
  });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, true);

  /* 초기화가 죽으면 접힌 행이 그대로 숨은 채 남는다 — 그건 데이터 손실이다.
     어떤 이유로든 실패하면 전부 펼쳐서 최소한 정보는 온전하게 둔다. */
  try {
    var wraps = document.querySelectorAll('.dt-wrap');
    for (var i = 0; i < wraps.length; i++) applyCollapse(wraps[i]);
  } catch (e) {
    var hid = document.querySelectorAll('.dt tbody tr[hidden]');
    for (var j = 0; j < hid.length; j++) hid[j].hidden = false;
    var btns = document.querySelectorAll('.dt-more, .dt-sort');
    for (var k = 0; k < btns.length; k++) btns[k].hidden = true;
  }
})();
`;

module.exports = { dataTable, COLLAPSE_AFTER, TABLE_CSS, TABLE_JS, TABLE_NOSCRIPT };
