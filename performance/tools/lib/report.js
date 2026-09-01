/**
 * Report Generator — 운영 보고서 수준의 단일 HTML을 만든다.
 *
 * 설계 원칙
 * ---------
 * 1) 자기완결 (self-contained)
 *    외부 CDN/폰트/스크립트를 쓰지 않는다. 이 파일 하나를 슬랙에 올리거나 CI 아티팩트로
 *    내려받아 열었을 때 인터넷 없이도 똑같이 보여야 한다. 성능 보고서는 사고 분석 중에
 *    열리는 일이 많고, 그때 외부 의존은 그냥 깨진 화면이 된다.
 *
 * 2) 결론이 맨 위
 *    보고서를 여는 사람의 첫 질문은 "배포해도 되나?"다. 판정(PASS/WARN/FAIL)과 근거를
 *    최상단에 두고, 숫자 나열은 그 아래로 보낸다. 스크롤해야 결론이 나오는 보고서는 안 읽힌다.
 *
 * 3) 색만으로 의미를 전달하지 않는다
 *    판정은 항상 아이콘 + 텍스트 라벨 + 색 3중으로 표기한다. 색각 이상 독자와 흑백 인쇄를
 *    모두 고려한 것이고, 상태색은 대비가 낮은 단계가 섞여 있어 색 단독으로는 부적절하다.
 *
 * 4) 포화도는 막대로, 추세는 스파크라인으로
 *    "CPU 1.4코어"는 판단이 안 되지만 "한계의 70%" 막대는 즉시 판단된다.
 *    추세는 값 하나가 아니라 모양이 정보이므로 인라인 SVG로 그린다.
 */
'use strict';

const fmt = require('./format');
const cmp = require('./comparability');
// 기준선 탈락 사유 문장은 repository 가 만든다 — 콘솔 리포트와 같은 문장을 써야 한다(S-10).
const repo = require('./repository');
// 긴 목록의 접기·정렬은 표마다 다르게 동작하면 안 된다 — 규칙을 한 곳에 둔다.
const { dataTable, TABLE_CSS, TABLE_JS, TABLE_NOSCRIPT } = require('./report-table');
const { escapeHtml: esc } = fmt;

/* ─────────────────────────── 스타일 ─────────────────────────── */
/* 색상은 검증된 기준 팔레트에서 가져온다. 상태색 4종은 테마 불변, 나머지는 라이트/다크 각각 선택. */
const CSS = `
:root {
  color-scheme: light dark;
  --surface: #fcfcfb;
  --plane: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --ink-muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --seq-100: #cde2fb;
  --seq-450: #2a78d6;
  --good: #0ca30c;
  --warning: #fab219;
  --serious: #ec835a;
  --critical: #d03b3b;
  --good-text: #006300;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --surface: #1a1a19;
    --plane: #0d0d0d;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --ink-muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255,255,255,0.10);
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --seq-100: #184f95;
    --seq-450: #3987e5;
    --good-text: #0ca30c;
  }
}
:root[data-theme="dark"] {
  --surface: #1a1a19; --plane: #0d0d0d; --ink: #ffffff; --ink-2: #c3c2b7;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70;
  --seq-100: #184f95; --seq-450: #3987e5; --good-text: #0ca30c;
}

* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 0 4rem;
  background: var(--plane); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  font-size: 14px; line-height: 1.55;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 15px; margin: 0 0 14px; letter-spacing: 0.02em; text-transform: uppercase;
     color: var(--ink-2); font-weight: 600; }
h3 { font-size: 13px; margin: 20px 0 8px; color: var(--ink-2); font-weight: 600; }
a { color: var(--series-1); }

/* ── 헤더 ── */
.head { background: var(--surface); border-bottom: 1px solid var(--border); padding: 26px 0 22px; margin-bottom: 26px; }
.head-top { display: flex; align-items: flex-start; gap: 18px; flex-wrap: wrap; }
.head-title { flex: 1 1 320px; min-width: 0; }
.sub { color: var(--ink-muted); font-size: 13px; }

.verdict {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: 8px; font-weight: 700; font-size: 14px;
  border: 2px solid; white-space: nowrap;
}
.verdict .ico { font-size: 15px; line-height: 1; }
.v-PASS { color: var(--good-text); border-color: var(--good); background: color-mix(in srgb, var(--good) 10%, transparent); }
.v-WARN { color: var(--ink); border-color: var(--warning); background: color-mix(in srgb, var(--warning) 16%, transparent); }
.v-FAIL { color: var(--critical); border-color: var(--critical); background: color-mix(in srgb, var(--critical) 10%, transparent); }

/* ── 메타 그리드 ── */
.meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 1px;
        background: var(--border); border: 1px solid var(--border); border-radius: 8px;
        overflow: hidden; margin-top: 20px; }
.meta div { background: var(--surface); padding: 9px 12px; }
.meta dt { color: var(--ink-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
.meta dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }

/* ── 섹션/카드 ── */
section { margin-bottom: 34px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }

/* ── KPI 타일 ── */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.kpi .label { color: var(--ink-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi .value { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; margin-top: 3px; }
.kpi .foot { font-size: 12px; color: var(--ink-2); margin-top: 3px; display: flex; align-items: center; gap: 5px; }

/* ── 델타 표기: 아이콘 + 텍스트 + 색 (색 단독 금지) ── */
.d-good { color: var(--good-text); font-weight: 600; }
.d-bad  { color: var(--critical); font-weight: 600; }
.d-flat { color: var(--ink-muted); }

/* ── 표 ── */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--grid); }
th { color: var(--ink-muted); font-weight: 600; font-size: 11px; text-transform: uppercase;
     letter-spacing: 0.04em; border-bottom: 1px solid var(--axis); white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:last-child td { border-bottom: none; }
.scroll { overflow-x: auto; }

/* ── 포화도 막대 ── */
.meter { display: flex; align-items: center; gap: 9px; min-width: 148px; }
.meter .track { flex: 1; height: 7px; background: var(--grid); border-radius: 4px; overflow: hidden; min-width: 60px; }
.meter .fill { height: 100%; border-radius: 4px; background: var(--seq-450); }
.meter .pct { font-variant-numeric: tabular-nums; font-size: 12px; min-width: 42px; text-align: right; color: var(--ink-2); }
.fill.s-warning { background: var(--warning); }
.fill.s-serious { background: var(--serious); }
.fill.s-critical { background: var(--critical); }

/* ── 병목 가설 ── */
.hint { display: flex; gap: 11px; padding: 12px 0; border-bottom: 1px solid var(--grid); }
.hint:last-child { border-bottom: none; }
.hint .n { width: 21px; height: 21px; flex: none; border-radius: 50%; background: var(--critical);
           color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.hint .t { font-weight: 650; margin-bottom: 2px; }
.hint .d { color: var(--ink-2); font-size: 13px; }

/* ── 스파크라인 ── */
.sparks { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 14px; }
.spark { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 13px 15px; }
.spark .st { font-size: 12px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.spark .sv { font-size: 19px; font-weight: 650; margin: 2px 0 6px; letter-spacing: -0.01em; }
.spark svg { display: block; width: 100%; height: 40px; overflow: visible; }
/* 추세 점의 히트 영역. SVG 안이 아니라 위에 얹는다 — preserveAspectRatio="none" 때문에
   SVG 안의 원은 카드 폭에 따라 타원으로 찌그러져 클릭 대상이 일정하지 않다.
   세로 전체를 잡는 이유: 값의 높이를 정확히 맞춰 누르게 하면 아무도 못 누른다. */
.spark-plot { position: relative; }
.spark-plot .pt {
  position: absolute; top: 0; bottom: 0; width: 18px; margin-left: -9px;
  border-radius: 4px; cursor: pointer;
}
.spark-plot span.pt { cursor: default; }
.spark-plot .pt:hover { background: color-mix(in srgb, var(--series-1) 14%, transparent); }
.spark-plot .pt.now::after {
  content: ''; position: absolute; left: 50%; top: -3px; width: 2px; height: 4px;
  margin-left: -1px; background: var(--ink-muted);
}
.spark-plot .pt:focus-visible { outline: 2px solid var(--series-1); outline-offset: 0; }
#tt {
  position: fixed; z-index: 20; max-width: 300px; pointer-events: none;
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
  font-size: 11.5px; line-height: 1.5; box-shadow: 0 4px 14px rgba(0,0,0,0.18);
}
#tt b { display: block; font-size: 12px; }
#tt .m { color: var(--ink-2); }
#tt .go { color: var(--series-1); }
.spark .range { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-muted);
                font-variant-numeric: tabular-nums; margin-top: 3px; }

/* ── 링크 버튼 ── */
.links { display: flex; flex-wrap: wrap; gap: 8px; }
.links a { display: inline-block; padding: 7px 13px; border: 1px solid var(--border); border-radius: 7px;
           background: var(--surface); text-decoration: none; font-size: 13px; font-weight: 550; }
.links a:hover { border-color: var(--series-1); }
.links a.primary { background: var(--series-1); color: #fff; border-color: var(--series-1); }

.badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 5px;
         font-size: 11px; font-weight: 650; border: 1px solid; white-space: nowrap; }
.b-PASS { color: var(--good-text); border-color: var(--good); }
.b-WARN { color: var(--ink); border-color: var(--warning); background: color-mix(in srgb, var(--warning) 16%, transparent); }
.b-FAIL { color: var(--critical); border-color: var(--critical); }
.b-SKIP { color: var(--ink-muted); border-color: var(--axis); }

/* ① 신뢰 확인 줄 — 항상 표시된다 */
.trust { border-left: 3px solid var(--good); }
.trust.trust-bad { border-left-color: var(--critical); }
.trust-head { font-weight: 650; font-size: 13px; margin-bottom: 9px; }
.trust-row { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.trust-item { display: flex; align-items: baseline; gap: 6px; font-size: 12.5px; }
.trust-k { color: var(--ink-muted); }
.trust-v { font-weight: 650; font-variant-numeric: tabular-nums; }
.trust-item.ok .trust-v { color: var(--good-text, var(--good)); }
.trust-item.bad .trust-v { color: var(--critical); }
.trust-n { color: var(--ink-2); font-size: 11.5px; }
/* 포화 자원 줄. 정상일 때도 나오므로 경고색을 기본으로 쓰지 않는다 — 그러면 "항상 빨간
   리포트"가 되어 진짜 경고가 안 보인다. */
.trust-sat { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--border);
  font-size: 12px; line-height: 1.55; }
.trust-sat.ok { color: var(--ink-2); }
.trust-sat.bad { color: var(--ink); }
.trust-sat.unknown { color: var(--ink-muted); }

/* ② 요약의 경고 줄 — 전체 p95 가 감추는 것을 상단에서 알린다 */
.lead { margin-top: 11px; padding: 9px 12px; border-radius: 6px;
        background: color-mix(in srgb, var(--warning) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
        font-size: 12.5px; }
.lead b { font-variant-numeric: tabular-nums; }
.lead + .lead { margin-top: 6px; }

/* 접히는 섹션 */
details.fold > summary { cursor: pointer; font-size: 13px; font-weight: 650; padding: 9px 0;
                         list-style: none; display: flex; align-items: center; gap: 8px; }
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary::before { content: '▸'; color: var(--ink-muted); }
details.fold[open] > summary::before { content: '▾'; }
details.fold > summary .sum-note { font-weight: 400; color: var(--ink-2); font-size: 12px; }

.empty { color: var(--ink-muted); font-style: italic; padding: 10px 0; }
.note { color: var(--ink-2); font-size: 12.5px; margin-top: 10px; padding-left: 11px; border-left: 2px solid var(--grid); }
footer { color: var(--ink-muted); font-size: 12px; border-top: 1px solid var(--border); padding-top: 14px; margin-top: 34px; }
`;

/* ─────────────────────────── 부품 ─────────────────────────── */

const ICON = { PASS: '✓', WARN: '!', FAIL: '✕', SKIP: '·' };

/** 포화도 막대. 색은 임계 구간에 따라 상태색으로 승격되고, 수치가 항상 옆에 붙는다. */
function meter(pctVal) {
  if (!fmt.nz(pctVal)) return '<span class="d-flat">—</span>';
  const p = Math.max(0, Math.min(100, Number(pctVal)));
  const cls = p >= 95 ? 's-critical' : p >= 85 ? 's-serious' : p >= 70 ? 's-warning' : '';
  return `<div class="meter"><div class="track"><div class="fill ${cls}" style="width:${p.toFixed(1)}%"></div></div><span class="pct">${p.toFixed(0)}%</span></div>`;
}

/**
 * 변화량 표기. 방향성을 반영해 "좋아졌는지"로 색을 정한다.
 * P95가 내려가면 초록, TPS가 내려가면 빨강 — 같은 '감소'라도 의미가 반대다.
 */
function deltaCell(c) {
  if (c.deltaPct == null || c.baseline == null) return '<span class="d-flat">—</span>';
  const lowerBetter = c.direction !== 'higher_is_better';
  const improved = lowerBetter ? c.deltaPct < 0 : c.deltaPct > 0;
  const negligible = Math.abs(c.deltaPct) < 1 || c.skipped;
  const cls = negligible ? 'd-flat' : improved ? 'd-good' : 'd-bad';
  const arrow = c.deltaPct > 0 ? '▲' : c.deltaPct < 0 ? '▼' : '·';
  return `<span class="${cls}">${arrow} ${fmt.delta(c.deltaPct)}</span>`;
}

