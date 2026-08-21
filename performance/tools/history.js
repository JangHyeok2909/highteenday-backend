#!/usr/bin/env node
/**
 * Performance History — 전체 실행 이력과 추세를 한 화면으로 만든다.
 *
 * 왜 개별 보고서만으로는 부족한가
 * --------------------------------
 * 실행 하나짜리 보고서는 "이번 배포가 안전한가"에는 답하지만 "우리 서비스가 반년 동안
 * 느려지고 있는가"에는 답하지 못한다. 성능 저하는 대개 한 번의 큰 사고가 아니라
 * 매 배포 3~5%씩의 누적으로 온다. 개별 판정은 계속 통과하는데 6개월 뒤 2배가 되는 식이다.
 * 이 화면의 존재 이유가 그 누적을 보이게 만드는 것이다.
 *
 * 사용법
 *   node tools/history.js                 전체 이력 HTML 생성
 *   node tools/history.js --scenario normal-day
 *   node tools/history.js --limit 50
 *   node tools/history.js --rebuild       index.json을 run.json들로부터 재생성
 *   node tools/history.js --print         터미널에 표로 출력
 */
'use strict';

const fs = require('fs');
const path = require('path');
const repo = require('./lib/repository');
const fmt = require('./lib/format');
const cmp = require('./lib/comparability');
const trends = require('./lib/trends');
const { sparkline, CSS } = require('./lib/report');

const esc = fmt.escapeHtml;

// 추세 수학은 전부 lib/trends.js 가 소유한다. 계열별 상세 이력이 붙을 때 같은 계산을
// 복제하지 않기 위해서다 — 복제하면 두 화면이 같은 계열에 대해 다른 CV 를 말하게 된다.
const { trendStat } = trends;

function parseArgs(argv) {
  const o = { scenario: null, environment: null, limit: 100, rebuild: false, print: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario') o.scenario = argv[++i];
    else if (a === '--env') o.environment = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--rebuild') o.rebuild = true;
    else if (a === '--print') o.print = true;
    else if (a === '--out') o.out = argv[++i];
  }
  return o;
}

const TREND_METRICS = [
  { key: 'p95', label: 'P95 응답시간', unit: 'ms', dir: 'lower' },
  { key: 'avg', label: '평균 응답시간', unit: 'ms', dir: 'lower' },
  { key: 'p99', label: 'P99 응답시간', unit: 'ms', dir: 'lower' },
  { key: 'tps', label: 'TPS', unit: 'per_sec', dir: 'higher' },
  { key: 'rps', label: 'RPS', unit: 'per_sec', dir: 'higher' },
  { key: 'errorRate', label: '오류율', unit: 'percent', dir: 'lower', scale: 100 },
  { key: 'cpuMaxPct', label: 'CPU 포화도', unit: 'percent', dir: 'lower' },
  { key: 'heapMaxBytes', label: 'Heap 최대', unit: 'bytes', dir: 'lower' },
  { key: 'gcPauseMaxMs', label: 'GC 최대 정지', unit: 'ms', dir: 'lower' },
  { key: 'mysqlSlowQueries', label: 'Slow Query', unit: 'count', dir: 'lower' },
  { key: 'mysqlQps', label: 'MySQL QPS', unit: 'per_sec', dir: 'lower' },
  { key: 'redisHitPct', label: 'Redis 적중률', unit: 'percent', dir: 'higher' },
];

function deltaSpan(changePct, dir) {
  if (changePct == null || !Number.isFinite(changePct)) return '<span class="d-flat">—</span>';
  const improved = dir === 'higher' ? changePct > 0 : changePct < 0;
  const cls = Math.abs(changePct) < 2 ? 'd-flat' : improved ? 'd-good' : 'd-bad';
  const arrow = changePct > 0 ? '▲' : changePct < 0 ? '▼' : '·';
  return `<span class="${cls}">${arrow} ${fmt.delta(changePct)}</span>`;
}

