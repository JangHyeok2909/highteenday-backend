/**
 * 관측 보고서 — 판정이 없다.
 *
 * 보여 주는 것
 *   1. 질문·계획·가설(expect) — 가설 옆에 "관측:" 빈칸. 채우는 것은 사람이다
 *   2. 시간축: RPS·오류율·p95·스레드·풀 위에 주입 시각 세로선과 fault 구간 음영
 *   3. 구간 × 전체 표: 요청 수, p50/p95/p99/max, 오류율, dropped iterations
 *   4. 실패 응답의 지연 분포 — 즉시 실패인가 30초/60초 뒤 실패인가
 *   5. 폭발 반경: 기능 × 구간 의 오류율·p95
 *   6. 인프라 지표 구간별 (pool·cpu·mysql·redis·k6ts 그룹)
 *   7. 헬스체크 전이
 *   8. 같은 계획으로 돌린 다른 실행 — 링크만. 비교 수치는 만들지 않는다
 *
 * 왜 PASS/FAIL 이 없는가: resilience/README.md.
 */
'use strict';

const fmt = require('../../tools/lib/format');
const { PHASE_ORDER } = require('./plan');

const esc = fmt.escapeHtml;
const n = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : fmt.num(v, d));
const ms = (v) => (v == null || Number.isNaN(v) ? '—' : fmt.ms(v));
// 실패 지연은 정확한 ms 가 정보다 — 30,001 / 60,001 같은 타임아웃 상한값이 그대로 보여야 한다.
const msRaw = (v) => (v == null || Number.isNaN(v) ? '—' : `${Math.round(v).toLocaleString('en-US')}ms`);
const pct = (v) => (v == null || Number.isNaN(v) ? '—' : fmt.pct(v * 100));

const CSS = `
  body{font-family:-apple-system,"Malgun Gothic",Segoe UI,sans-serif;max-width:1180px;margin:24px auto;padding:0 20px;color:#222;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .sub{color:#666;font-size:13px} .q{font-size:15px;background:#f6f6f6;border-left:4px solid #888;padding:8px 12px;margin:12px 0}
  table{border-collapse:collapse;font-size:13px;width:100%;margin:8px 0} th,td{border:1px solid #ddd;padding:4px 8px;text-align:right}
  th:first-child,td:first-child{text-align:left} th{background:#f3f3f3;font-weight:600}
  td.pre{background:#fafafa} td.fault{background:#fff4f4} td.post{background:#f4f8ff}
  .band{display:inline-block;padding:1px 6px;border-radius:3px;font-size:12px}
  .band.pre{background:#eee} .band.fault{background:#f8d7d7} .band.post{background:#d7e6f8}
  ul.expect li{margin:6px 0} .obs{color:#b00000;font-style:italic}
  .warn{color:#b00000} .ok{color:#2a7} .muted{color:#888}
  .chart{margin:10px 0 18px} .chart svg{width:100%;height:140px;display:block;background:#fff;border:1px solid #e5e5e5}
  .chart .t{font-size:12px;color:#444;margin-bottom:2px}
  code{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
`;