/**
 * 인라인 SVG 스파크라인 — 단일 계열이므로 범례 없이 제목이 계열을 지칭한다.
 * 2px 선, 축/격자 없음(추세 판독에 불필요), 마지막 점만 강조해 현재 위치를 표시한다.
 *
 * 결측 회차를 버리지 않고 **자리를 비워 둔다**
 * ---------------------------------------------
 * 예전에는 첫 줄이 `values.filter(nz)` 였다. 결측을 버리고 남은 값을 0..m-1 로 다시
 * 늘어놓았으므로, **그려진 i 번째 점이 `values[i]` 가 아니었다.**
 *
 * 두 가지가 틀어진다.
 *   1. x 축이 조용히 압축된다. 10회 중 3회가 결측이면 7개 점이 균등 간격으로 그려져,
 *      띄엄띄엄한 이력이 촘촘한 것처럼 보인다. 결측은 옛 실행에서 흔하다 —
 *      `gcPauseMaxMs` 나 `queriesPerReq` 처럼 나중에 추가된 지표가 그렇다.
 *   2. 호출부가 점마다 메타데이터(실행 ID 등)를 붙이면 **엉뚱한 실행을 가리킨다.**
 *      추세 점에 리포트 링크를 다는 순간 이 오차가 오작동으로 드러난다.
 *
 * 그래서 값과 **원래 인덱스를 쌍으로 유지**하고, x 는 언제나 원래 인덱스로 정한다.
 * 결측 구간은 선이 건너뛰며 그 자리가 넓어진다 — 그것이 사실이다.
 *
 * `opts.pointHtml(value, index)` 를 주면 점마다 추가 마크업을 얹는다(추세 카드의 히트
 * 영역). 안 주면 예전과 똑같이 마지막 점만 강조한다 — history.js·detail-report.js 가
 * 인자 하나로 부르고 있으므로 기본 동작이 바뀌면 안 된다.
 */
function sparkline(values, opts = {}) {
  const n = values.length;
  const pts = values.map((v, i) => ({ v, i })).filter((p) => fmt.nz(p.v));
  if (pts.length < 2) return '<svg viewBox="0 0 100 40" preserveAspectRatio="none"></svg>';

  const W = 100, H = 40, PAD = 3;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || Math.abs(max) || 1;
  // 분모는 그려진 점의 수가 아니라 **전체 회차 수**다. 이것이 이 함수의 핵심 수정이다.
  const x = (i) => (n < 2 ? 0 : (i / (n - 1)) * W);
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  // 면적은 그려진 첫 점과 마지막 점 사이에서만 닫는다. 예전처럼 0..W 로 닫으면 앞뒤가
  // 결측인 계열에서 존재하지 않는 구간까지 칠해진다.
  const firstX = x(pts[0].i);
  const last = pts[pts.length - 1];
  const lastX = x(last.i);
  const lastY = y(last.v);
  const area = `${d} L${lastX.toFixed(2)},${H} L${firstX.toFixed(2)},${H} Z`;
  const color = opts.color || 'var(--series-1)';

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.label || '추세')}">
  <path d="${area}" fill="${color}" opacity="0.10"/>
  <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
        vector-effect="non-scaling-stroke"/>
  <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="2.6" fill="${color}"
          stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>
</svg>`;
}

/**
 * 스파크라인 위에 겹칠 점별 히트 영역의 **좌표만** 계산한다.
 *
 * SVG 안에 `<circle>` 로 만들지 않는 이유: 스파크라인은 `preserveAspectRatio="none"` 으로
 * 100×40 viewBox 를 카드 폭에 맞춰 늘여 그린다. 그 안의 원은 가로로 찌그러진 타원이 되고,
 * 카드 폭에 따라 히트 영역 모양이 달라진다. 그래서 좌표(퍼센트)만 여기서 내고 마크업은
 * HTML 로 얹는다.
 */
function sparkPointsPct(values) {
  const n = values.length;
  return values.map((v, i) => ({
    value: v,
    index: i,
    present: fmt.nz(v),
    leftPct: n < 2 ? 0 : (i / (n - 1)) * 100,
  }));
}

/**
 * 추세 카드 하나. `runs` 를 주면 점마다 **그 회차의 리포트로 가는 링크**가 붙는다.
 *
 * 히트 영역을 SVG 안이 아니라 HTML 로 얹는 이유는 `sparkPointsPct` 의 주석에 적었다 —
 * `preserveAspectRatio="none"` 때문에 SVG 안의 원은 카드 폭에 따라 찌그러진다.
 *
 * 툴팁은 `title` 속성(브라우저 기본)과 JS 툴팁을 **둘 다** 둔다. JS 가 막혀도 느리고
 * 못생긴 기본 툴팁으로 같은 정보가 나온다 — 표 접기와 같은 원칙이다.
 *
 * 툴팁 내용을 JSON 한 덩어리가 아니라 개별 `data-*` 속성으로 싣는 것은 보안 요구다.
 * `sanitize-reports.js` 는 게시 전에 실행 메모·커밋·URL 같은 값을 **원시 문자열 치환**으로
 * 지운다. JSON.stringify 로 감싸면 이스케이프 방식이 달라져 그 치환이 조용히 빗나간다.
 * 기존 렌더와 같은 `esc()` 만 써야 정화가 지금과 똑같이 동작한다.
 */
function sparkCard(title, values, current, unit, runs, exists) {
  const vals = values.filter((v) => fmt.nz(v));
  const min = vals.length ? Math.min(...vals) : null;
  const max = vals.length ? Math.max(...vals) : null;

  const pts = (runs && runs.length === values.length) ? sparkPointsPct(values).map((p) => {
    const r = runs[p.index] || {};
    const isLast = p.index === values.length - 1;
    const label = `#${r.number == null ? '?' : r.number} · ${fmt.localTime(r.startedAt)}`
      + `${r.commitShort ? ` · ${r.commitShort}` : ''}`;
    const valueText = p.present ? fmt.byUnit(p.value, unit) : '미수집';
    const state = [
      r.saturationStatus ? `포화 ${r.saturationStatus}` : null,
      r.verdict ? `판정 ${r.verdict}` : null,
    ].filter(Boolean).join(' · ');
    // 브라우저 기본 툴팁은 줄바꿈만 지원한다. JS 툴팁은 같은 값을 data-* 에서 읽는다.
    const plain = [label, `${title} ${valueText}`, state, r.note || '',
      isLast ? '이번 실행' : '클릭 → 이 실행의 리포트'].filter(Boolean).join('\n');
    const attrs = `style="left:${p.leftPct.toFixed(2)}%"`
      + ` data-l="${esc(label)}" data-v="${esc(`${title} ${valueText}`)}"`
      + `${state ? ` data-st="${esc(state)}"` : ''}`
      + `${r.note ? ` data-note="${esc(r.note)}"` : ''}`
      + ` title="${esc(plain)}"`;
    // 마지막 점은 이번 실행이라 자기 자신으로 가는 링크가 되면 안 된다. 리포트가 아직
    // 없는 회차도 링크를 걸지 않는다 — 죽은 링크는 정보가 아니라 오작동이다.
    if (isLast || !r.id || !exists(r.id)) {
      return `<span class="pt${isLast ? ' now' : ''}${p.present ? '' : ' gap'}" ${attrs}></span>`;
    }
    return `<a class="pt${p.present ? '' : ' gap'}" href="../${encodeURIComponent(r.id)}/report.html" ${attrs}></a>`;
  }).join('') : '';

  return `<div class="spark">
    <div class="st">${esc(title)}</div>
    <div class="sv">${fmt.byUnit(current, unit)}</div>
    <div class="spark-plot">${sparkline(values, { label: title })}${pts}</div>
    <div class="range"><span>min ${fmt.byUnit(min, unit)}</span><span>max ${fmt.byUnit(max, unit)}</span></div>
  </div>`;
}

function kpi(label, value, foot) {
  return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
}

/* ─────────────────────────── 섹션 ─────────────────────────── */

/**
 * 앱 이미지 신원 한 줄. 해시만 찍으면 사람이 못 읽으므로 빌드 시각을 같이 낸다 —
 * "언제 만든 바이너리를 쟀는가"가 실제로 필요한 정보다.
 */
function formatAppImage(img) {
  if (!img || !img.available) return '미기록';
  const short = String(img.imageId).replace(/^sha256:/, '').slice(0, 12);
  const built = img.imageCreated ? fmt.localTime(img.imageCreated) : '빌드 시각 불명';
  return `${short} · ${built}${img.stale ? ' · ⚠ 소스보다 낡음' : ''}`;
}

