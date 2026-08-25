'use strict';
/**
 * detail-report — **조사(investigation) 레이어**. 계열 하나를 깊이 판다.
 *
 * 감시와 무엇이 다른가
 * --------------------
 * 세 단계 줌의 가운데다.
 *
 *   history.html              [감시]  전 계열 × 헤드라인 4개    "봐야 하는가"
 *   trends/<계열>.html        [조사]  한 계열 × 전 지표         "무엇인가"      ← 이 파일
 *   runs/<runId>/report.html  [단일]  실행 하나                 "그때 무슨 일이"
 *
 * 조사 화면에만 있어야 하는 것 — 단순히 "지표가 더 많은 페이지"가 아니다. 감시 화면이
 * **원리적으로** 담을 수 없는 것을 담는다.
 *
 *   1) 표본 구성 조절. 실측으로 확인됐다 — 계열 bfa06492dbb5 의 p95 CV 는 대기 발생 1회를
 *      빼면 42.28% → 18.05% 다. 감시는 하나의 답만 내놓아야 하므로 이 선택지를 담을 수 없다.
 *   2) 실패 축 **전체** 목록. 감시는 지배적인 축 하나면 된다.
 *   3) 회차별 원본 표. 계열 43개 중 34개가 실행 1회짜리라, 추세를 못 그리는 계열에서
 *      **유일하게 쓸모 있는 표시**가 이것이다. "데이터 부족"으로 비우면 그 페이지들이 죽는다.
 *   4) 실행 조건 전체. 이 계열이 정확히 무엇인지의 정의.
 *
 * 계산은 하나도 하지 않는다 — 전부 `lib/trends.js` 가 한다. 감시와 조사가 각자 CV 를
 * 계산하기 시작하면 같은 계열에 대해 두 화면이 다른 수치를 말한다(sampling.js 선례).
 */

const fmt = require('./format');
const cmp = require('./comparability');
const trends = require('./trends');
const { sparkline, CSS } = require('./report');

const esc = fmt.escapeHtml;

/** 계열 해시 → 파일명. 사람이 목록에서 알아볼 수 있어야 하므로 시나리오 이름을 앞에 둔다. */
function detailFileName(series) {
  const safe = String(series.scenario || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${safe}-${series.hash || 'nohash'}.html`;
}

/** 감시 화면에서 걸어 줄 상대 경로. */
function detailHref(series) {
  return `trends/${detailFileName(series)}`;
}

/** 체제 띠 — 조사 화면도 반드시 이고 간다. 없으면 원래의 실수를 더 큰 규모로 반복한다. */
function regimeStrip(rows) {
  const cells = rows.map((r, i) => {
    const g = trends.regimeOf(r);
    const cls = [`rg-${g.status.toLowerCase()}`];
    if (g.queued) cls.push('rg-queued');
    if (g.unmeasured) cls.push('rg-unmeasured');
    const bits = [
      `#${r.number || i + 1} ${fmt.localTime(r.startedAt).slice(0, 16)}`,
      `체제 ${g.label}`,
      `p95 ${fmt.ms(r.p95)}`,
    ];
    if (g.queued) bits.push(`⚠ 커넥션 대기 최대 ${r.hikariPendingMax}`);
    return `<i class="${cls.join(' ')}" title="${esc(bits.join(' · '))}"></i>`;
  }).join('');
  return `<div class="regime"><div class="rg-row">${cells}</div>
    <div class="rg-legend">
      <span><i class="rg-headroom"></i> 여유</span>
      <span><i class="rg-near_limit"></i> 한계 근처</span>
      <span><i class="rg-saturated"></i> 포화</span>
      <span><i class="rg-unassessed"></i> 미판정</span>
      <span><i class="rg-headroom rg-queued"></i> 커넥션 대기 발생</span>
    </div></div>`;
}

