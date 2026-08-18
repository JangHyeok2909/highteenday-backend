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
 */
function sparkline(values, opts = {}) {
  const pts = values.filter((v) => fmt.nz(v));
  if (pts.length < 2) return '<svg viewBox="0 0 100 40" preserveAspectRatio="none"></svg>';

  const W = 100, H = 40, PAD = 3;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || Math.abs(max) || 1;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${d} L${W},${H} L0,${H} Z`;
  const color = opts.color || 'var(--series-1)';
  const lastX = x(pts.length - 1);
  const lastY = y(pts[pts.length - 1]);

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.label || '추세')}">
  <path d="${area}" fill="${color}" opacity="0.10"/>
  <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
        vector-effect="non-scaling-stroke"/>
  <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="2.6" fill="${color}"
          stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>
</svg>`;
}

function sparkCard(title, values, current, unit) {
  const vals = values.filter((v) => fmt.nz(v));
  const min = vals.length ? Math.min(...vals) : null;
  const max = vals.length ? Math.max(...vals) : null;
  return `<div class="spark">
    <div class="st">${esc(title)}</div>
    <div class="sv">${fmt.byUnit(current, unit)}</div>
    ${sparkline(values, { label: title })}
    <div class="range"><span>min ${fmt.byUnit(min, unit)}</span><span>max ${fmt.byUnit(max, unit)}</span></div>
  </div>`;
}

function kpi(label, value, foot) {
  return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
}

/* ─────────────────────────── 섹션 ─────────────────────────── */