function sectionHeader(record) {
  const r = record.run;
  const reg = record.regression;
  // 옛 스키마(k6.overall)와 결측을 함께 흡수한다 — sectionSummary 의 같은 줄 참고.
  const all = record.k6.all || record.k6.overall || {};
  const v = reg.verdict;
  const verdictText = { PASS: '통과', WARN: '주의', FAIL: '실패' }[v] || v;

  const meta = [
    ['시나리오', r.scenario],
    ['환경', r.environment],
    ['브랜치', r.branch],
    // ⚠ 이 값은 **실험을 설계한 소스**이지 측정된 바이너리가 아니다. 무엇을 쟀는지는
    // 바로 아래 '앱 이미지' 가 답한다(T-42). 지우지 않는 이유는 "어떤 소스로 실험을
    // 설계했는가"도 그 자체로 쓸모가 있기 때문이다.
    ['커밋(설계 기준)', r.commitShort],
    ['앱 이미지(측정 대상)', formatAppImage(r.appImage)],
    ['빌드', r.buildNumber],
    ['실행자', r.executor],
    ['시작', fmt.localTime(r.startedAt)],
    ['종료', fmt.localTime(r.endedAt)],
    ['수행 시간', fmt.duration(r.durationSec)],
    ['VU 최대', fmt.num(all.vusMax, 0)],
    ['Ramp-up', r.rampUp || '—'],
    ['데이터셋', r.dataset],
    // 선언된 부하 프로파일 — 위의 'VU 최대'는 관측값이라 서버가 느려지면 같이 움직인다.
    // 비교 가능성을 판정하는 건 이쪽이다.
    ['부하 프로파일', cmp.formatLoadProfile(r.loadProfile)],
    // 측정 구간 설계(T-03/S-08) — k6와 Prometheus가 같은 구간을 봤는지는 이 값으로 판단한다.
    ['측정 구간', cmp.formatMeasurementProfile(r.phasePlan)],
    ['스크립트 버전', r.scriptVersion],
    // 판정과 별개의 축(T-08) — 이 실행이 판정을 내릴 데이터를 실제로 가졌는지.
    ['측정 상태', reg.measurementStatus || '—'],
    ['조건 계열', reg.seriesHash || '—'],
    ['Run ID', r.id],
  ];

  return `<div class="head"><div class="wrap">
    <div class="head-top">
      <div class="head-title">
        <h1>Performance Test Report — ${esc(r.scenario)}</h1>
        <div class="sub">Run #${r.number} · ${esc(r.environment)} · ${fmt.localTime(r.startedAt)}</div>
      </div>
      <div class="verdict v-${v}"><span class="ico">${ICON[v]}</span><span>${verdictText}</span></div>
    </div>
    ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
    <dl class="meta">${meta.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val == null ? '—' : val)}</dd></div>`).join('')}</dl>
  </div></div>`;
}

/**
 * 측정 상태 배너 — 성능 판정보다 먼저 읽혀야 하는 정보다(T-08).
 *
 * 리포트를 여는 사람은 상단의 통과/실패 배지부터 본다. 그 배지가 "잰 결과"인지 "재지 못한
 * 결과"인지 모르면 판정을 잘못 읽는다. 그래서 요약 지표보다 위에, 판정과 별도의 블록으로
 * 놓는다. 정상 측정이면 아무것도 그리지 않는다 — 항상 뜨는 배너는 곧 안 읽히는 배너다.
 */
/**
 * ① 이 실행을 믿어도 되는가 — **항상 한 줄로 표시한다.**
 *
 * 고치기 전에는 이 정보가 이상할 때만 나왔다. `saturation.js` 는 포화일 때만 경고를 띄우고
 * `sectionMeasurement` 은 결측이 있을 때만 나타나므로, **정상임을 확인할 방법이 리포트에
 * 없었다** — `run.json` 이나 `index.json` 을 열어야 했다. 사람이 기계 판독 파일을 열어야
 * 한다면 그건 리포트의 실패다.
 *
 * **경고가 없는 것과 "확인했고 정상"은 다르다.** 전자는 판정이 아직 안 붙은 옛 실행일
 * 수도 있다. E-46 이 닷새를 소모한 이유가 *"아무도 이 조합을 측정 무효화 조건으로 선언하지
 * 않았다"* 였으므로, 선언 자체를 화면에 남긴다.
 *
 * 다섯 항목은 판정 전에 반드시 통과해야 하는 것들이다.
 *   측정 무결성  지표가 다 있는가                 MEASURED
 *   측정 체제    p95 를 앱 지연으로 읽어도 되는가  HEADROOM
 *   도달률      의도한 부하가 실제로 걸렸는가      100% 근처
 *   오류율      요청이 실제로 성공했는가           0%
 *   코드        지금 소스를 잰 것이 맞는가         이미지가 소스보다 새것
 *
 * 마지막 항목이 여기 있는 이유. 상단 메타의 `커밋` 은 실행 시점 작업 트리의 HEAD 일 뿐
 * 컨테이너 안에서 도는 바이너리가 아니다. 실제로 8/14 이미지를 두 주 동안 계속 재면서
 * 기록에는 그때그때의 HEAD 를 남기고 있었고, 그 사실을 컨테이너를 직접 열어 보고서야
 * 알았다(T-42). **무엇을 쟀는지 모르는 실행은 판정에 쓸 수 없다** — 그러니 판정 앞에 선다.
 */
function sectionTrust(record) {
  const reg = record.regression || {};
  const sat = record.saturation || {};
  const k = (record.k6 && ((record.k6.phases && record.k6.phases.measure) || record.k6.all)) || {};

  const cell = (label, value, ok, note) => `<div class="trust-item ${ok ? 'ok' : 'bad'}">
    <span class="trust-k">${esc(label)}</span>
    <span class="trust-v">${esc(value)}</span>
    ${note ? `<span class="trust-n">${esc(note)}</span>` : ''}
  </div>`;

  const items = [];

  const ms = reg.measurementStatus || '기록 없음';
  items.push(cell('측정', ms, ms === 'MEASURED',
    ms === 'MEASURED' ? '' : ms === 'PARTIAL' ? '참고 지표 일부 결측' : '판정 불가'));

  const st = sat.status || null;
  items.push(cell('포화 판정', st || '판정 없음', st === 'HEADROOM',
    st === 'HEADROOM' ? 'p95 를 앱 지연으로 읽어도 된다'
      : st === 'NEAR_LIMIT' ? '큐가 생기기 시작했다 — 해석 주의'
        : st === 'SATURATED' ? 'p95 는 큐 대기다. 앱 지연으로 인용 금지'
          : '이 실행에는 포화 판정이 없다(옛 실행)'));

  const rate = fmt.nz(k.achievedRatePct) ? k.achievedRatePct : null;
  if (rate != null) {
    items.push(cell('도달률', `${rate.toFixed(1)}%`, rate >= 95,
      rate >= 95 ? '' : '의도한 부하가 걸리지 않았다'));
  }

  const err = fmt.nz(k.errorRate) ? k.errorRate * 100 : null;
  if (err != null) {
    items.push(cell('오류율', `${err.toFixed(2)}%`, err < 1, err < 1 ? '' : '실패 응답이 지연에 섞였다'));
  }

  // 무엇을 쟀는가. 이미지가 소스보다 오래됐으면 이 실행은 **옛 코드**를 잰 것이고,
  // 그 사실을 모른 채 개선 실험의 After 로 쓰면 "효과 없음"과 "코드가 안 들어감"이
  // 구분되지 않는다.
  const img = record.run && record.run.appImage;
  if (img && img.available) {
    const short = String(img.imageId).replace(/^sha256:/, '').slice(0, 12);
    if (img.stale) {
      const days = (img.staleBySec / 86400).toFixed(1);
      items.push(cell('코드', short, false, `이미지가 소스보다 ${days}일 낡음 — 옛 코드를 잰 실행이다`));
    } else if (img.stale === null) {
      items.push(cell('코드', short, false, '이미지와 소스의 선후를 판정하지 못했다'));
    } else {
      items.push(cell('코드', short, true, '이미지가 소스보다 새것이다'));
    }
  } else {
    items.push(cell('코드', '미기록', false, '무엇을 쟀는지 알 수 없다 — 커밋 값은 답이 아니다'));
  }

  const allOk = items.every((h) => h.includes('trust-item ok'));
  return `<section><div class="card trust ${allOk ? 'trust-ok' : 'trust-bad'}">
    <div class="trust-head">${allOk ? '이 실행은 판정에 쓸 수 있다' : '판정 전에 확인이 필요하다'}</div>
    <div class="trust-row">${items.join('')}</div>
    ${saturationLine(sat)}
  </div></section>`;
}

/**
 * 신뢰표 두 번째 줄 — **무엇이 포화됐는가.**
 *
 * `SATURATED` 라고만 말하면 처방을 못 고른다. 자원마다 다음에 볼 곳이 다르기 때문이다 —
 * 커넥션 풀이면 풀 크기와 보유 시간, CPU throttled 면 CPU 상한, 힙이면 할당률이다.
 *
 * 왜 첫 화면이어야 하는가(E-51). 반복 세트에서 회차 하나가 2.4배 느렸고 원인은 커넥션 풀
 * 고갈이었다(대기 20, 풀 100%). 그런데 그 회차 리포트의 첫 줄은 `NEAR_LIMIT` 이라고만
 * 말했고, "풀이 찼다"를 보려면 문서 중간의 자원 섹션을 펼쳐야 했다. 원인 후보 7개를
 * 기각한 뒤에야 도달했다 — 첫 줄에 `커넥션 풀 대기 20` 이 있었으면 5분에 끝났을 조사다.
 *
 * **정상일 때도 반드시 한 줄을 낸다.** 경고가 없는 것과 "확인했고 정상"은 다르다. 전자는
 * 판정이 아직 안 붙은 옛 실행일 수도 있다. 무엇을 확인했고 얼마였는지를 남긴다.
 *
 * 자료는 이미 `record.saturation.signals` 에 있다 — 데이터가 아니라 화면이 없었다.
 */
function saturationLine(sat) {
  const signals = (sat && sat.signals) || [];
  if (!signals.length) {
    return '<div class="trust-sat unknown">포화 판정 없음 — 어느 자원도 확인되지 않았다. 값을 직접 볼 것</div>';
  }

  const known = signals.filter((s) => s.level && s.level !== 'unknown' && s.value != null);
  // 옛 run.json 에는 signal 에 unit 이 없다. 그 기록도 다시 그려야 하므로 키로 보정한다.
  const unitOf = (s) => (s.unit != null ? s.unit : (s.key === 'hikariPending' ? '개' : '%'));
  // `fmt.num(v, 2)` 는 자릿수를 고정해 "대기 스레드 20.00개"처럼 읽힌다. 개수와 비율이
  // 한 줄에 섞이는 자리라 의미 없는 0 은 떨군다 — 20 은 20, 40.67 은 40.67 로.
  const show = (s) => `${esc(s.label)} ${+Number(s.value).toFixed(2)}${unitOf(s)}`;

  const bad = known.filter((s) => s.level !== 'ok')
    .sort((a, b) => {
      if ((a.level === 'fail') !== (b.level === 'fail')) return a.level === 'fail' ? -1 : 1;
      return (b.value / (b.warn || 1)) - (a.value / (a.warn || 1));
    });

  if (bad.length) {
    const parts = bad.map((s) => {
      const th = s.warn != null && s.fail != null ? ` (임계 warn ${s.warn}${unitOf(s)} / fail ${s.fail}${unitOf(s)})` : '';
      return `<b>${show(s)}</b>${th}`;
    }).join(' · ');
    const tail = sat.status === 'SATURATED'
      ? ' → p95 는 애플리케이션 지연이 아니라 큐 대기다. 앱 지연으로 인용하면 안 된다.'
      : ' → 아직 판정에 쓸 수 있지만, 이 값이 더 오르면 p95 에 대기가 섞이기 시작한다.';
    return `<div class="trust-sat bad">⚠ ${parts}${tail}</div>`;
  }

  // 가장 임계에 가까운 신호 하나를 같이 낸다. "전부 이하"만으로는 여유가 얼마인지 모른다.
  // 도착률은 낮을수록 나쁜 반대 부호라 이 비교에서 제외한다 — 섞으면 순위가 뒤집힌다.
  const ratioed = known.filter((s) => s.key !== 'achievedRate' && s.warn);
  const nearest = ratioed.length
    ? ratioed.reduce((a, b) => ((b.value / b.warn) > (a.value / a.warn) ? b : a))
    : null;
  const near = nearest
    ? ` (가장 근접: <b>${show(nearest)}</b> / 임계 ${nearest.warn}${unitOf(nearest)})`
    : '';
  return `<div class="trust-sat ok">✓ 자원 여유 있음 — 신호 ${known.length}개 전부 임계 이하${near}</div>`;
}

function sectionMeasurement(record) {
  const reg = record.regression;
  const status = reg.measurementStatus;
  if (!status || status === 'MEASURED') return '';

  const missing = reg.missingRequired || [];
  const optional = reg.missingOptional || [];

  if (status === 'UNMEASURED') {
    return `<section><div class="card">
      <div class="hint">
        <div class="n">!</div>
        <div>
          <div class="t">측정 불가 — 이 실행의 성능 판정은 신뢰할 수 없다</div>
          <div class="d">
            판정에 반드시 필요한 지표 ${missing.length}건을 수집하지 못했다.
            <b>서버가 느리다는 뜻이 아니라, 채점할 답안지가 없다는 뜻이다.</b>
            아래 지표를 공급하는 쪽(Prometheus·익스포터·k6 실행)을 먼저 확인해야 한다.
            ${missing.map((k) => `<div><code>${esc(k)}</code></div>`).join('')}
            ${reg.windowIncomplete ? '<div>측정 구간이 계획보다 짧게 끝났다(조기 종료).</div>' : ''}
          </div>
        </div>
      </div>
    </div></section>`;
  }

  const why = [];
  if (optional.length) why.push(`참고 지표 ${optional.length}건이 비어 있다`);
  if (reg.windowIncomplete) why.push('측정 구간이 계획보다 짧게 끝났다');
  return `<section><div class="card">
    <div class="hint">
      <div class="n">!</div>
      <div>
        <div class="t">부분 측정 — 판정은 유효하지만 일부 지표가 비어 있다</div>
        <div class="d">
          ${esc(why.join('. '))}. 게이트 지표는 모두 수집됐으므로 위 판정 자체는 그대로 읽어도 된다.
          다만 익스포터 하나가 조용히 죽으면 이 상태로 나타난다 — 반복되면 수집 설정을 확인할 것.
          ${optional.length ? `<div style="margin-top:6px">${optional.map((k) => `<code>${esc(k)}</code>`).join(' · ')}</div>` : ''}
        </div>
      </div>
    </div>
  </div></section>`;
}

/**
 * 요약 바로 아래에 붙는 경고 줄 — **전체 p95 가 무엇을 감추고 있는지 상단에서 알린다.**
 *
 * 왜 필요한가. 실측에서 전체 p95 는 368ms 인데 `comment` 기능의 p95 는 2,185ms 였다.
 * **5.9배 차이**인데 전자는 문서 12%, 후자는 79% 에 있어 어디에서도 나란히 놓이지 않았다.
 * 상단만 보고 *"368ms, 직전 대비 −1.9%, 안정적"* 이라 판단하면 그대로 닫게 된다.
 *
 * **선정 기준은 단순 p95 최댓값이 아니다.** 요청 30건짜리 관리 API 가 3초면 1위가 되지만
 * 사용자 체감 영향은 거의 없다. 그래서 **요청 수 상위 80% 안에서** 고른다 — 드물게 호출되는
 * 느린 경로가 헤드라인을 차지하는 것을 막는다. 그런 경로는 아래 Breakdown 표에 그대로
 * 남으므로 정보가 사라지지는 않는다.
 */
function leadLines(record, k) {
  const bd = (record.k6 && record.k6.breakdown) || {};
  const gatePhase = (record.run && record.run.phasePlan && record.run.phasePlan.gatePhase) || 'measure';
  const overall = fmt.nz(k.p95) ? k.p95 : null;
  if (!overall) return '';

  const pick = (axis) => {
    const rows = Object.entries(bd[axis] || {})
      .map(([tag, s]) => ({ tag, s: normalizeCell(s, gatePhase) }))
      .filter((r) => r.s && fmt.nz(r.s.p95) && r.s.p95 > 0 && fmt.nz(r.s.count) && r.s.count > 0);
    if (rows.length < 2) return null;
    // 요청 수 상위 80% 컷 — 누적이 아니라 "가장 많이 호출된 것의 20% 이상"으로 잡는다.
    // 누적 80% 는 축이 고르게 퍼지면 대부분을 통과시켜 필터 역할을 못 한다.
    const maxCount = Math.max(...rows.map((r) => r.s.count));
    const eligible = rows.filter((r) => r.s.count >= maxCount * 0.2);
    if (!eligible.length) return null;
    eligible.sort((a, b) => b.s.p95 - a.s.p95);
    const top = eligible[0];
    if (top.s.p95 <= overall * 1.5) return null;   // 전체와 비슷하면 알릴 것이 없다
    return top;
  };

  const total = fmt.nz(k.httpReqs) ? k.httpReqs : null;
  const line = (label, hit) => {
    const share = total ? ` · 전체 요청의 ${((hit.s.count / total) * 100).toFixed(0)}%` : '';
    return `<div class="lead">가장 느린 ${esc(label)}: <b>${esc(hit.tag)} ${fmt.ms(hit.s.p95)}</b>
      — 전체 P95(${fmt.ms(overall)})의 <b>${(hit.s.p95 / overall).toFixed(1)}배</b>
      <span class="d-flat">(${fmt.num(hit.s.count, 0)}건${share}. 요청 수 상위 구간에서 선정)</span></div>`;
  };

  const out = [];
  const byName = pick('name');
  if (byName) out.push(line('API', byName));
  const byFeature = pick('feature');
  // API 축이 이미 같은 곳을 가리키면 기능 줄은 중복이다.
  if (byFeature && !(byName && byName.tag.startsWith(byFeature.tag))) out.push(line('기능', byFeature));
  return out.join('');
}

function sectionSummary(record, previous) {
  // 게이트가 실제로 보는 값(k6.phases.measure)을 기본으로 보여준다(T-03/S-08) — warmup·
  // rampdown이 섞인 전체 구간이 아니다. measure 구간이 없는 실행(진단 시나리오·과거
  // run.json)만 k6.all로 폴백하고, 그 사실을 라벨로 밝힌다(조용히 같은 것처럼 안 보인다).
  const measure = record.k6.phases && record.k6.phases.measure;
  // **`k6.all` 이 없는 옛 실행이 있다.** phase 인식 집계 도입 전 스키마는 전체 구간 통계를
  // `k6.overall` 에 두었고, 그 레코드로 리포트를 다시 그리면 여기서 죽었다 — 저장된 73건
  // 중 34건이 재생성에 실패한 원인이 이것이다. 원자료는 멀쩡하므로 빈 객체로 받아 넘긴다.
  const all = record.k6.all || record.k6.overall || {};
  const k = measure || all;
  const prevPhases = previous && previous.k6.phases && previous.k6.phases.measure;
  const p = previous ? (prevPhases || previous.k6.all) : null;
  // 회귀 판정이 이미 계산한 "노이즈 범위인가"를 그대로 쓴다(T-41). 같은 값을 두 번
  // 계산하면 어긋날 수 있고, 판정 기준(rules.json 의 noiseFloor)이 한 곳에서만 나와야 한다.
  const byKey = {};
  for (const c of (record.regression && record.regression.comparisons) || []) byKey[c.key] = c;
  const phaseKey = measure ? 'k6.phases.measure.' : 'k6.all.';

  /**
   * 변화율 셀 — **노이즈 범위면 화살표를 그리지 않는다.**
   *
   * 고치기 전에는 절대 변화가 아무리 작아도 퍼센트만 보고 굵은 화살표를 그렸다. 실측에서
   * `평균 93ms ▲ +26.4%` 가 나왔는데 그 지표의 실제 표준편차는 11.3ms 였다 — 즉 아무것도
   * 바뀌지 않아도 그 정도는 움직인다. 이런 표시가 반복되면 읽는 사람은 **변화율 전체를
   * 무시하게 된다.**
   *
   * 숨기지는 않는다. 숨기면 "왜 안 보이지"가 되므로, **판정 결과를 문자로 적는다.**
   */
  const cmp = (key, dir) => {
    if (!p || !fmt.nz(p[key]) || !fmt.nz(k[key]) || p[key] === 0) return '';
    const pctChange = ((k[key] - p[key]) / Math.abs(p[key])) * 100;
    const c = byKey[phaseKey + key];
    if (c && c.withinNoise) {
      const floor = c.noiseFloor != null ? ` ±${fmt.ms(c.noiseFloor)}` : '';
      return `<span class="d-flat">노이즈 범위${esc(floor)}</span><span class="d-flat">직전 대비</span>`;
    }
    const improved = dir === 'higher' ? pctChange > 0 : pctChange < 0;
    const cls = Math.abs(pctChange) < 1 ? 'd-flat' : improved ? 'd-good' : 'd-bad';
    const arrow = pctChange > 0 ? '▲' : pctChange < 0 ? '▼' : '·';
    return `<span class="${cls}">${arrow} ${fmt.delta(pctChange)}</span><span class="d-flat">직전 대비</span>`;
  };

  return `<section><h2>Performance Summary (${measure ? 'measure 구간' : '전체 구간 — 측정 구간 미분리'})</h2><div class="kpis">

    ${kpi('평균 응답시간', fmt.ms(k.avg), cmp('avg', 'lower'))}
    ${kpi('P95', fmt.ms(k.p95), cmp('p95', 'lower'))}
    ${kpi('P99', fmt.ms(k.p99), cmp('p99', 'lower'))}
    ${kpi('TPS', fmt.num(k.tps, 2), cmp('tps', 'higher'))}
    ${kpi('RPS', fmt.num(k.rps, 1), cmp('rps', 'higher'))}
    ${kpi('오류율', fmt.pct(k.errorRate * 100, 2), cmp('errorRate', 'lower'))}
  </div>
  ${leadLines(record, k)}

  <h3>지연 분포</h3>
  <div class="card scroll"><table>
    <thead><tr><th>지표</th><th class="num">최소</th><th class="num">평균</th><th class="num">중앙값</th>
      <th class="num">P90</th><th class="num">P95</th><th class="num">P99</th><th class="num">최대</th></tr></thead>
    <tbody><tr>
      <td>전체 HTTP 요청</td>
      <td class="num">${fmt.ms(k.min)}</td><td class="num">${fmt.ms(k.avg)}</td><td class="num">${fmt.ms(k.med)}</td>
      <td class="num">${fmt.ms(k.p90)}</td><td class="num">${fmt.ms(k.p95)}</td><td class="num">${fmt.ms(k.p99)}</td>
      <td class="num">${fmt.ms(k.max)}</td>
    </tr></tbody>
  </table></div>

  <h3>처리량 · 검증</h3>
  <div class="card scroll"><table>
    <tbody>
      <tr><td>총 HTTP 요청</td><td class="num">${fmt.num(k.httpReqs, 0)}</td>
          <td>완료 Iteration</td><td class="num">${fmt.num(k.iterations, 0)}</td></tr>
      <tr><td>실패 요청 (전체 구간)</td><td class="num">${fmt.num(all.failedRequests, 0)}</td>
          <td>Check 성공률</td><td class="num">${fmt.pct(k.checkRate * 100, 2)}</td></tr>
      <tr><td>서버 대기(waiting) 평균 (전체 구간)</td><td class="num">${fmt.ms(all.waitingAvgMs)}</td>
          <td>서버 대기 P95 (전체 구간)</td><td class="num">${fmt.ms(all.waitingP95Ms)}</td></tr>
      <tr><td>Iteration 평균 소요 (전체 구간)</td><td class="num">${fmt.ms(all.iterationDurationAvgMs)}</td>
          <td>연결(blocked) 평균 (전체 구간)</td><td class="num">${fmt.ms(all.blockedAvgMs)}</td></tr>
      <tr><td>수신 데이터 (전체 구간)</td><td class="num">${fmt.bytes(all.dataReceivedBytes)}</td>
          <td>송신 데이터 (전체 구간)</td><td class="num">${fmt.bytes(all.dataSentBytes)}</td></tr>
    </tbody>
  </table></div>
  </section>`;
}

/**
 * breakdown 한 칸을 **판정에 쓸 수 있는 형태로 정규화한다** (T-38).
 *
 * 같은 축 안에서 레코드 모양이 두 가지다. `summary.js` 의 `breakdown()` 이 태그 구성에
 * 따라 다르게 만들기 때문이다.
 *
 *   {feature:comment}              → 전체 구간 통계가 **최상위**에      { count, p95, ... }
 *   {op:read,phase:measure}        → 구간 통계가 **byPhase 아래**에     { count, byPhase:{measure:{...}} }
 *
 * 두 번째 모양이 생기는 이유는 `op:read`·`op:write` 가 실제 SLO 축이라 measure 구간으로만
 * 선언되기 때문이다(S-28) — 태그 없는 형태를 만들면 warmup 이상치가 실행 전체를 FAIL
 * 시킨다.
 *
 * **이 함수가 없던 동안 read·write 의 응답시간이 리포트에 0 으로 표시됐다.** 실측 예:
 * read 의 실제 p95 는 436.9ms·p99 2,179ms(6,840건)인데 화면에는 0 이었고, 값이 최상위에
 * 있는 auth(154건, 요청의 2%)만 정상으로 보였다. 전체 p99 가 2,148ms 인데 read 의 p99 가
 * 2,179ms 였으므로, **꼬리를 만드는 것이 read 라는 결정적 단서를 리포트가 감추고 있었다.**
 *
 * `count` 는 항상 최상위에 있다(요청 수 축은 태그 없이 선언되므로). 그래서 구간 통계에
 * 최상위 `count` 를 얹어 돌려준다.
 */
function normalizeCell(cell, gatePhase) {
  if (!cell) return null;
  if (fmt.nz(cell.p95)) return cell;                       // 최상위에 값이 있으면 그대로
  const scoped = cell.byPhase && (cell.byPhase[gatePhase] || cell.byPhase.measure);
  if (!scoped) return cell;
  return { ...scoped, count: cell.count != null ? cell.count : scoped.count };
}

function sectionBreakdown(record) {
  const bd = record.k6.breakdown || {};
  const gatePhase = (record.run && record.run.phasePlan && record.run.phasePlan.gatePhase) || 'measure';
  const axes = Object.keys(bd).filter((a) => Object.keys(bd[a] || {}).length);
  if (!axes.length) return '';

  const labels = { feature: '기능별', op: '오퍼레이션별', name: '엔드포인트별', page: '목록 페이지별' };
  // 엔드포인트 축을 먼저 보여준다 — 병목을 좁히는 마지막 단계이므로 가장 자주 쓰인다(T-39).
  const ORDER = ['name', 'feature', 'op', 'page', 'expected_response'];
  axes.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const blocks = axes.map((axis) => {
    // 이 시나리오에서 호출되지 않은 기능은 서브메트릭이 0으로 생성된다 — 표에서 제외한다.
    // (모든 기능 축을 미리 선언해 두기 때문에 생기는 빈 행이다.)
    const entries = Object.entries(bd[axis])
      .map(([tag, s]) => [tag, normalizeCell(s, gatePhase)])
      .filter(([, s]) => s && fmt.nz(s.p95) && s.p95 > 0)
      .sort((a, b) => (b[1].p95 || 0) - (a[1].p95 || 0));
    if (!entries.length) return '';

    const rows = entries.map(([tag, s]) => ({
      cells: {
        tag: esc(tag),
        count: fmt.num(s.count, 0),
        avg: fmt.ms(s.avg),
        p90: fmt.ms(s.p90),
        p95: fmt.ms(s.p95),
        p99: fmt.ms(s.p99),
        max: fmt.ms(s.max),
      },
      // 표시값은 `4.02s` 와 `429.55ms` 가 섞인 문자열이라 그대로 정렬하면 틀린다.
      sort: {
        tag, count: s.count, avg: s.avg, p90: s.p90, p95: s.p95, p99: s.p99, max: s.max,
      },
    }));

    return `<h3>${esc(labels[axis] || axis)} 응답시간 (P95 내림차순)</h3>` + dataTable({
      columns: [
        { key: 'tag', label: axis, sort: 'text' },
        { key: 'count', label: '요청 수', align: 'right', sort: 'num' },
        { key: 'avg', label: '평균', align: 'right', sort: 'num' },
        { key: 'p90', label: 'P90', align: 'right', sort: 'num' },
        { key: 'p95', label: 'P95', align: 'right', sort: 'num' },
        { key: 'p99', label: 'P99', align: 'right', sort: 'num' },
        { key: 'max', label: '최대', align: 'right', sort: 'num' },
      ],
      rows,
      defaultSort: { key: 'p95', dir: 'desc' },
    });
  }).filter(Boolean).join('');

  if (!blocks) return '';
  return `<section><h2>Breakdown</h2>${blocks}
    <div class="note">P95가 가장 큰 항목이 곧 최적화 1순위 후보다. 요청 수가 적은데 P95가 크면
    "느리지만 드문" 경로이므로 사용자 체감 영향은 작을 수 있다 — 요청 수와 같이 본다.</div></section>`;
}

/**
 * ④-b 왜 느린가 — **일을 너무 많이 하는가.**
 *
 * 병목의 원인은 두 종류뿐이다. *자원이 부족한가* 와 *일이 많은가*. 앞은 인프라 표가
 * 답하지만, **자원이 남는데도 느린 경우**는 그 표로 답할 수 없다. 그때 유일한 답이
 * 요청당 비용이다.
 *
 * 실측이 그 사례였다 — CPU 50%, Hikari 30%, Heap 71% 로 자원은 전부 여유였는데 요청당
 * 쿼리가 **275개**였다. 인프라 표만 보면 "이상 없음"으로 끝난다.
 *
 * 그런데 이 그룹이 인프라 12개 섹션 사이 문서 70% 위치에 묻혀 있었다. 접기를 도입하면
 * 아예 안 보이게 되므로 **밖으로 꺼내 항상 표시한다.**
 *
 * 판정을 함께 붙인다. `queriesPerReq` 275 는 목록 조회 하나가 보통 한 자릿수 쿼리로
 * 끝난다는 점을 모르면 많은 값인지 알 수 없다 — **판정 없는 숫자는 읽히지 않는다.**
 */
const EFFICIENCY_THRESHOLDS = {
  // ⚠ 이 값은 **서버 전역 평균**이다. 분자가 mysql_global_status_queries(모든 엔드포인트 +
  // COMMIT·SET·커넥션 검증·스케줄러·exporter)이고 분모가 전체 요청 수라, 특정 경로의 비용을
  // 말해 주지 않는다. 그런데 실제 조사에서 이 숫자가 가장 느린 엔드포인트의 값으로 읽혔다.
  // 그래서 이름과 설명에 전역임을 박아 두고, 경로별 값은 아래 '엔드포인트별' 표가 답한다.
  'efficiency.queriesPerReq': { warn: 10, fail: 50, hint: '서버 전역 평균이다 — 경로별 값은 아래 엔드포인트 표를 볼 것' },
  'efficiency.stackCpuMsPerReq': { warn: 50, fail: 200, hint: '요청 1건에 스택 전체가 태운 CPU' },
  'efficiency.dbCpuUsPerQuery': { warn: 500, fail: 2000, hint: '쿼리 하나가 비싸면 인덱스·쿼리 계획 문제' },
};

function sectionEfficiency(record) {
  const infra = record.infra || {};
  const g = (infra.groups || []).find((x) => x.id === 'efficiency');
  if (!g) return '';
  const metrics = (g.metrics || []).filter((m) => m.value != null);
  if (!metrics.length) return '';

  const rows = metrics.map((m) => {
    const t = EFFICIENCY_THRESHOLDS[m.key];
    let badge = '';
    let cls = '';
    if (t) {
      if (m.value > t.fail) { badge = `<span class="badge b-FAIL">임계 초과</span>`; cls = 'style="color:var(--critical);font-weight:650"'; }
      else if (m.value > t.warn) { badge = `<span class="badge b-WARN">주의</span>`; }
      else { badge = `<span class="badge b-PASS">정상</span>`; }
    }
    const scale = t ? `warn ${t.warn} / fail ${t.fail}` : '';
    return `<tr>
      <td title="${esc(m.desc || '')}">${esc(m.label)}</td>
      <td class="num" ${cls}>${fmt.byUnit(m.value, m.unit)}</td>
      <td>${badge}</td>
      <td style="color:var(--ink-muted);font-size:12px">${esc(t ? `${scale} · ${t.hint}` : (m.desc || ''))}</td>
    </tr>`;
  }).join('');

  return `<section><h2>작업량 — 요청 1건이 얼마나 일하는가</h2>
    <div class="card scroll"><table>
      <thead><tr><th>지표</th><th class="num" style="width:110px">값</th>
        <th style="width:90px">판정</th><th>기준 · 읽는 법</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="note">자원이 남는데도 느리면 여기를 본다. 자원 부족은 위 '자원' 섹션이 답한다.
    쿼리 <b>개수</b>가 많은 것(N+1)과 쿼리 <b>하나</b>가 비싼 것(인덱스)은 처방이 다르므로
    <code>queriesPerReq</code>와 <code>dbCpuUsPerQuery</code>를 같이 읽는다.
    <b>이 표의 값은 전부 서버 전역 평균이다</b> — 어느 경로가 비싼지는 바로 아래 표가 답한다.</div>
  </section>`;
}

/**
 * ④-c 어느 경로가 비싼가 — **요청당 비용을 엔드포인트에 귀속시킨다.**
 *
 * 왜 이 표가 필요한가. 위 '작업량' 표의 `queriesPerReq` 는 서버 전역 합계를 전체 요청
 * 수로 나눈 값 하나뿐이다. 그건 워크로드 전체의 평균이라 **어느 API 가 쿼리를 많이 쓰는지
 * 에 대해 아무것도 말하지 않는다.** 그럼에도 그 숫자가 병목 가설 1순위로 올라가면
 * ("요청 1건당 평균 205.6개 쿼리 — N+1 가능성이 높다") 사람은 그것을 가장 느린
 * 엔드포인트의 값으로 읽는다. 실제 조사가 그렇게 어긋났다.
 *
 * 여기 실리는 값은 앱이 요청 경계에서 직접 센 것이다(`QueryCountFilter`). 인증 필터의
 * 토큰 조회와, open-in-view 로 응답 직렬화 중에 풀리는 지연 로딩까지 포함한다.
 *
 * **평균과 함께 꼬리를 낸다.** 댓글이 수천 개인 게시물처럼 파라미터에 따라 비용이 극단적
 * 으로 갈리는 경로는 평균이 꼬리를 완전히 가린다. 다만 분위수는 SLO 버킷 경계로만 나오므로
 * "200~500" 처럼 구간으로 적는다 — 보간해서 337 같은, 관측될 수 없는 값을 쓰지 않는다.
 *
 * 정렬은 요청 수 상위다. 비용 순위가 아닌 이유는, 1건짜리 경로의 극단값이 맨 위에 오면
 * 사람이 그것을 병목으로 읽기 때문이다. 비용 순위는 'DB 시간 합' 열로 직접 읽는다.
 */
/**
 * DB 몫 칸. **판정 없는 숫자는 읽히지 않는다** — 30% 가 큰 값인지 작은 값인지는
 * 이 표를 처음 보는 사람이 알 수 없다.
 *
 * 기준을 이렇게 나눈다.
 *   50% 이상 — 응답 시간의 절반 이상이 SQL 실행이다. 쿼리를 고치면 실제로 빨라진다.
 *   20~50%  — 섞여 있다. 쿼리를 고쳐도 나머지가 남는다.
 *   20% 미만 — 원인이 DB 바깥이다. 쿼리 최적화는 헛수고에 가깝다.
 */
function shareCell(pct) {
  if (pct == null) return '—';
  const label = `${fmt.num(pct, 0)}%`;
  if (pct >= 50) return `<b style="color:var(--critical)">${label}</b>`;
  if (pct >= 20) return `<b style="color:var(--warn)">${label}</b>`;
  return `<span style="color:var(--ink-muted)">${label}</span>`;
}

function bucketRange(q) {
  if (!q) return '—';
  if (q.atMost == null) return `${fmt.num(q.moreThan, 0)} 초과`;
  if (q.moreThan == null) return `${fmt.num(q.atMost, 0)} 이하`;
  return `${fmt.num(q.moreThan, 0)}~${fmt.num(q.atMost, 0)}`;
}

function sectionQueryCost(record) {
  const eq = (record.infra || {}).endpointQueries;
  // 섹션 자체를 숨기지 않는다. 값이 없으면 **없다는 사실과 그 이유**를 표시한다 —
  // 빈 자리를 "문제 없음"으로 읽히게 두는 것이 이 리포트에서 가장 위험한 실패다.
  if (!eq || !eq.available) {
    const reason = eq && eq.reason ? eq.reason : '수집되지 않음';
    return `<section><h2>엔드포인트별 요청 비용 — 어느 경로가 쿼리를 많이 쓰는가</h2>
      <div class="card"><p class="empty">재지 못했습니다.</p>
      <div class="note">${esc(reason)}<br>
      이 값이 없으면 위 '작업량'의 요청당 쿼리 수는 <b>서버 전역 평균</b>일 뿐이라
      어느 API 가 원인인지 알 수 없습니다. 앱 이미지를 다시 만들어야 합니다:
      <code>docker compose -f environment/docker-compose.perf.yml --env-file environment/.env.perf up -d --build app</code></div>
      </div></section>`;
  }

  const th = eq.threshold || { warn: 10, fail: 50 };
  const rows = eq.endpoints.map((e) => {
    const qpr = e.queriesPerRequest;
    let cls = '';
    let badge = '';
    if (qpr != null) {
      if (qpr > th.fail) { cls = 'style="color:var(--critical);font-weight:650"'; badge = '<span class="badge b-FAIL">과다</span>'; }
      else if (qpr > th.warn) { badge = '<span class="badge b-WARN">주의</span>'; }
      else { badge = '<span class="badge b-PASS">정상</span>'; }
    }
    return {
      cells: {
        endpoint: `<code>${esc(e.endpoint)}</code>`,
        requests: fmt.num(e.requests, 0),
        qpr: `<span ${cls}>${qpr == null ? '—' : fmt.num(qpr, 1)}</span>`,
        p95: esc(bucketRange(e.queriesP95)),
        p99: esc(bucketRange(e.queriesP99)),
        respMs: e.responseMsPerRequest == null ? '—' : fmt.num(e.responseMsPerRequest, 1),
        dbMs: e.dbMsPerRequest == null ? '—' : fmt.num(e.dbMsPerRequest, 1),
        dbShare: shareCell(e.dbSharePct),
        dbTotal: e.dbMsTotal == null ? '—' : fmt.num(e.dbMsTotal, 0),
        verdict: badge,
      },
      // 분위수는 버킷 경계라 표시가 `20~50` 같은 구간 문자열이다. 정렬은 구간의 하한으로
      // 한다 — 상한은 `null`(초과)일 수 있어 비교 기준이 못 된다.
      sort: {
        endpoint: e.endpoint,
        requests: e.requests,
        qpr,
        p95: e.queriesP95 ? e.queriesP95.moreThan : null,
        p99: e.queriesP99 ? e.queriesP99.moreThan : null,
        respMs: e.responseMsPerRequest,
        dbMs: e.dbMsPerRequest,
        dbShare: e.dbSharePct,
        dbTotal: e.dbMsTotal,
        verdict: qpr,
      },
      // 임계를 넘은 경로는 접어도 숨지 않는다. 이 표를 여는 이유가 그 행이다.
      keep: qpr != null && qpr > th.warn,
    };
  });

  // 검산 — 엔드포인트 합계 + 요청 밖 문장 ≈ MySQL 전역 문장 수여야 계측을 신뢰할 수 있다.
  const f = (record.infra || {}).flat || {};
  const globalStatements = f['mysql.qps'] != null && (record.infra.window || {}).durationSec
    ? f['mysql.qps'] * record.infra.window.durationSec
    : null;
  const accounted = eq.attributedStatements + (eq.outsideRequestStatements || 0);
  const checkLine = globalStatements
    ? `엔드포인트 합계 ${fmt.num(eq.attributedStatements, 0)}건 + 요청 밖 `
      + `${eq.outsideRequestStatements == null ? '미측정' : `${fmt.num(eq.outsideRequestStatements, 0)}건`}`
      + ` = ${fmt.num(accounted, 0)}건 · MySQL 전역 ${fmt.num(globalStatements, 0)}건`
      + ` (설명된 비율 ${fmt.num((100 * accounted) / globalStatements, 0)}%)`
    : '전역 문장 수를 못 읽어 검산을 건너뜀';

  return `<section><h2>엔드포인트별 요청 비용 — 어느 경로가 쿼리를 많이 쓰는가</h2>
    ${dataTable({
    columns: [
      { key: 'endpoint', label: '엔드포인트', sort: 'text' },
      { key: 'requests', label: '요청 수', align: 'right', width: '80px', sort: 'num' },
      { key: 'qpr', label: '요청당 쿼리', align: 'right', width: '100px', sort: 'num' },
      { key: 'p95', label: '쿼리 p95', align: 'right', width: '100px', sort: 'num' },
      { key: 'p99', label: '쿼리 p99', align: 'right', width: '100px', sort: 'num' },
      { key: 'respMs', label: '응답(ms)', align: 'right', width: '100px', sort: 'num' },
      { key: 'dbMs', label: '그중 DB(ms)', align: 'right', width: '100px', sort: 'num' },
      { key: 'dbShare', label: 'DB 몫', align: 'right', width: '80px', sort: 'num' },
      { key: 'dbTotal', label: 'DB 시간 합(ms)', align: 'right', width: '110px', sort: 'num' },
      { key: 'verdict', label: '판정', width: '70px', sort: 'num' },
    ],
    rows,
    defaultSort: { key: 'requests', dir: 'desc' },
  })}
    ${eq.truncated ? `<div class="note">요청 수 하위 ${eq.truncated}개 경로는 생략했다.</div>` : ''}
    <div class="note">
      <b>읽는 법.</b> '요청당 쿼리'가 크면 그 경로에 N+1 이 있다(임계 warn ${th.warn} / fail ${th.fail}).
      평균이 작아도 <b>p95·p99 가 크면 파라미터에 따라 비용이 갈리는 것</b>이므로 꼬리를 같이 본다 —
      같은 경로라도 요청 인자에 따라 다루는 행 수가 수십 배 차이 나는 경우가 그렇다.
      분위수는 히스토그램 버킷 경계로만 나오므로 구간으로 표시한다.<br>
      <b>어디를 고칠지</b>는 '요청당 DB(ms)'가 아니라 <b>'DB 시간 합'</b>으로 고른다 — 평균이 커도
      호출이 드물면 전체에 미치는 영향은 작다.<br>
      <b>'DB 몫'이 이 표에서 가장 중요한 칸이다.</b> 응답 시간 중 SQL 실행이 차지하는 비율이고,
      <b>원인이 DB 안에 있는지 밖에 있는지</b>를 이 한 값이 가른다. 50% 이상이면 쿼리를 고치면
      실제로 빨라진다. 20% 미만이면 남은 시간은 네트워크 왕복·결과 매핑·직렬화·CPU 대기에
      있으므로 <b>쿼리를 아무리 줄여도 응답 시간은 거의 안 변한다</b> — 그때는 위 '자원' 섹션의
      CPU throttling 과 요청당 앱 CPU 를 본다.<br>
      응답 시간은 서버 안에서 잰 값이라 k6 쪽 수치보다 작다(부하 발생기~서버 왕복이 빠져 있다).
      두 표의 이름이 다른 것도 그래서다 — 여기는 URI 템플릿, Breakdown 은 시나리오 이름이다.<br>
      <b>검산:</b> ${esc(checkLine)}
    </div>
  </section>`;
}

/**
 * ④-d 어느 SQL 인가 — **문장 단위 명세.**
 *
 * 위 표가 "어느 경로가 비싼가"까지 좁히면, 이 표가 "그 경로가 어떤 SQL 을 쓰는가"를 답한다.
 * 자료는 MySQL 의 `events_statements_summary_by_digest` 를 measure 창 양 끝에서 찍은
 * 차이다(`tools/lib/querystats.js`).
 *
 * **세 축으로 정렬해 싣는 이유.** 원래는 읽은 행 수 하나로만 정렬했다. 그 목록은 "행을
 * 많이 훑은 쿼리"는 잘 보여주지만 행을 거의 안 읽으면서 수없이 불리는 쿼리는 절대 보여주지
 * 않는다 — 그런데 N+1 이 정확히 그 모양이다. 실측에서 앱 문장 60,763회 중 5,520회만
 * 목록에 들어왔고, 시간의 86% 가 목록 밖에 있었다. N+1 을 찾으려는 도구가 N+1 의 흔적을
 * 구조적으로 가리고 있었다.
 *
 * `coverage` 를 함께 표시한다. 목록이 전체의 몇 %를 설명하는지 적지 않으면 사람은 목록에
 * 없는 것을 없는 것으로 읽는다.
 */
const QS_AXIS_NOTE = {
  byRows: '행을 많이 훑은 쿼리 — 인덱스·쿼리 계획을 의심한다',
  byCalls: '많이 불린 쿼리 — N+1·루프 안 조회를 의심한다',
  byTime: '서버 시간을 많이 쓴 쿼리 — 실제 비용의 소재',
};

function sectionQueryStats(record) {
  const qs = (record.run || {}).queryStats;
  if (!qs || !qs.enabled) {
    return `<section><div class="card">
      <p class="empty">재지 못했습니다.</p>
      <div class="note">${esc(qs && qs.reason ? qs.reason : '수집되지 않음')}</div>
    </div></section>`;
  }

  const t = qs.totals || {};
  const app = t.app || {};
  const exporter = t.exporter || {};

  const table = (axisId, label) => {
    const list = (qs.top || {})[axisId] || [];
    if (!list.length) return '';
    const cov = (qs.coverage || {})[axisId];
    // 축마다 이미 그 축으로 정렬돼 넘어온다(querystats.js 의 top). 기본 정렬 표시는 그것을
    // 그대로 반영한다 — 화면과 헤더 표시가 어긋나면 사용자가 정렬을 못 믿는다.
    const axisKey = { byCalls: 'calls', byTime: 'totalMs', byRows: 'rowsExamined' }[axisId];
    const rows = list.map((s) => ({
      cells: {
        calls: fmt.num(s.calls, 0),
        rowsExamined: fmt.num(s.rowsExamined, 0),
        rowsPerCall: fmt.num(s.rowsPerCall, 1),
        totalMs: fmt.num(s.totalMs, 0),
        msPerCall: fmt.num(s.msPerCall, 2),
        kind: s.kind === 'app' ? '' : `<span class="badge b-SKIP">${esc(s.kind)}</span>`,
        stmt: `<span style="font-size:11px;font-family:ui-monospace,monospace">${esc(s.stmt)}</span>`,
      },
      sort: {
        calls: s.calls,
        rowsExamined: s.rowsExamined,
        rowsPerCall: s.rowsPerCall,
        totalMs: s.totalMs,
        msPerCall: s.msPerCall,
        kind: s.kind,
        stmt: s.stmt,
      },
    }));
    return `<h3>${esc(label)}</h3>
      <div class="note" style="margin-bottom:6px">${esc(QS_AXIS_NOTE[axisId] || '')}${
  cov && cov.pct != null ? ` · 이 목록이 전체의 <b>${fmt.num(cov.pct, 1)}%</b>를 설명한다` : ''}</div>
      ${dataTable({
    columns: [
      { key: 'calls', label: '호출', align: 'right', width: '70px', sort: 'num' },
      { key: 'rowsExamined', label: '읽은 행', align: 'right', width: '80px', sort: 'num' },
      { key: 'rowsPerCall', label: '행/호출', align: 'right', width: '80px', sort: 'num' },
      { key: 'totalMs', label: '시간(ms)', align: 'right', width: '70px', sort: 'num' },
      { key: 'msPerCall', label: 'ms/호출', align: 'right', width: '80px', sort: 'num' },
      { key: 'kind', label: '출처', width: '70px', sort: 'text' },
      { key: 'stmt', label: 'SQL', sort: 'text' },
    ],
    rows,
    defaultSort: { key: axisKey, dir: 'desc' },
  })}`;
  };

  const h = qs.hidden || {};
  const hiddenWarn = h.calls > 0
    ? `<div class="hint"><div class="n">!</div><div>
        <div class="t">세 목록 어디에도 안 나온 문장이 ${fmt.num(h.statements, 0)}종 있다</div>
        <div class="d">호출 ${fmt.num(h.calls, 0)}회 · 읽은 행 ${fmt.num(h.rowsExamined, 0)}행 ·
        시간 ${fmt.num(h.totalMs, 0)}ms. 행을 거의 안 읽으면서 시간을 쓰는 문장(COMMIT 등)이 여기 모인다.
        이 몫이 크면 비용이 SQL 실행이 아니라 <b>트랜잭션 확정과 왕복</b>에 있다는 뜻이므로,
        JOIN FETCH 같은 쿼리 최적화로는 줄지 않는다.</div>
      </div></div>`
    : '';

  return `<section>
    <div class="kpis">
      ${kpi('앱 문장 수', fmt.num(app.calls, 0), `읽은 행 ${fmt.num(app.rowsExamined, 0)}`)}
      ${kpi('앱 DB 시간', `${fmt.num(app.totalMs, 0)} ms`, `문장당 ${app.calls ? fmt.num(app.totalMs / app.calls, 3) : '—'} ms`)}
      ${kpi('행/문장', app.calls ? fmt.num(app.rowsExamined / app.calls, 1) : '—', '1 근처면 단건 조회 반복')}
      ${kpi('풀스캔(앱)', fmt.num(app.selectScan, 0), `수집기 몫 ${fmt.num(exporter.selectScan, 0)} 제외`)}
      ${kpi('문장 종류', fmt.num(qs.distinctStatements, 0), `상위 ${qs.topN || 25}개씩 표시`)}
    </div>
    ${hiddenWarn}
    ${qs.rewound ? `<div class="hint"><div class="n">!</div><div><div class="t">측정 중 MySQL 카운터가 되감겼다</div>
      <div class="d">구간 중 MySQL 이 재시작한 것이다. 이 표의 수치는 신뢰할 수 없다.</div></div></div>` : ''}
    ${table('byCalls', '호출 수 상위')}
    ${table('byTime', '소요 시간 상위')}
    ${table('byRows', '읽은 행 상위')}
    <div class="note">
      측정 구간 ${fmt.localTime(qs.window && qs.window.startedAt)} ~ ${fmt.localTime(qs.window && qs.window.endedAt)}
      (${fmt.num(qs.window && qs.window.actualSec, 0)}초).
      '출처' 가 비어 있으면 앱이 낸 문장이고, 배지가 붙은 것은 지표 수집기 등 다른 클라이언트다 —
      섞어 세면 수집기의 <code>SHOW GLOBAL STATUS</code> 를 앱의 풀스캔으로 오독한다.<br>
      <b>시간 열의 의미.</b> MySQL 서버가 그 문장을 파싱·실행하고 결과를 넘길 때까지 서버 <b>안에서</b>
      흐른 시간이다. 네트워크 왕복, 커넥션 획득 대기, 결과 매핑, 직렬화는 <b>포함되지 않는다</b>.
      그래서 이 합계가 응답 시간보다 훨씬 작으면 원인은 DB 바깥에 있다.
    </div>
  </section>`;
}

function sectionInfra(record) {
  const infra = record.infra || {};
  if (!infra.available) {
    return `<section><h2>Infrastructure Summary</h2><div class="card">
      <p class="empty">운영 지표를 가져오지 못했습니다.</p>
      <div class="note">Prometheus(${esc(infra.prometheusUrl || 'http://localhost:9090')})가 기동 중인지 확인하세요.
      <code>docker compose -f environment/docker-compose.perf.yml up -d prometheus</code> 후
      <code>node tools/collect.js ${esc(record.run.id)} --force --no-wait</code>로 재수집할 수 있습니다.</div>
    </div></section>`;
  }

  const f = infra.flat;
  // 포화도 요약 — 리소스별 "한계 대비 얼마나 썼는가". 병목 후보를 한 화면에 모은다.
  const sat = [
    ['CPU', 'saturation.cpuPct', `${fmt.num(f['cpu.cores.max'], 2)} / ${fmt.num(f['cpu.limitCores'], 1)} core`],
    ['메모리', 'saturation.memoryPct', `${fmt.bytes(f['memory.workingSet.max'])} / ${fmt.bytes(f['memory.limitBytes'])}`],
    ['JVM Heap', 'saturation.heapPct', `${fmt.bytes(f['heap.used.max'])} / ${fmt.bytes(f['heap.maxBytes'])}`],
    ['HikariCP', 'saturation.hikariPct', `${fmt.num(f['pool.hikariActive.max'], 0)} / ${fmt.num(f['pool.hikariMax'], 0)}`],
    ['Tomcat 스레드', 'saturation.tomcatPct', `${fmt.num(f['pool.tomcatBusy.max'], 0)} / ${fmt.num(f['pool.tomcatMax'], 0)}`],
    ['MySQL 커넥션', 'saturation.mysqlConnPct', `${fmt.num(f['mysql.threadsConnected.max'], 0)} / ${fmt.num(f['mysql.maxConnections'], 0)}`],
  ].map(([label, key, detail]) => `<tr>
      <td>${esc(label)}</td>
      <td style="width:210px">${meter(f[key])}</td>
      <td class="num" style="color:var(--ink-2)">${esc(detail)}</td>
    </tr>`).join('');

  // `efficiency` 는 여기서 뺀다 — sectionEfficiency 가 접히지 않는 자리에서 따로 그린다.
  // 자원이 남아도 느린 경우(요청당 일을 너무 많이 하는 경우)를 답하는 유일한 그룹이라
  // 인프라 접기 안에 들어가면 정작 필요할 때 보이지 않는다.
  const groups = (infra.groups || []).filter((g) => g.id !== 'efficiency').map((g) => {
    const metrics = g.metrics.filter((m) => m.value != null);
    if (!metrics.length) return '';
    const rows = metrics.map((m) => ({
      cells: {
        label: `<span title="${esc(m.desc || '')}">${esc(m.label)}</span>`,
        value: fmt.byUnit(m.value, m.unit),
        desc: `<span style="color:var(--ink-muted);font-size:12px">${esc(m.desc || '')}</span>`,
      },
      // 단위가 그룹 안에서 섞인다(bytes·percent·per_sec). 표시값으로는 비교가 성립하지
      // 않으므로 원시값으로 정렬한다 — 같은 단위끼리 볼 때만 의미가 있다는 한계는 남는다.
      sort: { label: m.label, value: m.value, desc: m.desc || '' },
    }));
    return `<h3>${esc(g.label)}</h3>${dataTable({
      columns: [
        { key: 'label', label: '지표', sort: 'text' },
        { key: 'value', label: '값', align: 'right', width: '120px', sort: 'num' },
        { key: 'desc', label: '설명', sort: false },
      ],
      rows,
      defaultSort: null,
    })}`;
  }).join('');

  // 수집/검증에서 버려진 지표는 사유까지 보여준다. 개수만 적어 두면 표의 "—"가
  // "측정 안 함"인지 "믿을 수 없어 버림"인지 구분되지 않아, 결국 아무도 확인하지 않는다.
  const errs = infra.errors || [];
  const errBlock = errs.length
    ? `<h3>수집되지 않은 지표 (${errs.length}건)</h3><div class="card">
        ${errs.slice(0, 12).map((e) => `<div class="hint">
          <div class="n">!</div>
          <div><div class="t">${esc(e.key)}</div><div class="d">${esc(e.error)}</div></div>
        </div>`).join('')}
        ${errs.length > 12 ? `<div class="note">외 ${errs.length - 12}건은 <code>run.json</code>의 <code>infra.errors</code>에 있다.</div>` : ''}
        <div class="note">여기 나온 항목은 위 표에서 <b>—</b>로 비어 있다. 값이 없는 것과
        <b>값을 믿을 수 없어 버린 것</b>은 다르므로, 후자는 원인을 확인한 뒤 재수집해야 한다.</div>
      </div>`
    : '';

  const w = infra.window || {};
  const windowModeLabel = { measure: 'measure 구간', 'diagnostic-full-run': '전체 구간(진단 시나리오)', 'legacy-no-phase-plan': '전체 구간(phasePlan 없음 — 과거 실행)' }[w.mode] || w.mode || '?';
  const incompleteWarn = w.incomplete
    ? `<div class="hint"><div class="n">!</div><div>
        <div class="t">measure 구간을 다 채우지 못했다 (조기 종료)</div>
        <div class="d">계획된 measure 구간이 끝나기 전에 실행이 종료됐다 — 실제로 수집 가능했던 구간만으로
        잘라 집계했다. 이 실행을 정상 완료된 실행과 비교하면 안 된다.</div>
      </div></div>`
    : '';
  return `<section><h2>Infrastructure Summary</h2>
    <h3>자원 포화도 (${esc(windowModeLabel)} 최대)</h3>
    ${incompleteWarn}
    <div class="card scroll"><table><tbody>${sat}</tbody></table>
      <div class="note">포화도는 한계 대비 사용량이다. 70% 넘으면 주황, 85% 넘으면 진주황, 95% 넘으면 빨강으로 표시된다.
      절대값과 달리 환경이 바뀌어도 그대로 비교되므로 병목 판단의 1차 기준으로 쓴다.</div>
    </div>
    ${errBlock}
    ${groups}
    <div class="note">집계 구간 ${fmt.localTime(w.from)} ~ ${fmt.localTime(w.to)}
      (${fmt.duration(w.durationSec)}, ${esc(windowModeLabel)}${w.incomplete ? ' · 불완전' : ''})
      · 이 구간은 k6.phases.measure와 같은 시간대다(T-03/S-08) — 더 이상 별도 계산이 아니다.
      · 쿼리 ${infra.queryStats ? infra.queryStats.queries : '?'}건${errs.length ? ` · 실패 ${errs.length}건` : ''}</div>
  </section>`;
}

/**
 * loadProfile과 measurementProfile 불일치가 동시에 뜨면 원래 두 줄로 따로 표시된다.
 * stagesFor()가 phase-plan 초 수로 stages를 생성하므로 이 둘은 실제로 자주 같이
 * 바뀐다(하나의 시나리오 변경이 두 조건 모두에 반영됨) — 그때는 중복처럼 보이지 않게
 * 한 줄로 합쳐 보여준다("부하 프로파일 + 측정 구간 변경").
 */
function combineMismatchDescs(mismatches) {
  const byKey = new Map(mismatches.map((m) => [m.key, m]));
  const load = byKey.get('loadProfile');
  const measure = byKey.get('measurementProfile');
  const out = [];
  for (const m of mismatches) {
    if (m.key === 'loadProfile' && measure) out.push(`${m.desc} · ${measure.desc}`);
    else if (m.key === 'measurementProfile' && load) continue; // 위에서 이미 합쳤다
    else out.push(m.desc);
  }
  return out;
}

/**
 * 탈락 사유 칸. 조건 불일치는 무엇이 달랐는지를 줄별로 펼치고(그래야 사람이 조치할 수 있다),
 * 측정 자격 탈락은 mismatch 가 없으므로 reasonCode 문장을 쓴다 — 어느 쪽이든 빈 칸이 되면
 * "이유를 못 대는 침묵"이 되어 조용한 통과와 구분되지 않는다(S-10).
 */
function rejectionCell(rej) {
  const blocking = (rej.mismatches || []).filter((m) => m.materiality === 'blocking');
  if (blocking.length) return combineMismatchDescs(blocking).map(esc).join('<br>');
  return esc(repo.describeRejection(rej));
}

function sectionRegression(record) {
  const reg = record.regression;
  if (!reg.hasBaseline) {
    // "비교 안 함"이 "비교했는데 문제 없음"처럼 보이면 이 도구는 조용히 거짓말을 한다.
    // 기준선이 없었다는 사실, 그리고 왜 없었는지를 판정과 같은 무게로 보여준다.
    const rejected = reg.rejectedBaselines || [];
    if (reg.baselineStatus === 'incomparable') {
      const rows = rejected.map((rej) => `<tr>
        <td><code>${esc(rej.id)}</code></td>
        <td>${rejectionCell(rej)}</td>
      </tr>`).join('');
      return `<section><h2>Regression</h2><div class="card scroll">
        <div class="hint">
          <div class="n">!</div>
          <div>
            <div class="t">기준선으로 쓸 수 있는 과거 실행이 없어 상대 비교를 생략했다</div>
            <div class="d">과거 실행은 있지만 <b>대조군으로 쓸 수 없었다</b> — 실행 조건이
              달랐거나(데이터셋·부하·측정 구간), 그 실행 자체가 제대로 측정되지 않았다.
              조건이 다른 두 실행의 P95를 나란히 놓으면 그건 성능 변화가 아니라 다른 실험의
              수치다. 이 실행에는 <b>절대 게이트(SLO)만</b> 적용됐다.
              <b>당시 성능이 나빴다는 이유로 탈락하지는 않는다</b> — threshold 실패는 기준선
              자격 조건이 아니다.</div>
          </div>
        </div>
        <table>
          <thead><tr><th>탈락한 후보</th><th>사유</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2" class="empty">—</td></tr>'}</tbody>
        </table>
        <div class="note">같은 조건으로 정상 측정된 실행을 한 번 더 만들면 그때부터 비교가 시작됩니다.
          조건 정의는 <code>tools/lib/comparability.js</code>, 기준선 자격 판정은
          <code>tools/lib/repository.js</code>의 <code>eligibilityOf()</code>에 있습니다.</div>
      </div></section>`;
    }
    return `<section><h2>Regression</h2><div class="card">
      <p class="empty">비교 기준이 없습니다 — 이 시나리오의 과거 실행이 하나도 없습니다.</p>
      <div class="note">다음 실행부터 이 결과가 기준선이 되어 자동으로 비교됩니다.
      기준은 <b>같은 실행 조건</b>(시나리오·환경·데이터셋·부하 프로파일·측정 구간)으로
      <b>정상 측정된</b> 직전 실행을 씁니다 — 그 실행이 SLO를 넘겼는지는 따지지 않습니다.
      이 실행에는 절대 게이트(SLO)만 적용됐습니다.</div>
    </div></section>`;
  }

  const rows = reg.comparisons
    .filter((c) => c.verdict !== 'SKIP')
    .sort((a, b) => {
      const rank = { FAIL: 0, WARN: 1, PASS: 2 };
      if (rank[a.verdict] !== rank[b.verdict]) return rank[a.verdict] - rank[b.verdict];
      return Math.abs(b.badChangePct || 0) - Math.abs(a.badChangePct || 0);
    })
    .map((c) => ({
      cells: {
        label: esc(c.label),
        baseline: fmt.byUnit(c.baseline, c.unit),
        current: fmt.byUnit(c.current, c.unit),
        delta: deltaCell(c),
        verdict: `<span class="badge b-${c.verdict}">${ICON[c.verdict]} ${c.verdict}</span>${c.gate && c.verdict === 'FAIL' ? ' <span class="badge b-FAIL">GATE</span>' : ''}`,
        reason: `<span style="color:var(--ink-2);font-size:12px">${c.reasons.map((r) => esc(r.desc)).join('<br>') || (c.skipped ? esc(c.skipped) : '')}</span>`,
      },
      sort: {
        label: c.label,
        baseline: c.baseline,
        current: c.current,
        // 증감은 표시가 `▲ +23.4%` 라 문자열 정렬이 무의미하다. 부호를 살린 원시값으로 한다 —
        // "가장 나빠진 것"과 "가장 좋아진 것"을 양 끝에서 찾을 수 있어야 한다.
        delta: c.deltaPct,
        verdict: { FAIL: 0, WARN: 1, PASS: 2 }[c.verdict],
        reason: c.reasons.map((r) => r.desc).join(' '),
      },
      // 실패·경고 행은 접어도 숨지 않는다. 34행짜리 표에서 FAIL 이 6번째에 있으면
      // 기본 화면이 "문제 없음"으로 보인다 — 이 표에서 가장 위험한 실패다.
      keep: c.verdict === 'FAIL' || c.verdict === 'WARN',
    }));

  const unmeasured = reg.counts.skipped || 0;
  // 평가 불가를 세 갈래로 쪼개 보여준다(T-08) — 필수 결측은 판정 자체를 무효로 만들고,
  // 참고 결측은 그렇지 않으며, 해당 없음은 애초에 이 실행에 없는 지표다(진단 시나리오의
  // measure 규칙 등). 셋을 한 숫자로 합치면 어느 쪽인지 알 수 없다.
  const missingRequired = (reg.missingRequired || []).length;
  const unmeasuredBreakdown = reg.measurementStatus
    ? ` (필수 ${missingRequired}건 / 참고 ${(reg.missingOptional || []).length}건 / 해당 없음 ${(reg.notApplicable || []).length}건)`
    : '';
  const suppressed = reg.counts.suppressed != null
    ? reg.counts.suppressed
    : reg.comparisons.filter((c) => c.verdict !== 'SKIP' && c.skipped).length;

  // 조건이 다르면 수치 비교 자체가 성립하지 않는다. 표는 그대로 보여주되 무엇을 믿으면
  // 안 되는지 먼저 말해 준다 — 아래 증감률을 성능 변화로 읽으면 안 된다.
  const degradedList = reg.comparability && reg.comparability.level === 'degraded'
    ? reg.comparability.mismatches
    : [];
  // 강등(상대 사유만 실패)과 게이트 유지(절대 SLO 위반 있음)는 사람이 할 다음 행동이
  // 정반대다. 둘을 구분해 말하지 않으면 "조건이 다르다"가 곧 "통과"로 읽힌다(T-32).
  const hardGates = (reg.absoluteGateFailures || []);
  const degradedHeadline = reg.downgradedFrom
    ? ' — 게이트를 열었다'
    : hardGates.length ? ' — 절대 SLO 위반이 있어 게이트는 유지했다' : '';
  const degradedTail = reg.downgradedFrom
    ? ` 그래서 판정을 ${esc(reg.downgradedFrom)}에서 WARN으로 낮추고 빌드는 통과시켰다.`
    : hardGates.length
      ? ` 다만 아래 ${hardGates.length}건은 기준선을 참조하지 않는 <b>절대 상한 위반</b>이라
          조건이 달라도 판정이 유효하다 — 빌드는 멈춘다:
          ${hardGates.map((k) => `<code>${esc(k)}</code>`).join(' ')}`
      : '';
  const scriptWarn = degradedList.length
    ? `<div class="hint">
        <div class="n">!</div>
        <div>
          <div class="t">기준선과 실행 조건이 다르다${degradedHeadline}</div>
          <div class="d">
            ${degradedList.map((m) => `<div><code>${esc(m.label)}</code> ${esc(String(m.baseline))} → ${esc(String(m.current))}</div>`).join('')}
            조건이 바뀌면 요청 구성이 달라져 TPS·RPS·지연이 함께 움직인다 — 아래 증감은
            성능 변화가 아니라 <b>다른 것을 잰 결과</b>일 수 있다.${degradedTail}
            이 실행을 새 기준선으로 삼고 다음 실행부터 다시 비교하는 것이 맞다.</div>
        </div>
      </div>`
    : '';

  // 기준선의 당시 상태 — 자격이 아니라 참고 정보다(S-10). threshold 실패 실행도 정상
  // 측정됐다면 기준선이 되므로, 증감률만 보고 "좋아졌으니 통과"로 읽는 것을 막아야 한다.
  // thresholdsPassed 는 measure SLO 하나가 아니라 전체 구간·시나리오별·abort threshold 까지
  // 묶은 AND 값이라, "SLO 실패"가 아니라 "k6 threshold 미통과"라고만 쓴다.
  const badgeOf = (v) => (v == null ? '알 수 없음' : v === true ? 'PASS' : v === false ? 'FAIL' : String(v));
  const baselineStateWarn = reg.baselineThresholdsPassed === false
    ? `<div class="hint">
        <div class="n">!</div>
        <div>
          <div class="t">기준선 실행은 당시 k6 threshold를 통과하지 못했다</div>
          <div class="d">아래 증감은 <b>그 실행 대비 개선/악화 폭</b>일 뿐, 현재 실행이 SLO를
            만족한다는 뜻이 아니다. 예를 들어 3,800ms → 2,200ms 는 42% 개선이지만 절대 기준이
            500ms라면 현재 실행은 여전히 FAIL이다. SLO 충족 여부는 이 표의 <b>판정</b> 열과
            GATE 표시로만 판단해야 한다 — 절대 게이트는 기준선과 무관하게 평가된다.
            기준선 Node 판정: <b>${esc(badgeOf(reg.baselineVerdict))}</b>.</div>
        </div>
      </div>`
    : '';

  const table = rows.length
    ? dataTable({
      columns: [
        { key: 'label', label: '지표', sort: 'text' },
        { key: 'baseline', label: `직전 (${reg.baselineCommit || '—'})`, align: 'right', sort: 'num' },
        { key: 'current', label: '현재', align: 'right', sort: 'num' },
        { key: 'delta', label: '변화', align: 'right', sort: 'num' },
        { key: 'verdict', label: '판정', sort: 'num' },
        { key: 'reason', label: '사유', sort: false },
      ],
      rows,
      defaultSort: null,
    })
    : '<div class="card"><p class="empty">비교 가능한 지표가 없습니다.</p></div>';

  return `<section><h2>Regression</h2>
    ${baselineStateWarn}
    ${scriptWarn}
    ${table}
    <div class="card">
      <div class="note">
        기준 실행: <b>${esc(reg.baselineRunId)}</b> (${fmt.localTime(reg.baselineStartedAt)})
        · 당시 k6 thresholds <b>${esc(badgeOf(reg.baselineThresholdsPassed))}</b>
        · 당시 Node 판정 <b>${esc(badgeOf(reg.baselineVerdict))}</b>
        <span style="color:var(--ink-2)">— 기준선 자격은 측정 무결성과 실행 조건으로만 정해집니다.
        당시 성능이 나빴다는 사실은 기준선을 무효로 만들지 않습니다.</span><br>
        판정 ${reg.counts.fail}건 실패 / ${reg.counts.warn}건 경고 / ${unmeasured}건 평가 불가${unmeasuredBreakdown} / ${suppressed}건 판정 생략${unmeasured ? ` — <b>평가 불가는 지표가 수집되지 않아 판정할 수 없었던 규칙</b>입니다(노이즈 억제와 다릅니다).${missingRequired ? ' 그중 <b>필수</b> 지표 결측은 이 실행 전체를 측정 불가로 만듭니다.' : ' 전부 참고용 지표라 판정에는 영향이 없습니다.'} 익스포터/Prometheus 상태를 확인하세요.` : ''}${suppressed ? ` 판정 생략은 변화폭이 노이즈 하한 미만이거나 기준값이 너무 작은 경우입니다.` : ''}<br>
        <b>GATE</b> 표시가 붙은 실패만 CI를 중단시킵니다. 규칙은 <code>regression/rules.json</code>에서 조정합니다.
      </div>
    </div></section>`;
}

function sectionHints(record) {
  const hints = record.bottleneckHints || [];
  if (!hints.length) return '';
  return `<section><h2>병목 가설</h2><div class="card">
    ${hints.slice(0, 6).map((h, i) => `<div class="hint">
      <div class="n">${i + 1}</div>
      <div><div class="t">${esc(h.title)}</div><div class="d">${esc(h.detail)}</div></div>
    </div>`).join('')}
    <div class="note">자동 규칙으로 뽑은 <b>가설</b>이지 확정된 원인이 아니다.
    포화도가 높은 자원부터 나열했을 뿐이므로, 실제 원인은 Grafana에서 해당 구간을 직접 확인해 검증해야 한다.</div>
  </div></section>`;
}

function sectionTrend(record, trend, exists = repo.reportExists) {
  if (!trend || trend.length < 2) return '';
  const series = (key) => trend.map((t) => t[key]);
  const cur = trend[trend.length - 1] || {};

  const cards = [
    ['P95 응답시간', 'p95', 'ms'],
    ['평균 응답시간', 'avg', 'ms'],
    ['TPS', 'tps', 'per_sec'],
    ['오류율', 'errorRate', 'ratio'],
    ['CPU 포화도', 'cpuMaxPct', 'percent'],
    ['Heap 최대', 'heapMaxBytes', 'bytes'],
    ['GC 최대 정지', 'gcPauseMaxMs', 'ms'],
    ['Slow Query', 'mysqlSlowQueries', 'count'],
  ]
    .filter(([, key]) => series(key).some((v) => fmt.nz(v)))
    .map(([label, key, unit]) => {
      const vals = series(key);
      const val = unit === 'ratio' ? (cur[key] != null ? cur[key] * 100 : null) : cur[key];
      return sparkCard(label, unit === 'ratio' ? vals.map((v) => (v == null ? null : v * 100)) : vals,
        val, unit === 'ratio' ? 'percent' : unit, trend, exists);
    }).join('');

  if (!cards) return '';
  return `<section><h2>Trend (최근 ${trend.length}회)</h2>
    <div class="sparks">${cards}</div>
    <div class="note">같은 시나리오·같은 환경의 최근 실행만 모았다. 오른쪽 끝이 이번 실행이다.
    한 번의 변화보다 <b>추세의 방향</b>이 중요하다 — 매 실행 5%씩 나빠지면 개별 판정은 계속 통과하지만
    10회 뒤에는 1.6배가 된다.<br>
    점 위에 마우스를 올리면 그 회차의 값·포화 판정·메모가 나오고, <b>누르면 그 실행의 리포트로 이동</b>한다.
    값이 없는 회차는 자리를 비워 둔다 — 그 자리가 좁아 보이면 그때 그 지표를 안 재고 있었다는 뜻이다.</div></section>`;
}

function sectionThresholds(record) {
  const th = record.k6.thresholds || [];
  // 분해축/phase 서브메트릭 생성용 느슨한 임계값은 판정 의미가 없으므로 보고서에서 제외한다.
  // (config.js의 BREAKDOWN_THRESHOLDS·PHASE_DIAGNOSTIC_THRESHOLDS가 같은 목적으로 건 값들)
  const LOOSE = /p\(99\)<600000|^rate<=?1$|^rate>=0$|^count>=0$/;
  const real = th.filter((t) => !LOOSE.test(t.expression));
  if (!real.length) return '';
  const rows = real.map((t) => ({
    cells: {
      metric: `<code>${esc(t.metric)}</code>`,
      expression: `<code>${esc(t.expression)}</code>`,
      result: `<span class="badge b-${t.ok ? 'PASS' : 'FAIL'}">${t.ok ? '✓ 통과' : '✕ 실패'}</span>`,
    },
    sort: { metric: t.metric, expression: t.expression, result: t.ok ? 1 : 0 },
  }));
  const failed = real.filter((t) => !t.ok).length;
  // 이 표는 접지 않는다. SLO 는 **전수 확인**이 목적이라 5개만 보여주면 나머지를 안 본
  // 채로 "전 항목 충족"을 읽게 된다. 정렬만 붙인다(collapseAfter: 0).
  return `<section><h2>SLO Thresholds</h2>
    ${dataTable({
    columns: [
      { key: 'metric', label: '메트릭', sort: 'text' },
      { key: 'expression', label: '조건', sort: 'text' },
      { key: 'result', label: '결과', sort: 'num' },
    ],
    rows,
    collapseAfter: 0,
    defaultSort: null,
  })}
    <div class="card"><div class="note">${failed ? `${failed}건 미달` : '전 항목 충족'} — k6 실행 중 판정된 SLO다.
    회귀(직전 대비)와 달리 <b>절대 기준</b>이므로, 성능이 개선됐어도 SLO를 못 넘으면 실패다.</div>
  </div></section>`;
}

function sectionLinks(record) {
  const links = record.links || {};
  const full = links.full || {};
  const measured = links.measured;
  if (!full.dashboard && !(measured && measured.dashboard)) return '';

  // 전체 실행 링크와 measure 구간 링크의 의미가 섞이면 안 된다(S-08) — 별도 블록으로 나눈다.
  const block = (title, l) => !l || !l.dashboard ? '' : `
    <h3>${esc(title)}</h3>
    <div class="links">
      <a class="primary" href="${esc(l.dashboard)}" target="_blank" rel="noopener">대시보드 열기</a>
      ${l.kiosk ? `<a href="${esc(l.kiosk)}" target="_blank" rel="noopener">Kiosk 모드</a>` : ''}
      ${(l.panels || []).map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}</a>`).join('')}
    </div>`;

  return `<section><h2>Grafana</h2><div class="card">
    ${block('measure 구간 (게이트가 본 구간)', measured)}
    ${block('전체 실행 (ramp-up/rampdown 포함)', full)}
    <div class="note">링크에는 각 구간이 앞뒤 2분 여유와 함께 이미 박혀 있다.
    여유를 두는 이유는 "부하 직전 상태"와 비교해야 이번 부하로 올라간 값인지 원래 높았던 값인지 구분되기 때문이다.
    ${measured ? '두 링크는 서로 다른 시간 범위를 가리킨다 — measure 링크가 실제 판정에 쓰인 구간이다.' : '이 실행은 measure 구간이 따로 없어(진단 시나리오) 전체 실행 링크만 있다.'}</div>
  </div></section>`;
}