/** 표본 구성 × 판정 축의 CV/MDE 표 — 조사 화면의 고유 기능. */
function stabilityTable(rows) {
  const sets = trends.sampleSets(rows);
  const head = sets.map((s) => `<th class="num" colspan="2">${esc(s.label)} (n=${s.rows.length})</th>`).join('');
  const body = trends.JUDGEMENT_AXES.map((a) => {
    const cells = sets.map((s) => {
      const st = trends.stats(s.rows.map((r) => r[a.key]));
      if (!st || st.cv == null) return '<td class="num">—</td><td class="num">—</td>';
      const m = trends.mde(st.cv, st.n);
      const cls = st.cv > 30 ? 'd-bad' : st.cv > 15 ? 'd-flat' : 'd-good';
      return `<td class="num"><span class="${cls}">${st.cv.toFixed(1)}%</span></td>`
        + `<td class="num">${m == null ? '—' : `${m.toFixed(1)}%`}</td>`;
    }).join('');
    const base = trends.stats(rows.map((r) => r[a.key]));
    return `<tr><td><b>${esc(a.label)}</b><div class="sub" style="font-size:11px">평균 ${
      base ? fmt.byUnit(base.mean, a.unit) : '—'}</div></td>${cells}</tr>`;
  }).join('');

  return `<section>
    <h2>안정성 — 표본을 어떻게 잡느냐에 따라 답이 달라진다</h2>
    <div class="card">
      <div class="scroll"><table class="hist-table">
        <thead>
          <tr><th rowspan="2">판정 축</th>${head}</tr>
          <tr>${sets.map(() => '<th class="num">CV</th><th class="num">MDE</th>').join('')}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table></div>
      <div class="note">
        <b>CV</b>(변동계수) = 표준편차 ÷ 평균. <b>MDE</b>(최소 검출 가능 효과) = 개선 전/후를 각각 n회
        측정할 때 <b>이 값보다 작은 변화는 구분되지 않는다</b>. 정규 근사라 낙관적인 하한이다.<br>
        열마다 값이 크게 다르면 <b>어떤 표본을 근거로 삼았는지 밝히지 않은 수치는 의미가 없다</b>는 뜻이다.
      </div>
    </div>
  </section>`;
}

/** 실패 축 전체 목록 — 감시는 지배적인 하나만, 여기는 전부. */
function failureTable(rows, ruleName) {
  const axes = trends.failingAxes(rows);
  if (!axes.length) {
    return `<section><h2>실패 축</h2><div class="card"><div class="note">이 계열에는 실패한 게이트가 없습니다.</div></div></section>`;
  }
  const body = axes.map((a) => `<tr>
    <td><b>${esc(ruleName(a.key))}</b></td>
    <td class="num">${a.runs} / ${rows.length}</td>
    <td>${a.absolute > 0 ? '<span class="d-bad">절대 게이트</span>' : '상대 비교'}</td>
    <td><code style="font-size:11px">${esc(a.key)}</code></td>
  </tr>`).join('');
  return `<section>
    <h2>실패 축 — 무엇이 이 계열을 실패시켰나</h2>
    <div class="card"><div class="scroll"><table class="hist-table">
      <thead><tr><th>규칙</th><th class="num">실패 회차</th><th>사유</th><th>키</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="note"><b>절대 게이트</b>는 기준선과 무관하게 SLO 를 넘겨 걸린 것이다 —
    이전 대비 개선됐더라도 실패한다(삶은 개구리 방지).</div>
    </div>
  </section>`;
}

/** 지표 격자 — 지금은 인덱스에 있는 것만. 카탈로그 157개 전체는 인덱스가 flat 을 담은 뒤에 붙는다. */
function metricGrid(rows, metrics) {
  const cards = metrics.map((m) => {
    const raw = rows.map((r) => (r[m.key] == null ? null : r[m.key] * (m.scale || 1)));
    if (!raw.some((v) => v != null)) return '';
    const st = trends.trendStat(raw);
    const cur = [...raw].reverse().find((v) => v != null);
    const improved = st ? (m.dir === 'higher' ? st.changePct > 0 : st.changePct < 0) : null;
    const cls = !st || Math.abs(st.changePct) < 2 ? 'd-flat' : improved ? 'd-good' : 'd-bad';
    return `<div class="spark" id="m-${esc(m.key)}">
      <div class="st">${esc(m.label)}</div>
      <div class="sv">${fmt.byUnit(cur, m.unit)}</div>
      ${sparkline(raw, { label: m.label })}
      <div class="range">
        <span>${st ? `${st.n}회 · min ${fmt.byUnit(st.min, m.unit)}` : `${raw.filter((v) => v != null).length}회`}</span>
        <span class="${cls}">${st ? fmt.delta(st.changePct) : '—'}</span>
      </div>
    </div>`;
  }).filter(Boolean).join('');
  const missing = metrics.filter((m) => !rows.some((r) => r[m.key] != null));
  return `<section>
    <h2>지표 추세</h2>
    <div class="sparks">${cards}</div>
    ${missing.length ? `<div class="note">결측 ${missing.length}개 — ${
      missing.map((m) => esc(m.label)).join(', ')}. <b>값이 0인 것이 아니라 수집되지 않았다는 뜻이다.</b>
      실행 방식(<code>--loadgen local</code>, <code>--no-remote-write</code>)에 따라 통째로 비는 지표군이 있다.</div>` : ''}
  </section>`;
}