/** 규칙 키 → 사람이 읽는 이름. rules.json 이 이미 label 을 들고 있으므로 거기서 가져온다. */
function ruleLabels() {
  const map = {};
  try {
    for (const r of require('./lib/regression').loadRules()) map[r.key] = r.label || r.key;
  } catch (e) { /* 규칙 파일을 못 읽어도 이력은 그려져야 한다 — 키를 그대로 쓴다 */ }
  return map;
}
const RULE_LABEL = ruleLabels();
const ruleName = (key) => RULE_LABEL[key] || key;

/** 이력 표의 체제 칸. 판정이 없으면 '미판정'이라고 쓴다 — 빈칸으로 두면 여유로 읽힌다. */
function regimeBadge(r) {
  const g = trends.regimeOf(r);
  const mark = g.queued ? ' <span class="d-bad" title="커넥션 대기 발생">⚠</span>' : '';
  const cls = g.status === 'HEADROOM' ? 'd-good'
    : g.status === 'SATURATED' ? 'd-bad'
      : g.status === 'NEAR_LIMIT' ? 'd-flat' : 'd-flat';
  const dim = g.source === 'none' ? ' style="opacity:.55"' : '';
  return `<span class="${cls}"${dim}>${esc(g.label)}</span>${mark}`;
}

/** 실패한 게이트 이름. 절대 게이트(기준선과 무관하게 걸린 것)는 별표로 구분한다. */
function failedAxisText(r) {
  const fails = r.gateFailures || [];
  if (!fails.length) return r.verdict === 'FAIL' ? '(키 미기록)' : '—';
  const abs = new Set(r.absoluteGateFailures || []);
  return fails.map((k) => (abs.has(k) ? `${ruleName(k)}*` : ruleName(k))).join(', ');
}

/**
 * 체제 띠 — 회차마다 블록 하나. **이 배경 위에서 아래 스파크라인을 읽어야 한다.**
 *
 * 왜 맨 위에 오는가: 포화 상태의 p95 는 애플리케이션 지연이 아니라 큐 대기라서, 포화 회차와
 * 비포화 회차가 같은 선에 섞이면 그 선은 성능이 아니라 부하 설정을 그린다. 실측으로 38배
 * 차이가 확인됐다(278ms vs 10,685ms). 어느 점이 어느 쪽인지 먼저 보여야 나머지가 읽힌다.
 */
function regimeStrip(rows) {
  const cells = rows.map((r, i) => {
    const g = trends.regimeOf(r);
    const cls = [`rg-${g.status.toLowerCase()}`];
    if (g.queued) cls.push('rg-queued');
    if (g.unmeasured) cls.push('rg-unmeasured');
    const bits = [
      `#${r.number || i + 1} ${fmt.localTime(r.startedAt).slice(0, 16)}`,
      `체제 ${g.label}${g.source === 'none' ? ' (saturation.js 도입 이전)' : ''}`,
      `p95 ${fmt.ms(r.p95)}`,
    ];
    if (g.queued) bits.push(`⚠ 커넥션 대기 최대 ${r.hikariPendingMax}`);
    if (g.achievedRatePct != null) bits.push(`도착률 달성 ${g.achievedRatePct.toFixed(0)}%`);
    if (g.unmeasured) bits.push('⚠ 측정 불가(UNMEASURED)');
    return `<i class="${cls.join(' ')}" title="${esc(bits.join(' · '))}"></i>`;
  }).join('');

  const mix = trends.regimeMix(rows);
  const notes = [];
  if (mix.mixed) {
    notes.push('<b>이 계열에 서로 다른 체제가 섞여 있습니다.</b> 포화 영역의 p95 는 <code>R = N/X</code> 로 '
      + '결정되고 비포화 영역의 p95 는 서비스 시간입니다 — <b>서로 다른 물리량</b>이라 아래 증감률에 의미가 없습니다.');
  }
  if (mix.queued) {
    notes.push(`커넥션 대기가 발생한 회차가 <b>${mix.queued}건</b> 있습니다. 그 회차의 응답시간에는 대기 시간이 `
      + '섞여 있습니다 — 아래 안정성 표에서 제외했을 때의 값을 함께 보십시오.');
  }
  if (mix.allUnassessed) {
    notes.push('이 계열에는 포화 판정 기록이 없습니다(<code>saturation.js</code> 도입 2026-08-20 이전 실행). '
      + '<b>판정 없음은 여유 있음이 아닙니다.</b> <code>node tools/collect.js &lt;runId&gt; --force --no-wait</code> 로 '
      + '재수집하면 소급 판정됩니다(Prometheus 보관 기간 안이라면).');
  }

  return `<div class="regime">
    <div class="rg-row">${cells}</div>
    <div class="rg-legend">
      <span><i class="rg-headroom"></i> 여유</span>
      <span><i class="rg-near_limit"></i> 한계 근처</span>
      <span><i class="rg-saturated"></i> 포화</span>
      <span><i class="rg-unassessed"></i> 미판정</span>
      <span><i class="rg-headroom rg-queued"></i> 커넥션 대기 발생</span>
      <span><i class="rg-headroom rg-unmeasured"></i> 측정 불가</span>
      <span style="margin-left:auto;color:var(--ink-muted)">← 오래된 순 · 마우스를 올리면 상세</span>
    </div>
    ${notes.map((n) => `<div class="note" style="border-color:var(--serious)">${n}</div>`).join('')}
  </div>`;
}