/* ─────────────────────────── 조립 ─────────────────────────── */

/**
 * 정상인 섹션을 접는다 — **판정으로 요약하고 접는다.**
 *
 * 왜 필요한가. 인프라 12개 섹션이 문서의 44% 를 차지하는데 대부분의 실행에서 답이
 * "이상 없음"이다. 가장 자주 아무 문제 없는 섹션이 가장 큰 자리를 차지하고, 그 사이에
 * 정작 봐야 할 Breakdown 이 79% 위치로 밀려나 있었다.
 *
 * **접는 것이 정보를 줄이는 것은 아니다.** 요약 줄이 "정상"임을 **판정으로** 말하면
 * 펼치지 않아도 결론을 얻는다 — `"인프라 (12개 섹션)"` 은 접은 것이고
 * `"자원 여유 있음 — 신호 4개 전부 임계 이하"` 는 판정한 것이다. 후자만 접을 자격이 있다.
 */
function foldable(html, { open, title, note }) {
  if (!html) return '';
  return `<details class="fold"${open ? ' open' : ''}>
    <summary>${esc(title)}${note ? ` <span class="sum-note">${esc(note)}</span>` : ''}</summary>
    ${html}
  </details>`;
}

/**
 * SQL 명세를 접었을 때의 요약 줄.
 *
 * **접는 것이 정보를 줄이는 것이면 안 된다.** 이 줄은 펼치지 않고도 두 가지를 답해야 한다.
 *   1. 문장당 읽은 행이 1 근처인가 — 그러면 단건 조회 반복(N+1 의 모양)이고,
 *      풀스캔(행을 많이 훑는 문제)이 아니다. 처방이 정반대다.
 *   2. 비용이 SQL 실행에 있는가 — 목록 밖 문장(COMMIT 등)이 시간을 대부분 쓰고 있으면
 *      쿼리 최적화로는 줄지 않는다.
 */