/** 시계열 하나를 SVG 폴리라인으로. fault 구간은 음영, 주입 시각은 세로선. */
function chart(title, points, { t0, phases, events, unit = '', yMax = null }) {
  const W = 1100; const H = 140; const L = 48; const R = 8; const T = 8; const B = 18;
  const total = phases.preSec + phases.faultSec + phases.postSec;
  const x = (tSec) => L + (Math.max(0, Math.min(total, tSec)) / total) * (W - L - R);
  const vals = points.map((p) => p.v).filter((v) => Number.isFinite(v));
  const max = yMax != null ? yMax : (vals.length ? Math.max(...vals) : 1) || 1;
  const y = (v) => T + (1 - Math.max(0, Math.min(max, v)) / max) * (H - T - B);
  const rel = (p) => (p.t * 1000 - t0.getTime()) / 1000;
  const path = points
    .filter((p) => Number.isFinite(p.v))
    .map((p, i) => `${i ? 'L' : 'M'}${x(rel(p)).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const fx0 = x(phases.preSec); const fx1 = x(phases.preSec + phases.faultSec);
  const lines = (events || []).filter((e) => e.kind === 'inject' && e.ok)
    .map((e) => `<line x1="${x(e.actualAtSec).toFixed(1)}" y1="${T}" x2="${x(e.actualAtSec).toFixed(1)}" y2="${H - B}" stroke="#b00000" stroke-width="1" stroke-dasharray="3 3"/>`)
    .join('');
  const ticks = [0, phases.preSec, phases.preSec + phases.faultSec, total]
    .map((t) => `<text x="${x(t).toFixed(1)}" y="${H - 4}" font-size="10" fill="#666" text-anchor="middle">${t}s</text>`).join('');
  return `<div class="chart"><div class="t">${esc(title)} <span class="muted">(max ${n(max, 1)}${esc(unit)}${points.length ? '' : ' · 시계열 없음'})</span></div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <rect x="${fx0.toFixed(1)}" y="${T}" width="${(fx1 - fx0).toFixed(1)}" height="${H - T - B}" fill="#fbe9e9"/>
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#ccc"/>
    <text x="4" y="${T + 10}" font-size="10" fill="#666">${n(max, 1)}</text>
    <text x="4" y="${H - B}" font-size="10" fill="#666">0</text>
    ${lines}
    <path d="${path}" fill="none" stroke="#2456a4" stroke-width="1.4"/>
    ${ticks}
  </svg></div>`;
}

function phaseTable(k6Phases, dropped) {
  const rows = PHASE_ORDER.filter((p) => k6Phases[p]).map((p) => {
    const s = k6Phases[p];
    return `<tr><td><span class="band ${p}">${p}</span></td><td>${n(s.durationSec, 0)}s</td><td>${n(s.httpReqs, 0)}</td><td>${n(s.rps, 2)}</td>
      <td>${ms(s.med)}</td><td>${ms(s.p95)}</td><td>${ms(s.p99)}</td><td>${msRaw(s.max)}</td><td class="${s.errorRate > 0.01 ? 'warn' : ''}">${pct(s.errorRate)}</td><td>${n(s.tps, 2)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>구간</th><th>길이</th><th>요청</th><th>RPS</th><th>p50</th><th>p95</th><th>p99</th><th>max</th><th>오류율</th><th>TPS</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">dropped_iterations (도착률을 못 지킨 횟수, 전체): <b>${n(dropped, 0)}</b> — 0 이 아니면 장애 중 VU 가 모자라 부하가 계획보다 적게 걸렸다는 뜻이다. maxVUs 를 올리거나 그 자체를 관측으로 기록한다.</div>`;
}

function failedLatencyTable(fl) {
  const rows = PHASE_ORDER.filter((p) => fl[p]).map((p) => {
    const s = fl[p];
    return `<tr><td><span class="band ${p}">${p}</span></td><td>${n(s.count, 0)}</td><td>${msRaw(s.med)}</td><td>${msRaw(s.p90)}</td><td>${msRaw(s.p95)}</td><td>${msRaw(s.max)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>구간</th><th>실패 응답 수</th><th>p50</th><th>p90</th><th>p95</th><th>max</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">실패 응답만의 지연. 30,000ms 근처에 몰리면 HikariCP 획득 타임아웃(기본 30초), 60,000ms 근처면 Lettuce 명령 타임아웃 또는 k6 요청 타임아웃(둘 다 기본 60초)이다. 즉시 실패(수 ms)와 구분하는 것이 "실패 지연" 보장의 핵심이다.</div>`;
}

function featureTable(fb) {
  const feats = Object.keys(fb);
  const rows = feats.map((f) => {
    const cells = PHASE_ORDER.map((p) => {
      const c = fb[f][p] || {};
      return `<td class="${p}">${n(c.count, 0)}</td><td class="${p}">${ms(c.p95)}</td><td class="${p} ${c.errorRate > 0.01 ? 'warn' : ''}">${pct(c.errorRate)}</td>`;
    }).join('');
    return `<tr><td>${esc(f)}</td>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr><th rowspan="2">기능</th><th colspan="3">pre</th><th colspan="3">fault</th><th colspan="3">post</th></tr>
  <tr><th>요청</th><th>p95</th><th>오류율</th><th>요청</th><th>p95</th><th>오류율</th><th>요청</th><th>p95</th><th>오류율</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">장애 의존성을 <b>쓰지 않는</b> 기능(예: Redis 장애 때 school·timetable·friend)의 fault 열이 나빠지면 폭발 반경이 의존성 경계를 넘은 것이다 — 스레드·커넥션 같은 공유 자원이 경로다.</div>`;
}

function infraTable(infra, groupIds) {
  const phases = PHASE_ORDER.filter((p) => infra[p]);
  if (!phases.length) return '<p class="muted">인프라 지표 없음</p>';
  const first = infra[phases[0]];
  const groups = (first.groups || []).filter((g) => groupIds.includes(g.id));
  const sections = groups.map((g) => {
    const rows = g.metrics.map((m, i) => {
      const cells = phases.map((p) => {
        const gm = (infra[p].groups || []).find((x) => x.id === g.id);
        const v = gm && gm.metrics[i] ? gm.metrics[i].value : null;
        return `<td class="${p}">${v == null ? '—' : esc(fmt.byUnit(v, m.unit))}</td>`;
      }).join('');
      return `<tr><td title="${esc(m.desc || '')}">${esc(m.label)}</td>${cells}</tr>`;
    }).join('');
    return `<h3 style="font-size:14px;margin:14px 0 4px">${esc(g.label)}</h3><table><thead><tr><th>지표</th>${phases.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
  const errs = phases.flatMap((p) => (infra[p].errors || []).map((e) => `${p}: ${e.key || ''} ${e.error || e.reason || ''}`));
  return sections + (errs.length ? `<details><summary class="sub">수집 실패·결측 ${errs.length}건</summary><pre style="font-size:11px">${esc(errs.join('\n'))}</pre></details>` : '');
}

function healthTable(transitions, samples) {
  if (!samples || !samples.length) return '<p class="muted">헬스 표본 없음</p>';
  const rows = transitions.map((s) => `<tr><td>${s.tSec == null ? '—' : `${s.tSec}s`}</td><td class="${s.status === 'UP' ? 'ok' : 'warn'}">${esc(String(s.status))}</td><td>${s.httpStatus == null ? '—' : s.httpStatus}</td><td>${esc(s.components ? Object.entries(s.components).map(([k, v]) => `${k}=${v}`).join(' ') : (s.error || ''))}</td></tr>`).join('');
  return `<table><thead><tr><th>t</th><th>status</th><th>HTTP</th><th>components / error</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">표본 ${samples.length}건 중 상태가 바뀐 지점만. 앱이 응답 중인데 DOWN(503)이면 로드밸런서가 멀쩡한 인스턴스를 뺀다 — 부분 저하가 전면 장애로 승격되는 경로다.</div>`;
}

function eventsTable(events) {
  const rows = events.filter((e) => e.kind === 'inject').map((e) => `<tr><td>${e.plannedAtSec}s</td><td>${e.actualAtSec}s</td><td>${esc(e.tool)} ${esc(e.action || '')}</td><td>${esc(e.target || '')}</td><td class="${e.ok ? 'ok' : 'warn'}">${e.ok ? '✓' : `✗ ${esc(e.error || '')}`}</td><td>${n(e.durationMs, 0)}ms</td></tr>`).join('');
  const others = events.filter((e) => e.kind !== 'inject').map((e) => `<li class="sub"><b>${esc(e.kind)}</b> ${esc(e.at)} — ${esc(e.message || (e.actions || []).join(', ') || '')}${e.reason ? ` (${esc(e.reason)})` : ''}</li>`).join('');
  return `<table><thead><tr><th>계획</th><th>실제</th><th>도구·동작</th><th>대상</th><th>결과</th><th>소요</th></tr></thead><tbody>${rows}</tbody></table>${others ? `<ul>${others}</ul>` : ''}`;
}

function renderReport(rec, { siblings = [] } = {}) {
  const plan = rec.plan;
  const t0 = new Date(rec.t0);
  const s = rec.series || {};
  const ev = rec.events || [];
  const charts = [
    chart('k6 RPS', s.rps || [], { t0, phases: plan.phases, events: ev, unit: '/s' }),
    chart('k6 오류율 (%)', s.errorPct || [], { t0, phases: plan.phases, events: ev, unit: '%', yMax: 100 }),
    chart('k6 p95 (ms)', s.p95 || [], { t0, phases: plan.phases, events: ev, unit: 'ms' }),
    chart('Tomcat busy threads', s.tomcatBusy || [], { t0, phases: plan.phases, events: ev, unit: '', yMax: rec.env && rec.env.tomcatMax ? rec.env.tomcatMax : null }),
    chart('HikariCP pending (커넥션 대기 스레드)', s.hikariPending || [], { t0, phases: plan.phases, events: ev, unit: '' }),
    chart('HikariCP active', s.hikariActive || [], { t0, phases: plan.phases, events: ev, unit: '', yMax: rec.env && rec.env.hikariMax ? rec.env.hikariMax : null }),
    chart('MySQL threads_running', s.mysqlThreadsRunning || [], { t0, phases: plan.phases, events: ev, unit: '' }),
  ].join('');

  const expect = (plan.expect || []).map((e) => `<li>${esc(e)}<br><span class="obs">관측: (실행 뒤 채운다)</span></li>`).join('');
  const sib = siblings.length
    ? `<ul>${siblings.map((x) => `<li><a href="../${esc(x.id)}/report.html">${esc(x.id)}</a> <span class="sub">${esc(x.startedAt || '')} ${x.note ? `· ${esc(x.note)}` : ''}</span></li>`).join('')}</ul><div class="sub">링크만 둔다. 두 실행의 수치를 나란히 놓는 것은 사람이 한다 — 자동 비교·판정은 이 도구의 범위 밖이다.</div>`
    : '<p class="muted">같은 계획으로 돌린 다른 실행 없음</p>';

  const envRows = Object.entries(rec.env || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:left">${esc(v == null ? '—' : String(v))}</td></tr>`).join('');
  const warn = [];
  if (rec.env && rec.env.viaProxy === false && (plan.requires || {}).proxy) warn.push('이 계획은 toxiproxy 가 필요한데 앱이 프록시를 거치지 않는다 — toxic 이 앱에 닿지 않았다. docker-compose.fault.yml 오버레이로 다시 올릴 것.');
  if (rec.t0Source !== 'k6-setup') warn.push(`t0 기준이 ${esc(rec.t0Source || '?')} 다 — 주입 시각이 몇 초 어긋날 수 있다.`);
  const failedInj = ev.filter((e) => e.kind === 'inject' && !e.ok);
  if (failedInj.length) warn.push(`주입 ${failedInj.length}건이 실패했다 — 이 실행은 계획한 장애를 만들지 못했을 수 있다.`);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(rec.id)} — 장애 관측</title><style>${CSS}</style></head><body>
<h1>${esc(plan.id)} <span class="sub">${esc(rec.id)}</span></h1>
<div class="sub">${esc(rec.startedAt)} → ${esc(rec.endedAt)} · 도착률 ${plan.load.rate}/s · pre ${plan.phases.preSec}s / fault ${plan.phases.faultSec}s / post ${plan.phases.postSec}s${rec.note ? ` · ${esc(rec.note)}` : ''}</div>
<div class="q">${esc(plan.question)}</div>
${warn.length ? `<div class="warn"><b>주의</b><ul>${warn.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}

<h2>1. 가설과 관측</h2>
<ul class="expect">${expect}</ul>
<div class="sub">판정은 없다. 가설이 맞았는지 틀렸는지, 무엇을 고칠지는 아래 표를 보고 사람이 적는다. 기준은 다른 실행이 아니라 <b>이 실행의 pre 구간</b>이다.</div>

<h2>2. 시간축</h2>
<div class="sub">빨간 음영 = fault 구간(계획), 빨간 점선 = 실제 주입 시각. 시계열은 Prometheus 5초 step (k6 remote-write · Actuator · mysqld-exporter).</div>
${charts}

<h2>3. 구간별 요약 (k6)</h2>
${phaseTable(rec.k6.phases || {}, rec.k6.droppedIterations)}

<h2>4. 실패 응답의 지연 분포</h2>
${failedLatencyTable(rec.k6.failedLatency || {})}

<h2>5. 폭발 반경 — 기능 × 구간</h2>
${featureTable(rec.k6.featureByPhase || {})}

<h2>6. 인프라 지표 — 구간별</h2>
${infraTable(rec.infra || {}, ['pool', 'cpu', 'mysql', 'redis', 'k6ts'])}

<h2>7. 헬스체크 전이 (${esc(rec.healthUrl || '')})</h2>
${healthTable(rec.healthTransitions || [], rec.health || [])}

<h2>8. 주입 기록</h2>
${eventsTable(ev)}

<div class="grid">
<div><h2>9. 환경</h2><table><tbody>${envRows}</tbody></table></div>
<div><h2>10. 같은 계획의 다른 실행</h2>${sib}</div>
</div>

<h2>11. 원자료</h2>
<ul class="sub"><li><code>run.json</code> — 이 보고서의 전부</li><li><code>k6.json</code> — k6 요약 원본 (phase 이름은 warmup/measure/rampdown 그대로)</li>${rec.grafana && rec.grafana.dashboard ? `<li><a href="${esc(rec.grafana.dashboard)}">Grafana 대시보드 (실행 구간)</a></li>` : ''}</ul>
</body></html>`;
}

module.exports = { renderReport, chart };
