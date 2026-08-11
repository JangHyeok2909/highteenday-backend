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
const { sparkline, CSS } = require('./lib/report');

const esc = fmt.escapeHtml;

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

/**
 * 추세 통계 — 최근 N회를 앞/뒤 절반으로 나눠 중앙값을 비교한다.
 *
 * 왜 "첫 값 대비 마지막 값"이 아닌가: 개별 실행은 노이즈가 크다. 양 끝점 두 개만 쓰면
 * 하필 그 두 번이 이상치였을 때 완전히 틀린 결론이 나온다. 절반씩 묶어 중앙값을 비교하면
 * 이상치 하나에 흔들리지 않으면서 방향성은 그대로 드러난다.
 */
function trendStat(values) {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  if (v.length < 4) return null;
  const mid = Math.floor(v.length / 2);
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const older = median(v.slice(0, mid));
  const newer = median(v.slice(mid));
  if (!older) return null;
  return {
    older, newer,
    changePct: ((newer - older) / Math.abs(older)) * 100,
    first: v[0], last: v[v.length - 1],
    min: Math.min(...v), max: Math.max(...v),
    n: v.length,
  };
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

function renderHistory(runs, opts) {
  const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
  const latest = runs[runs.length - 1];

  // ── 조건 계열별 추세 카드 ─────────────────────────────────────
  // 시나리오 이름만으로 묶으면 small/15VU 실행과 large/200VU 실행이 한 선에 섞여,
  // 데이터셋을 바꾼 지점이 성능 급락으로 보인다. 기준선 선택과 같은 결함이 여기에도
  // 있었다 — 추세는 "같은 조건으로 잰 것"끼리만 이어야 의미가 있다.
  const series = [];
  for (const r of runs) {
    const key = `${r.scenario}::${r.seriesHash || 'unknown'}`;
    let s = series.find((x) => x.key === key);
    if (!s) series.push((s = { key, scenario: r.scenario, hash: r.seriesHash, rows: [] }));
    s.rows.push(r);
  }
  series.sort((a, b) => a.scenario.localeCompare(b.scenario) || b.rows.length - a.rows.length);

  const trendSections = series.map(({ scenario: sc, hash, rows }) => {
    if (rows.length < 2) return '';
    const cond = rows[rows.length - 1].conditions;
    const seriesLabel = cond
      ? `데이터셋 ${esc(String(cond.dataset || '—'))} · ${esc(cmp.formatLoadProfile(cond.loadProfile))}`
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
      <td><span class="badge b-${v}">${v === 'PASS' ? '✓' : v === 'WARN' ? '!' : '✕'} ${v}</span></td>
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
        <th class="num">Heap</th><th class="num">Slow</th><th>판정</th>
      </tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
    <div class="note">시나리오 이름을 클릭하면 해당 실행의 상세 보고서로 이동합니다.
    비교는 항상 <b>같은 시나리오 + 같은 환경</b>끼리만 이뤄집니다 — 다른 시나리오끼리의 절대값 비교는 의미가 없습니다.</div>
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