function queryStatsSummaryLine(record) {
  const qs = (record.run || {}).queryStats;
  if (!qs || !qs.enabled) return { open: true, note: '재지 못함 — 원인 규명의 마지막 단계가 비어 있다' };
  const app = (qs.totals || {}).app || {};
  if (!app.calls) return { open: false, note: '측정 구간에 앱 문장이 없다' };

  const rowsPer = app.rowsExamined / app.calls;
  const h = qs.hidden || {};
  const hiddenMsPct = app.totalMs ? (100 * (h.totalMs || 0)) / app.totalMs : 0;

  const bits = [`앱 ${fmt.num(app.calls, 0)}문장 · ${fmt.num(app.totalMs, 0)}ms · 행/문장 ${fmt.num(rowsPer, 1)}`];
  // 행/문장이 1 근처면 "훑는 문제"가 아니라 "횟수 문제"다. 이 구분이 처방을 가른다.
  bits.push(rowsPer < 2 ? '단건 조회 반복형' : rowsPer > 100 ? '대량 스캔형' : '혼합');
  if (hiddenMsPct > 50) bits.push(`⚠ 시간의 ${fmt.num(hiddenMsPct, 0)}%가 목록 밖 문장(트랜잭션 확정 등)`);
  return { open: hiddenMsPct > 50, note: bits.join(' · ') };
}