/**
 * 회차별 원본 표 — **추세를 못 그리는 계열에서 유일하게 쓸모 있는 표시.**
 * 계열 43개 중 34개가 실행 1회짜리다. 그 페이지들을 "데이터 부족"으로 비우면 안 된다.
 */
function rawTable(rows, ruleName, reportExists) {
  const body = [...rows].reverse().map((r) => {
    const g = trends.regimeOf(r);
    const v = r.verdict || '—';
    const href = `../runs/${r.id}/report.html`;
    const fails = (r.gateFailures || []).map((k) => ruleName(k)).join(', ') || '—';
    return `<tr>
      <td class="num">${r.number || '—'}</td>
      <td style="font-size:12px;white-space:nowrap">${reportExists(r)
        ? `<a href="${esc(href)}">${esc(fmt.localTime(r.startedAt).slice(0, 16))}</a>`
        : esc(fmt.localTime(r.startedAt).slice(0, 16))}</td>
      <td><code style="font-size:11px">${esc(r.commitShort || '—')}</code></td>
      <td class="num">${fmt.ms(r.avg)}</td>
      <td class="num">${fmt.ms(r.p95)}</td>
      <td class="num">${fmt.ms(r.p99)}</td>
      <td class="num">${fmt.num(r.tps, 2)}</td>
      <td class="num">${fmt.pct((r.errorRate || 0) * 100, 2)}</td>
      <td class="num">${fmt.pct(r.cpuMaxPct, 0)}</td>
      <td class="num">${fmt.pct(r.throttledPct, 1)}</td>
      <td class="num">${fmt.num(r.hikariPendingMax, 0)}</td>
      <td class="num">${fmt.ms(r.hikariAcquireP95Ms)}</td>
      <td class="num">${fmt.ms(r.stackCpuMsPerReq)}</td>
      <td>${esc(g.label)}${g.queued ? ' <span class="d-bad">⚠</span>' : ''}</td>
      <td><span class="badge b-${v}">${v}</span></td>
      <td style="font-size:11.5px;color:var(--ink-2)">${esc(fails)}</td>
    </tr>`;
  }).join('');
  return `<section>
    <h2>회차별 원본 (${rows.length}회, 최신순)</h2>
    <div class="card scroll"><table class="hist-table">
      <thead><tr>
        <th class="num">#</th><th>시작</th><th>커밋</th>
        <th class="num">평균</th><th class="num">P95</th><th class="num">P99</th><th class="num">TPS</th>
        <th class="num">오류율</th><th class="num">CPU</th><th class="num">Throttle</th>
        <th class="num">대기</th><th class="num">획득p95</th><th class="num">req당CPU</th>
        <th>체제</th><th>판정</th><th>실패 축</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="note">시작 시각을 클릭하면 그 실행의 단일 보고서로 이동한다.
    <b>대기</b>는 HikariCP 대기 스레드 최대치이고 0 이 아니면 그 회차의 응답시간에 큐 대기가 섞여 있다.</div>
    </div>
  </section>`;
}