function sectionHeader(record) {
  const r = record.run;
  const reg = record.regression;
  const v = reg.verdict;
  const verdictText = { PASS: '통과', WARN: '주의', FAIL: '실패' }[v] || v;

  const meta = [
    ['시나리오', r.scenario],
    ['환경', r.environment],
    ['브랜치', r.branch],
    ['커밋', r.commitShort],
    ['빌드', r.buildNumber],
    ['실행자', r.executor],
    ['시작', fmt.localTime(r.startedAt)],
    ['종료', fmt.localTime(r.endedAt)],
    ['수행 시간', fmt.duration(r.durationSec)],
    ['VU 최대', fmt.num(record.k6.all.vusMax, 0)],
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

function sectionSummary(record, previous) {
  // 게이트가 실제로 보는 값(k6.phases.measure)을 기본으로 보여준다(T-03/S-08) — warmup·
  // rampdown이 섞인 전체 구간이 아니다. measure 구간이 없는 실행(진단 시나리오·과거
  // run.json)만 k6.all로 폴백하고, 그 사실을 라벨로 밝힌다(조용히 같은 것처럼 안 보인다).
  const measure = record.k6.phases && record.k6.phases.measure;
  const k = measure || record.k6.all;
  const prevPhases = previous && previous.k6.phases && previous.k6.phases.measure;
  const p = previous ? (prevPhases || previous.k6.all) : null;
  const cmp = (key, dir) => {
    if (!p || !fmt.nz(p[key]) || !fmt.nz(k[key]) || p[key] === 0) return '';
    const pctChange = ((k[key] - p[key]) / Math.abs(p[key])) * 100;
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
      <tr><td>실패 요청 (전체 구간)</td><td class="num">${fmt.num(record.k6.all.failedRequests, 0)}</td>
          <td>Check 성공률</td><td class="num">${fmt.pct(k.checkRate * 100, 2)}</td></tr>
      <tr><td>서버 대기(waiting) 평균 (전체 구간)</td><td class="num">${fmt.ms(record.k6.all.waitingAvgMs)}</td>
          <td>서버 대기 P95 (전체 구간)</td><td class="num">${fmt.ms(record.k6.all.waitingP95Ms)}</td></tr>
      <tr><td>Iteration 평균 소요 (전체 구간)</td><td class="num">${fmt.ms(record.k6.all.iterationDurationAvgMs)}</td>
          <td>연결(blocked) 평균 (전체 구간)</td><td class="num">${fmt.ms(record.k6.all.blockedAvgMs)}</td></tr>
      <tr><td>수신 데이터 (전체 구간)</td><td class="num">${fmt.bytes(record.k6.all.dataReceivedBytes)}</td>
          <td>송신 데이터 (전체 구간)</td><td class="num">${fmt.bytes(record.k6.all.dataSentBytes)}</td></tr>
    </tbody>
  </table></div>
  </section>`;
}

function sectionBreakdown(record) {
  const bd = record.k6.breakdown || {};
  const axes = Object.keys(bd).filter((a) => Object.keys(bd[a] || {}).length);
  if (!axes.length) return '';

  const labels = { feature: '기능별', op: '오퍼레이션별', name: '엔드포인트별', page: '목록 페이지별' };
  const blocks = axes.map((axis) => {
    // 이 시나리오에서 호출되지 않은 기능은 서브메트릭이 0으로 생성된다 — 표에서 제외한다.
    // (모든 기능 축을 미리 선언해 두기 때문에 생기는 빈 행이다.)
    const rows = Object.entries(bd[axis])
      .filter(([, s]) => s && fmt.nz(s.p95) && s.p95 > 0)
      .sort((a, b) => (b[1].p95 || 0) - (a[1].p95 || 0))
      .map(([tag, s]) => `<tr>
        <td>${esc(tag)}</td>
        <td class="num">${fmt.num(s.count, 0)}</td>
        <td class="num">${fmt.ms(s.avg)}</td>
        <td class="num">${fmt.ms(s.p90)}</td>
        <td class="num">${fmt.ms(s.p95)}</td>
        <td class="num">${fmt.ms(s.p99)}</td>
        <td class="num">${fmt.ms(s.max)}</td>
      </tr>`).join('');
    if (!rows) return '';
    return `<h3>${esc(labels[axis] || axis)} 응답시간 (P95 내림차순)</h3>
      <div class="card scroll"><table>
        <thead><tr><th>${esc(axis)}</th><th class="num">요청 수</th><th class="num">평균</th>
          <th class="num">P90</th><th class="num">P95</th><th class="num">P99</th><th class="num">최대</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }).filter(Boolean).join('');

  if (!blocks) return '';
  return `<section><h2>Breakdown</h2>${blocks}
    <div class="note">P95가 가장 큰 항목이 곧 최적화 1순위 후보다. 요청 수가 적은데 P95가 크면
    "느리지만 드문" 경로이므로 사용자 체감 영향은 작을 수 있다 — 요청 수와 같이 본다.</div></section>`;
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

  const groups = (infra.groups || []).map((g) => {
    const rows = g.metrics
      .filter((m) => m.value != null)
      .map((m) => `<tr>
        <td title="${esc(m.desc || '')}">${esc(m.label)}</td>
        <td class="num">${fmt.byUnit(m.value, m.unit)}</td>
        <td style="color:var(--ink-muted);font-size:12px">${esc(m.desc || '')}</td>
      </tr>`).join('');
    if (!rows) return '';
    return `<h3>${esc(g.label)}</h3><div class="card scroll"><table>
      <thead><tr><th>지표</th><th class="num" style="width:120px">값</th><th>설명</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
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
    .map((c) => `<tr>
      <td>${esc(c.label)}</td>
      <td class="num">${fmt.byUnit(c.baseline, c.unit)}</td>
      <td class="num">${fmt.byUnit(c.current, c.unit)}</td>
      <td class="num">${deltaCell(c)}</td>
      <td><span class="badge b-${c.verdict}">${ICON[c.verdict]} ${c.verdict}</span>${c.gate && c.verdict === 'FAIL' ? ' <span class="badge b-FAIL">GATE</span>' : ''}</td>
      <td style="color:var(--ink-2);font-size:12px">${c.reasons.map((r) => esc(r.desc)).join('<br>') || (c.skipped ? esc(c.skipped) : '')}</td>
    </tr>`).join('');

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

  return `<section><h2>Regression</h2>
    <div class="card scroll">
      ${baselineStateWarn}
      ${scriptWarn}
      <table>
        <thead><tr><th>지표</th><th class="num">직전 (${esc(reg.baselineCommit || '—')})</th>
          <th class="num">현재</th><th class="num">변화</th><th>판정</th><th>사유</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">비교 가능한 지표가 없습니다.</td></tr>'}</tbody>
      </table>
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

function sectionTrend(record, trend) {
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
        val, unit === 'ratio' ? 'percent' : unit);
    }).join('');

  if (!cards) return '';
  return `<section><h2>Trend (최근 ${trend.length}회)</h2>
    <div class="sparks">${cards}</div>
    <div class="note">같은 시나리오·같은 환경의 최근 실행만 모았다. 오른쪽 끝이 이번 실행이다.
    한 번의 변화보다 <b>추세의 방향</b>이 중요하다 — 매 실행 5%씩 나빠지면 개별 판정은 계속 통과하지만
    10회 뒤에는 1.6배가 된다.</div></section>`;
}

function sectionThresholds(record) {
  const th = record.k6.thresholds || [];
  // 분해축/phase 서브메트릭 생성용 느슨한 임계값은 판정 의미가 없으므로 보고서에서 제외한다.
  // (config.js의 BREAKDOWN_THRESHOLDS·PHASE_DIAGNOSTIC_THRESHOLDS가 같은 목적으로 건 값들)
  const LOOSE = /p\(99\)<600000|^rate<=?1$|^rate>=0$|^count>=0$/;
  const real = th.filter((t) => !LOOSE.test(t.expression));
  if (!real.length) return '';
  const rows = real.map((t) => `<tr>
    <td><code>${esc(t.metric)}</code></td><td><code>${esc(t.expression)}</code></td>
    <td><span class="badge b-${t.ok ? 'PASS' : 'FAIL'}">${t.ok ? '✓ 통과' : '✕ 실패'}</span></td>
  </tr>`).join('');
  const failed = real.filter((t) => !t.ok).length;
  return `<section><h2>SLO Thresholds</h2><div class="card scroll">
    <table><thead><tr><th>메트릭</th><th>조건</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="note">${failed ? `${failed}건 미달` : '전 항목 충족'} — k6 실행 중 판정된 SLO다.
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

function renderReport(record, opts = {}) {
  const r = record.run;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.scenario)} #${r.number} — Performance Report</title>
<style>${CSS}</style>
</head><body>
${sectionHeader(record)}
<div class="wrap">
  ${sectionMeasurement(record)}
  ${sectionHints(record)}
  ${sectionSummary(record, opts.previous)}
  ${sectionRegression(record)}
  ${sectionInfra(record)}
  ${sectionBreakdown(record)}
  ${sectionTrend(record, opts.trend)}
  ${sectionThresholds(record)}
  ${sectionLinks(record)}
  <footer>
    생성 ${fmt.localTime(record.collectedAt)} · Run ID <code>${esc(r.id)}</code> ·
    원본 <code>run.json</code> / <code>k6.json</code> 은 같은 디렉터리에 있습니다.
  </footer>
</div>
</body></html>`;
}

// sectionRegression 은 기준선 탈락 사유·기준선 상태 표시의 단위 테스트를 위해 노출한다.
module.exports = { renderReport, sectionRegression, sparkline, meter, CSS };