/**
 * 안정성 패널 — CV 와 MDE. **개별 실행 리포트가 원리적으로 만들 수 없는 값이다(n=1).**
 *
 * MDE 를 띄우는 이유는 하나다: 이 값을 모르면 최적화 작업의 검증 가능 여부를 알 수 없다.
 * MDE 25% 인 계열에서 12% 개선을 하면 개선은 실재하는데 "차이 없음"으로 결론난다.
 * `localDocs/README.md` 가 "개선 후에는 개선 폭과 MDE 를 함께 기록"하라고 적고 있는데,
 * 그 MDE 를 계산해 주는 화면이 지금까지 없었다.
 */
function stabilityPanel(rows) {
  const sets = trends.sampleSets(rows);
  const axes = trends.JUDGEMENT_AXES;

  const head = sets.map((s) => `<th class="num" colspan="2">${esc(s.label)} (n=${s.rows.length})</th>`).join('');
  const body = axes.map((a) => {
    const cells = sets.map((s) => {
      const st = trends.stats(s.rows.map((r) => r[a.key]));
      if (!st || st.cv == null) return '<td class="num">—</td><td class="num">—</td>';
      const m = trends.mde(st.cv, st.n);
      const cvCls = st.cv > 30 ? 'd-bad' : st.cv > 15 ? 'd-flat' : 'd-good';
      return `<td class="num"><span class="${cvCls}">${st.cv.toFixed(1)}%</span></td>`
        + `<td class="num">${m == null ? '—' : m.toFixed(1) + '%'}</td>`;
    }).join('');
    const base = trends.stats(rows.map((r) => r[a.key]));
    return `<tr><td><b>${esc(a.label)}</b><div class="sub" style="font-size:11px">평균 ${
      base ? fmt.byUnit(base.mean, a.unit) : '—'}</div></td>${cells}</tr>`;
  }).join('');

  // 권고 축 — 가장 예민한(MDE 가 작은) 지연 축을 고른다.
  const primary = sets.find((s) => s.key === 'no-queue') || sets[0];
  const stability = trends.stabilityOf(primary.rows);
  const rec = trends.recommendAxis(stability);
  let advice = '';
  if (rec.latency) {
    const need = trends.runsNeededFor(10, rec.latency.stats.cv);
    const others = stability.filter((s) => s.unit === 'ms' && s.key !== rec.latency.key && s.mde != null);
    advice = `<div class="note">
      <b>판정 축 권고 — ${esc(primary.label)} 기준</b><br>
      지연 축 중 가장 예민한 것은 <b>${esc(rec.latency.label)}</b> 입니다 (CV ${rec.latency.stats.cv.toFixed(1)}% ·
      MDE <b>${rec.latency.mde.toFixed(1)}%</b>). ${others.length
        ? `비교: ${others.map((o) => `${esc(o.label)} MDE ${o.mde.toFixed(1)}%`).join(' · ')}`
        : ''}<br>
      10% 개선을 검출하려면 조건당 <b>${need ? (need.capped ? `${need.exact}회 (사실상 불가)` : `${need.n}회`) : '—'}</b>가
      필요합니다.${need && need.capped
        ? ' 이 정도면 <b>표본을 더 모아서 될 일이 아닙니다</b> — 반복이 아니라 변동원 제거(포화 회차 배제·조건 고정)가 먼저입니다.'
        : ''}
    </div>`;
  }

  return `<div class="card" style="margin-bottom:14px">
    <b>안정성 — 이 계열에서 무엇을 검출할 수 있는가</b>
    <div class="scroll" style="margin-top:8px"><table class="hist-table">
      <thead>
        <tr><th rowspan="2">판정 축</th>${head}</tr>
        <tr>${sets.map(() => '<th class="num">CV</th><th class="num">MDE</th>').join('')}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="note">
      <b>CV</b>(변동계수) = 표준편차 ÷ 평균. 같은 조건에서 값이 얼마나 흔들리는가.<br>
      <b>MDE</b>(최소 검출 가능 효과) = 개선 전/후를 각각 n회 측정할 때 <b>이 값보다 작은 변화는 구분되지 않는다</b>.
      정규 근사이므로 낙관적인 하한입니다 — n이 작으면 실제로는 더 큽니다.
    </div>
    ${advice}
  </div>`;
}