function infraSummaryLine(record) {
  const sat = record.saturation || {};
  const signals = sat.signals || [];
  const bad = signals.filter((s) => s.level && s.level !== 'ok');
  if (!signals.length) return { open: true, note: '포화 판정 없음 — 값을 직접 확인할 것' };
  if (!bad.length) return { open: false, note: `자원 여유 있음 — 신호 ${signals.length}개 전부 임계 이하` };
  return {
    open: true,
    note: `주의 ${bad.length}건 — ${bad.map((s) => s.label).join(' · ')}`,
  };
}

function renderReport(record, opts = {}) {
  const r = record.run;
  const infraFold = infraSummaryLine(record);
  const qsFold = queryStatsSummaryLine(record);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.scenario)} #${r.number} — Performance Report</title>
<style>${CSS}${TABLE_CSS}</style>
${TABLE_NOSCRIPT}
</head><body>
${sectionHeader(record)}
<div class="wrap">
  ${sectionTrust(record)}
  ${sectionMeasurement(record)}
  ${sectionSummary(record, opts.previous)}
  ${sectionBreakdown(record)}
  ${sectionEfficiency(record)}
  ${sectionQueryCost(record)}
  ${foldable(sectionQueryStats(record), { open: qsFold.open, title: 'SQL 명세 — 어느 문장이 돌았는가', note: qsFold.note })}
  ${foldable(sectionInfra(record), {
    open: infraFold.open, title: '자원 — 부족한 것이 있는가', note: infraFold.note,
  })}
  ${sectionRegression(record)}
  ${foldable(sectionHints(record), {
    open: false, title: '병목 가설 (도구가 계산한 후보)', note: '먼저 위에서 직접 좁혀 본 뒤 검산용으로 열 것',
  })}
  ${sectionTrend(record, opts.trend, opts.reportExists || repo.reportExists)}
  ${foldable(sectionThresholds(record), { open: false, title: 'SLO Thresholds' })}
  ${sectionLinks(record)}
  <footer>
    생성 ${fmt.localTime(record.collectedAt)} · Run ID <code>${esc(r.id)}</code> ·
    원본 <code>run.json</code> / <code>k6.json</code> 은 같은 디렉터리에 있습니다.
  </footer>
</div>
<script>${TABLE_JS}</script>
</body></html>`;
}

// sectionRegression 은 기준선 탈락 사유·기준선 상태 표시의 단위 테스트를 위해 노출한다.
module.exports = {
  renderReport, sectionRegression, sectionTrust, sectionTrend, sparkline, sparkPointsPct, meter, CSS,
};