/** 이 계열이 정확히 무엇인가 — 조건 전체. 계열의 정의이므로 조사 화면에는 전부 있어야 한다. */
function conditionTable(conditions) {
  const rows = cmp.describeAll(conditions)
    .map(([label, value]) => `<tr><td style="width:180px"><b>${esc(label)}</b></td><td>${esc(value)}</td></tr>`)
    .join('');
  return `<section><h2>실행 조건 — 이 계열의 정의</h2>
    <div class="card scroll"><table class="hist-table"><tbody>${rows}</tbody></table>
    <div class="note">이 조건이 하나라도 다르면 <b>다른 계열</b>이고, 두 계열의 수치를 나란히 놓는 것은
    비교가 아니다. 조건 전체를 해시한 값이 <code>seriesHash</code> 다.</div></div></section>`;
}

/**
 * 계열 상세 페이지 하나를 그린다.
 * @param {object} series  { scenario, hash, rows }
 * @param {object} opts    { metrics, ruleName, reportExists, extraCss }
 */
function renderSeriesDetail(series, opts = {}) {
  const rows = series.rows;
  const ruleName = opts.ruleName || ((k) => k);
  const reportExists = opts.reportExists || (() => false);
  const cond = rows[rows.length - 1].conditions;
  const mix = trends.regimeMix(rows);
  const line = trends.stabilityLine(rows);

  const warnings = [];
  if (mix.mixed) {
    warnings.push('<b>이 계열에 서로 다른 체제가 섞여 있습니다.</b> 포화 영역의 p95 는 <code>R = N/X</code> 로 '
      + '결정되고 비포화 영역의 p95 는 서비스 시간입니다 — 서로 다른 물리량이라 증감률에 의미가 없습니다.');
  }
  if (mix.allUnassessed) {
    warnings.push('포화 판정 기록이 없는 계열입니다(<code>saturation.js</code> 도입 2026-08-20 이전). '
      + '<b>판정 없음은 여유 있음이 아닙니다.</b>');
  }
  if (rows.length < trends.MIN_TREND_SAMPLES) {
    warnings.push(`실행이 ${rows.length}회뿐이라 <b>추세와 변동성을 계산하지 않습니다</b>(최소 ${
      trends.MIN_TREND_SAMPLES}회). 아래 회차별 원본 표만 유효합니다.`);
  }

  const canTrend = rows.length >= trends.MIN_TREND_SAMPLES;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(series.scenario)} — 계열 ${esc(series.hash || '')}</title>
<style>${CSS}${opts.extraCss || ''}</style>
</head><body>
<div class="head"><div class="wrap">
  <div class="head-top"><div class="head-title">
    <h1>${esc(series.scenario)} — 계열 상세</h1>
    <div class="sub"><a href="../history.html">← 이력(감시)으로</a> · 계열 <code>${esc(series.hash || '—')}</code> · ${rows.length}회</div>
  </div></div>
  <dl class="meta">
    <div><dt>실행 수</dt><dd>${rows.length}</dd></div>
    <div><dt>기간</dt><dd style="font-size:12px">${fmt.localTime(rows[0].startedAt).slice(0, 10)} ~ ${
      fmt.localTime(rows[rows.length - 1].startedAt).slice(0, 10)}</dd></div>
    <div><dt>실패</dt><dd>${rows.filter((r) => r.verdict === 'FAIL').length}</dd></div>
    <div><dt>대기 발생</dt><dd>${mix.queued}</dd></div>
    <div><dt>판정 축 MDE</dt><dd>${line && line.axis.mde != null ? `${line.axis.mde.toFixed(1)}%` : '—'}</dd></div>
  </dl>
</div></div>

<div class="wrap">
  <section>
    <h2>체제 — 이 배경 위에서 아래 수치를 읽는다</h2>
    ${regimeStrip(rows)}
    ${warnings.map((w) => `<div class="note" style="border-color:var(--serious)">${w}</div>`).join('')}
  </section>

  ${canTrend ? stabilityTable(rows) : ''}
  ${failureTable(rows, ruleName)}
  ${canTrend && opts.metrics ? metricGrid(rows, opts.metrics) : ''}
  ${rawTable(rows, ruleName, reportExists)}
  ${conditionTable(cond)}

  <footer>생성 ${fmt.localTime(new Date().toISOString())} · <code>reports/index.json</code> 기준 ·
  계산은 <code>tools/lib/trends.js</code> 가 소유한다</footer>
</div>
</body></html>`;
}

module.exports = { renderSeriesDetail, detailFileName, detailHref };