/** 이 계열을 실제로 실패시킨 게이트. FAIL 배지만으로는 "무엇이" 실패했는지 알 수 없다. */
function failingAxisCard(rows) {
  const axes = trends.failingAxes(rows);
  if (!axes.length) return '';
  const n = rows.length;
  const items = axes.map((a) => {
    const abs = a.absolute > 0 ? ' <span class="d-bad">절대 게이트</span>' : '';
    return `<li><b>${esc(ruleName(a.key))}</b> — ${a.runs}/${n}회 실패${abs}
      <code style="font-size:11px;color:var(--ink-muted)">${esc(a.key)}</code></li>`;
  }).join('');
  const dominant = axes[0];
  const all = dominant.runs === n;
  return `<div class="card" style="margin-bottom:14px">
    <b>실패 축 — 무엇이 이 계열을 실패시켰나</b>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.9">${items}</ul>
    ${all ? `<div class="note" style="border-color:var(--serious)">
      <b>${n}회 전부 같은 축(${esc(ruleName(dominant.key))})에서 실패했습니다.</b>
      매번 같은 곳에서 걸린다면 노이즈가 아니라 구조입니다. 다른 지표가 SLO 안에 있어도
      이 축이 실패 원인이므로, 개선 대상은 이쪽입니다.</div>` : ''}
  </div>`;
}

function renderHistory(runs, opts) {
  const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
  const latest = runs[runs.length - 1];

  // ── 조건 계열별 추세 카드 ─────────────────────────────────────
  // 시나리오 이름만으로 묶으면 small/15VU 실행과 large/200VU 실행이 한 선에 섞여,
  // 데이터셋을 바꾼 지점이 성능 급락으로 보인다. 기준선 선택과 같은 결함이 여기에도
  // 있었다 — 추세는 "같은 조건으로 잰 것"끼리만 이어야 의미가 있다.
  const series = trends.seriesOf(runs);
  series.sort((a, b) => a.scenario.localeCompare(b.scenario) || b.rows.length - a.rows.length);

  const trendSections = series.map(({ scenario: sc, hash, rows }) => {
    if (rows.length < 2) return '';
    const cond = rows[rows.length - 1].conditions;
    // 포맷터는 CONDITIONS 표가 소유한다. 예전에는 여기서 String(cond.dataset) 을 했는데,
    // dataset 조건이 객체가 된 뒤로 화면에 `[object Object]` 가 찍히고 있었다.
    const seriesLabel = cond
      ? `데이터셋 ${esc(cmp.describeCondition(cond, 'dataset'))} · ${esc(cmp.formatLoadProfile(cond.loadProfile))}`
      : '조건 미기록';

    const cards = TREND_METRICS.map((m) => {
      const raw = rows.map((r) => (r[m.key] == null ? null : r[m.key] * (m.scale || 1)));
      if (!raw.some((v) => v != null)) return '';
      const st = trendStat(raw);
      const cur = raw[raw.length - 1];
      return `<div class="spark">
        <div class="st">${esc(m.label)}</div>
        <div class="sv">${fmt.byUnit(cur, m.unit)}</div>
        ${sparkline(raw, { label: m.label })}
        <div class="range">
          <span>${st ? `${st.n}회 · ` : ''}min ${fmt.byUnit(st ? st.min : null, m.unit)}</span>
          <span>${st ? deltaSpan(st.changePct, m.dir) : ''}</span>
        </div>
      </div>`;
    }).filter(Boolean).join('');

    // 회귀형 추세 요약 — 전반부 대비 후반부가 얼마나 나빠졌나
    const worsening = TREND_METRICS.map((m) => {
      const raw = rows.map((r) => (r[m.key] == null ? null : r[m.key] * (m.scale || 1)));
      const st = trendStat(raw);
      if (!st) return null;
      const bad = m.dir === 'higher' ? -st.changePct : st.changePct;
      return bad > 10 ? { label: m.label, bad, st, unit: m.unit } : null;
    }).filter(Boolean).sort((a, b) => b.bad - a.bad);

    return `<section>
      <h2>${esc(sc)} — 추세 (${rows.length}회)</h2>
      <div class="sub" style="margin:-6px 0 12px">${seriesLabel}${hash ? ` · 계열 <code>${esc(hash)}</code>` : ''}</div>
      ${regimeStrip(rows)}
      ${failingAxisCard(rows)}
      ${stabilityPanel(rows)}
      ${worsening.length ? `<div class="card" style="margin-bottom:14px">
        <b>누적 저하 감지</b>
        <div class="note" style="border-color:var(--serious)">
          최근 ${rows.length}회를 전반/후반으로 나눠 중앙값을 비교했을 때 다음 지표가 나빠지는 방향입니다:<br>
          ${worsening.map((w) => `· <b>${esc(w.label)}</b> ${fmt.byUnit(w.st.older, w.unit)} → ${fmt.byUnit(w.st.newer, w.unit)} (${fmt.delta(w.st.changePct)})`).join('<br>')}
          <br><br>개별 실행 판정은 통과했더라도 방향이 일관되면 구조적 저하입니다.
        </div>
      </div>` : ''}
      <div class="sparks">${cards}</div>
    </section>`;
  }).filter(Boolean).join('');

  // ── 실행 이력 표 ──────────────────────────────────────────────
  const historyRows = [...runs].reverse().map((r) => {
    const v = r.verdict || (r.thresholdsPassed === false ? 'FAIL' : 'PASS');
    const reportPath = `runs/${r.id}/report.html`;
    const exists = fs.existsSync(path.join(repo.PERF_ROOT, 'reports', reportPath));
    return `<tr>
      <td class="num">${r.number || '—'}</td>
      <td>${exists ? `<a href="${esc(reportPath)}">${esc(r.scenario)}</a>` : esc(r.scenario)}</td>
      <td>${esc(r.environment || '—')}</td>
      <td><code style="font-size:11px">${esc(r.commitShort || '—')}</code></td>
      <td style="font-size:12px;color:var(--ink-2)">${esc(r.branch || '—')}</td>
      <td style="font-size:12px;white-space:nowrap">${fmt.localTime(r.startedAt).slice(0, 16)}</td>
      <td class="num">${fmt.num(r.vusMax, 0)}</td>
      <td class="num">${fmt.ms(r.avg)}</td>
      <td class="num">${fmt.ms(r.p95)}</td>
      <td class="num">${fmt.ms(r.p99)}</td>
      <td class="num">${fmt.num(r.tps, 2)}</td>
      <td class="num">${fmt.pct((r.errorRate || 0) * 100, 2)}</td>
      <td class="num">${fmt.pct(r.cpuMaxPct, 0)}</td>
      <td class="num">${fmt.bytes(r.heapMaxBytes)}</td>
      <td class="num">${fmt.num(r.mysqlSlowQueries, 0)}</td>
      <td>${regimeBadge(r)}</td>
      <td><span class="badge b-${v}">${v === 'PASS' ? '✓' : v === 'WARN' ? '!' : '✕'} ${v}</span></td>
      <td style="font-size:11.5px;color:var(--ink-2)">${esc(failedAxisText(r))}</td>
    </tr>`;
  }).join('');

  const byScenario = scenarios.map((sc) => {
    const rows = runs.filter((r) => r.scenario === sc);
    const last = rows[rows.length - 1];
    return `<tr>
      <td><b>${esc(sc)}</b></td>
      <td class="num">${rows.length}</td>
      <td style="font-size:12px">${fmt.localTime(last.startedAt).slice(0, 16)}</td>
      <td class="num">${fmt.ms(last.p95)}</td>
      <td class="num">${fmt.num(last.tps, 2)}</td>
      <td><span class="badge b-${last.verdict || 'PASS'}">${last.verdict || 'PASS'}</span></td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Performance History</title>
<style>${CSS}
.hist-table { font-size: 12.5px; }
.hist-table td, .hist-table th { padding: 6px 8px; white-space: nowrap; }

/* 체제 띠 — 회차 하나가 블록 하나. 스파크라인보다 위에 두어 "이 선을 어떻게 읽을지"를 먼저 말한다. */
.regime { margin: 0 0 14px; }
.rg-row { display: flex; gap: 2px; flex-wrap: wrap; }
.rg-row i {
  display: block; width: 22px; height: 16px; border-radius: 3px;
  background: var(--border); position: relative; cursor: help;
}
.rg-headroom   { background: var(--good) !important; }
.rg-near_limit { background: var(--warning) !important; }
.rg-saturated  { background: var(--critical) !important; }
.rg-unknown,
.rg-unassessed {
  background: repeating-linear-gradient(45deg,
    var(--border), var(--border) 3px, var(--plane) 3px, var(--plane) 6px) !important;
}
/* 대기 발생 — 체제 판정과 독립된 관측 사실이라 색이 아니라 테두리로 겹쳐 표시한다. */
.rg-queued::after {
  content: ''; position: absolute; inset: 0; border-radius: 3px;
  border: 2px solid var(--critical);
}
/* 측정 불가 — 값 자체를 믿을 수 없는 회차. 위에 사선을 긋는다. */
.rg-unmeasured::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to top right, transparent 45%, var(--ink) 45%,
    var(--ink) 55%, transparent 55%);
}
.rg-legend {
  display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
  margin-top: 8px; font-size: 11.5px; color: var(--ink-2);
}
.rg-legend span { display: flex; gap: 5px; align-items: center; }
.rg-legend i { display: block; width: 14px; height: 11px; border-radius: 2px;
  background: var(--border); position: relative; }
</style>
</head><body>
<div class="head"><div class="wrap">
  <div class="head-top">
    <div class="head-title">
      <h1>Performance History</h1>
      <div class="sub">${runs.length}회 실행 · ${scenarios.length}개 시나리오 · 최종 ${latest ? fmt.localTime(latest.startedAt) : '—'}</div>
    </div>
  </div>
  <dl class="meta">
    <div><dt>총 실행</dt><dd>${runs.length}</dd></div>
    <div><dt>시나리오</dt><dd>${scenarios.length}</dd></div>
    <div><dt>실패</dt><dd>${runs.filter((r) => r.verdict === 'FAIL').length}</dd></div>
    <div><dt>경고</dt><dd>${runs.filter((r) => r.verdict === 'WARN').length}</dd></div>
    <div><dt>기간</dt><dd style="font-size:12px">${runs.length ? fmt.localTime(runs[0].startedAt).slice(0, 10) : '—'} ~ ${latest ? fmt.localTime(latest.startedAt).slice(0, 10) : '—'}</dd></div>
  </dl>
</div></div>

<div class="wrap">
  <section>
    <h2>시나리오 현황</h2>
    <div class="card scroll"><table>
      <thead><tr><th>시나리오</th><th class="num">실행 수</th><th>최종 실행</th>
        <th class="num">최종 P95</th><th class="num">최종 TPS</th><th>판정</th></tr></thead>
      <tbody>${byScenario}</tbody>
    </table></div>
  </section>

  ${trendSections}

  <section>
    <h2>실행 이력 (최신순)</h2>
    <div class="card scroll"><table class="hist-table">
      <thead><tr>
        <th class="num">#</th><th>시나리오</th><th>환경</th><th>커밋</th><th>브랜치</th><th>시작</th>
        <th class="num">VU</th><th class="num">평균</th><th class="num">P95</th><th class="num">P99</th>
        <th class="num">TPS</th><th class="num">오류율</th><th class="num">CPU</th>
        <th class="num">Heap</th><th class="num">Slow</th><th>체제</th><th>판정</th><th>실패 축</th>
      </tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
    <div class="note">시나리오 이름을 클릭하면 해당 실행의 상세 보고서로 이동합니다.
    비교는 항상 <b>같은 시나리오 + 같은 환경</b>끼리만 이뤄집니다 — 다른 시나리오끼리의 절대값 비교는 의미가 없습니다.<br>
    <b>체제</b>는 그 실행이 포화 상태였는지입니다. 포화 상태의 응답시간은 애플리케이션 지연이 아니라 큐 대기이므로
    <b>앱 성능으로 인용하면 안 됩니다</b>. ⚠ 는 커넥션 대기가 발생한 회차입니다.
    <b>미판정</b>은 <code>saturation.js</code> 도입(2026-08-20) 이전 실행이며 <b>여유 있음이 아닙니다</b>.<br>
    <b>실패 축</b>은 그 실행을 FAIL 로 만든 게이트 규칙입니다. <code>*</code> 는 기준선과 무관하게 걸린 절대 게이트입니다 —
    이전 대비 개선됐더라도 SLO 를 넘으면 실패합니다.</div>
    </div>
  </section>

  <footer>생성 ${fmt.localTime(new Date().toISOString())} · <code>reports/index.json</code> 기준</footer>
</div>
</body></html>`;
}

function printTable(runs) {
  const pad = (s, n) => String(s == null ? '—' : s).padEnd(n).slice(0, n);
  const padL = (s, n) => String(s == null ? '—' : s).padStart(n).slice(0, n);
  console.log();
  console.log(['#'.padStart(4), pad('시나리오', 16), pad('커밋', 10), pad('시작', 17),
    padL('평균', 8), padL('P95', 8), padL('TPS', 7), padL('오류율', 8), padL('CPU', 6), padL('판정', 6)].join(' '));
  console.log('─'.repeat(96));
  for (const r of runs.slice(-40)) {
    console.log([
      padL(r.number, 4), pad(r.scenario, 16), pad(r.commitShort, 10),
      pad(fmt.localTime(r.startedAt).slice(0, 16), 17),
      padL(fmt.ms(r.avg), 8), padL(fmt.ms(r.p95), 8), padL(fmt.num(r.tps, 2), 7),
      padL(fmt.pct((r.errorRate || 0) * 100, 2), 8), padL(fmt.pct(r.cpuMaxPct, 0), 6),
      padL(r.verdict || '—', 6),
    ].join(' '));
  }
  console.log();
}

function main() {
  const o = parseArgs(process.argv.slice(2));

  if (o.rebuild) {
    const idx = repo.rebuildIndex();
    console.log(`인덱스 재생성 완료 — ${idx.runs.length}건`);
  }

  const idx = repo.loadIndex();
  let runs = idx.runs;
  if (o.scenario) runs = runs.filter((r) => r.scenario === o.scenario);
  if (o.environment) runs = runs.filter((r) => r.environment === o.environment);
  if (o.limit) runs = runs.slice(-o.limit);

  if (!runs.length) {
    console.error('이력이 없습니다. 먼저 테스트를 실행하세요: node tools/perf-run.js scenarios/normal-day.js');
    process.exit(1);
  }

  if (o.print) { printTable(runs); return; }

  const out = o.out || path.join(repo.PERF_ROOT, 'reports', 'history.html');
  repo.ensureDir(path.dirname(out));
  fs.writeFileSync(out, renderHistory(runs, o));
  console.log(`History 생성: ${path.relative(repo.PERF_ROOT, out)} (${runs.length}건)`);
}

if (require.main === module) main();

module.exports = { renderHistory, trendStat };
