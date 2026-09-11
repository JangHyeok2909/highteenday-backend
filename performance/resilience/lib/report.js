/**
 * 관측 보고서 — 판정이 없다.
 *
 * 보여 주는 것
 *   0. 맨 위 요약 그리드 — 리포트를 열자마자 볼 값만. 아래 절들의 요약이지 별도 계산이 아니다
 *   1. 질문·계획·가설(expect) — 가설 옆에 "관측:" 빈칸. 채우는 것은 사람이다
 *   2. 주입한 장애: 계획 명세(toxic 종류·강도·속성)와 실제 실행 기록을 나란히
 *   3. 시간축: RPS·오류율·p95·스레드·풀 위에 주입 시각 세로선과 fault 구간 음영
 *   4. 회복과 탐지: 지표별 회복 시간과 헬스체크 탐지·해제 지연 (`lib/recovery.js`)
 *   5. 구간 × 전체 표: 요청 수, p50/p95/p99/max, 오류율, dropped iterations, check 통과율
 *   6. 데이터 정확성: 불변식 대조 — 실패하지 않은 요청의 결과가 맞았는가 (`lib/invariants.js`)
 *   7. 실패 응답의 지연 분포 — 즉시 실패인가 30초/60초 뒤 실패인가
 *   8. 실패의 종류: 클라이언트가 받은 상태 코드, 서버가 기록한 응답, JVM 스레드 상태
 *   9. 폭발 반경: 기능 × 구간 의 오류율·p95
 *  10. 자원 사용 구간별 — 한계 대비 포화도 표를 펼치고, 지표 원자료 165개는 그룹마다 접어서
 *  11. 헬스체크 전이 — DOWN·무응답·연결 실패를 구분하고, 헬스 응답 지연도 함께
 *  12. 무엇을 쟀는가 — 커밋·앱 이미지·부하 스크립트 지문
 *  13. 어떤 조건에서 쟀는가 — 부하 프로파일·데이터셋·연결 경로
 *  14. 실패 지연을 만드는 설정 — 타임아웃·풀 크기와 그 출처
 *  15. 같은 계획으로 돌린 다른 실행 — 링크만. 비교 수치는 만들지 않는다
 *
 * 4 는 3 의 그래프를 눈으로 읽던 것을 규칙으로 고정한 것이다. 새로 수집하는 자료가 없어
 * 지난 실행에도 그대로 적용된다. 규칙과 그 한계는 `lib/recovery.js` 머리말에.
 *
 * 6 은 나머지 절과 재료가 다르다. 오류율·지연은 부하 발생기와 Prometheus 에서 오지만,
 * 정확성은 실행 도중 DB 를 직접 읽어 둔 표본에서 온다(`lib/integrity.js`). 판단만 여기서
 * 하고 표본은 `run.json` 에 원자료로 남는다 — 그 순간에 뜨지 않으면 복원할 수 없다.
 *
 * 왜 12~14 가 필요한가: 관측값만 남기면 몇 주 뒤에 "그래서 이게 어떤 코드의, 어떤 설정에서
 * 나온 숫자인가"에 답할 수 없다. 특히 이 실험의 결론인 **실패 지연**은 장애가 아니라
 * 타임아웃 설정이 정하는 값이라, 설정이 기록에 없으면 두 실행을 비교할 근거가 사라진다.
 *
 * 왜 PASS/FAIL 이 없는가: resilience/README.md.
 */
'use strict';

const fmt = require('../../tools/lib/format');
const { PHASE_ORDER, healthCause } = require('./plan');
const recovery = require('./recovery');
const invariants = require('./invariants');

const esc = fmt.escapeHtml;
const n = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : fmt.num(v, d));
const ms = (v) => (v == null || Number.isNaN(v) ? '—' : fmt.ms(v));
// 실패 지연은 정확한 ms 가 정보다 — 30,001 / 60,001 같은 타임아웃 상한값이 그대로 보여야 한다.
const msRaw = (v) => (v == null || Number.isNaN(v) ? '—' : `${Math.round(v).toLocaleString('en-US')}ms`);
const pct = (v) => (v == null || Number.isNaN(v) ? '—' : fmt.pct(v * 100));
const txt = (v) => (v == null || v === '' ? '—' : esc(String(v)));
// 지문은 `sha256:` 접두사가 붙어 오기도 한다. 앞 12자만 보여 줄 때 접두사가 자리를 다 먹는다.
const shortHash = (v, len = 12) => esc(String(v).replace(/^sha256:/, '').slice(0, len));

const CSS = `
  body{font-family:-apple-system,"Malgun Gothic",Segoe UI,sans-serif;max-width:1180px;margin:24px auto;padding:0 20px;color:#222;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:32px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .sub{color:#666;font-size:13px} .q{font-size:15px;background:#f6f6f6;border-left:4px solid #888;padding:8px 12px;margin:12px 0}
  table{border-collapse:collapse;font-size:13px;width:100%;margin:8px 0} th,td{border:1px solid #ddd;padding:4px 8px;text-align:right}
  th:first-child,td:first-child{text-align:left} th{background:#f3f3f3;font-weight:600}
  td.pre{background:#fafafa} td.fault{background:#fff4f4} td.post{background:#f4f8ff}
  td.l,th.l{text-align:left}
  .band{display:inline-block;padding:1px 6px;border-radius:3px;font-size:12px}
  .band.pre{background:#eee} .band.fault{background:#f8d7d7} .band.post{background:#d7e6f8}
  ul.expect li{margin:6px 0} .obs{color:#b00000;font-style:italic}
  .warn{color:#b00000} .ok{color:#2a7} .muted{color:#888}
  .assumed{color:#a06000;background:#fff8e8}
  .chart{margin:10px 0 18px;position:relative} .chart svg{width:100%;height:140px;display:block;background:#fff;border:1px solid #e5e5e5}
  .chart .t{font-size:12px;color:#444;margin-bottom:2px}
  .chart .tip{display:none;position:absolute;pointer-events:none;background:#222;color:#fff;font-size:11px;line-height:1.4;
    padding:4px 7px;border-radius:3px;white-space:nowrap;z-index:2;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .chart .tip b{font-size:13px}
  code{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-size:12px}
  pre.spec{background:#fafafa;border:1px solid #e5e5e5;padding:6px 8px;margin:4px 0;font-size:11px;overflow-x:auto}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0 8px}
  .kpi{border:1px solid #ddd;border-radius:8px;padding:10px 12px;background:#fff}
  .kpi .k{font-size:11px;color:#666;letter-spacing:.02em}
  .kpi .v{font-size:22px;font-weight:650;margin-top:2px;line-height:1.15}
  .kpi .f{font-size:11.5px;color:#666;margin-top:4px;line-height:1.35}
  .kpi.bad{border-color:#dfb0b0;background:#fff7f7} .kpi.bad .v{color:#b00000}
  .kpi.soft{border-color:#e3d3a6;background:#fffdf4} .kpi.soft .v{color:#a06000}
  .kpi.none{background:#fafafa} .kpi.none .v{color:#888;font-size:18px}
  .meter{display:flex;align-items:center;gap:7px;min-width:112px}
  .meter .track{flex:1;height:7px;background:#ececec;border-radius:4px;overflow:hidden;min-width:44px}
  .meter .fill{height:100%;border-radius:4px;background:#7aa7d8}
  .meter .pct{font-size:11.5px;min-width:36px;text-align:right;color:#555;font-variant-numeric:tabular-nums}
  .fill.w{background:#e0a458} .fill.s{background:#d97b4a} .fill.c{background:#c0392b}
  td.sat{width:150px}
`;

/**
 * 로그 축의 위아래 눈금을 10의 거듭제곱으로 잡는다.
 *
 * 최솟값이 눈금과 거의 같으면 한 자릿수를 더 내린다. 그러지 않으면 그 표본이 축 바닥에
 * 붙어, 0 을 바닥으로 보내는 처리와 겹쳐 "값이 없었다"처럼 보인다.
 *
 * @param {number[]} pos 양수 표본만 담긴 배열 (비어 있으면 안 된다)
 * @returns {{lo: number, hi: number, loExp: number, hiExp: number}}
 */
function logDomain(pos) {
  const min = Math.min(...pos);
  let loExp = Math.floor(Math.log10(min));
  if (Math.pow(10, loExp) >= min * 0.999) loExp -= 1;
  const hiExp = Math.max(loExp + 1, Math.ceil(Math.log10(Math.max(...pos))));
  return { lo: Math.pow(10, loExp), hi: Math.pow(10, hiExp), loExp, hiExp };
}

/** 10의 거듭제곱 눈금 라벨. 축 너비(48px)를 넘기지 않도록 1,000 이상은 k·M 로 줄인다. */
function decadeLabel(v) {
  if (v >= 1e6) return `${v / 1e6}M`;
  if (v >= 1e3) return `${v / 1e3}k`;
  if (v >= 1) return String(v);
  return String(Number(v.toPrecision(2)));
}

/**
 * 시계열 하나를 SVG 폴리라인으로. fault 구간은 음영, 주입 시각은 세로선.
 *
 * `logScale` 은 지연처럼 **자릿수가 갈리는** 지표에만 쓴다. 선형 축은 상한을 최댓값에
 * 맞추므로, 60초 타임아웃 한 점이 섞이면 평소의 수십 ms 가 축 바닥에 눌려 0 처럼 보인다.
 * 로그 축에서는 0(과 음수)이 축 바닥으로 가는데, 바닥 눈금 `lo` 는 관측 최솟값보다 한
 * 자릿수 아래라 실제 표본과 겹치지 않는다.
 *
 * 정확한 값은 축에서 읽지 않는다. 각 점의 좌표·시각·값을 `data-pts` 로 함께 실어
 * 마우스를 올리면 그 표본의 원값을 그대로 보여 준다 (스크립트는 {@link CHART_JS}).
 */
function chart(title, points, { t0, phases, events, unit = '', yMax = null, error = null, logScale = false }) {
  const W = 1100; const H = 140; const L = 48; const R = 8; const T = 8; const B = 18;
  const PH = H - T - B;
  const total = phases.preSec + phases.faultSec + phases.postSec;
  const x = (tSec) => L + (Math.max(0, Math.min(total, tSec)) / total) * (W - L - R);
  const pts = points.filter((p) => Number.isFinite(p.v));
  const vals = pts.map((p) => p.v);
  const pos = vals.filter((v) => v > 0);
  const log = logScale && pos.length > 0;
  const max = yMax != null ? yMax : (vals.length ? Math.max(...vals) : 1) || 1;
  const dom = log ? logDomain(pos) : null;
  const y = (v) => {
    if (!log) return T + (1 - Math.max(0, Math.min(max, v)) / max) * PH;
    if (!(v > 0)) return H - B;
    const c = Math.max(dom.lo, Math.min(dom.hi, v));
    return T + (1 - (Math.log10(c) - dom.loExp) / (dom.hiExp - dom.loExp)) * PH;
  };
  const rel = (p) => (p.t * 1000 - t0.getTime()) / 1000;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(rel(p)).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const fx0 = x(phases.preSec); const fx1 = x(phases.preSec + phases.faultSec);
  const lines = (events || []).filter((e) => e.kind === 'inject' && e.ok)
    .map((e) => `<line x1="${x(e.actualAtSec).toFixed(1)}" y1="${T}" x2="${x(e.actualAtSec).toFixed(1)}" y2="${H - B}" stroke="#b00000" stroke-width="1" stroke-dasharray="3 3"/>`)
    .join('');
  const ticks = [0, phases.preSec, phases.preSec + phases.faultSec, total]
    .map((t) => `<text x="${x(t).toFixed(1)}" y="${H - 4}" font-size="10" fill="#666" text-anchor="middle">${t}s</text>`).join('');
  // 로그 축은 눈금이 없으면 읽을 수 없다 — 선의 높이가 몇 배 차이인지 눈으로 셀 수 없기
  // 때문이다. 자릿수가 많으면 라벨이 겹치므로 한 칸씩 건너뛴다.
  const step = log && dom.hiExp - dom.loExp > 6 ? 2 : 1;
  const yAxis = log
    ? Array.from({ length: dom.hiExp - dom.loExp + 1 }, (_, i) => dom.loExp + i)
      .filter((e) => (e - dom.loExp) % step === 0)
      .map((e) => {
        const gy = y(Math.pow(10, e)).toFixed(1);
        return `<line x1="${L}" y1="${gy}" x2="${W - R}" y2="${gy}" stroke="#eee"/>
    <text x="${L - 4}" y="${(Number(gy) + 3).toFixed(1)}" font-size="9" fill="#999" text-anchor="end">${decadeLabel(Math.pow(10, e))}</text>`;
      }).join('')
    : `<text x="4" y="${T + 10}" font-size="10" fill="#666">${n(max, 1)}</text>
    <text x="4" y="${H - B}" font-size="10" fill="#666">0</text>`;
  // 빈 그래프의 이유를 구분한다. "지표가 0이었다"와 "쿼리가 실패했다"를 같은 모양으로
  // 그리면, 수집이 깨진 실행을 정상 관측으로 읽게 된다.
  const scaleNote = log
    ? `로그 축 ${n(dom.lo, 0)}${esc(unit)} ~ ${n(dom.hi, 0)}${esc(unit)} · 최대 ${n(max, 1)}${esc(unit)}`
    : `max ${n(max, 1)}${esc(unit)}`;
  const note = error
    ? `<span class="warn"> · ⚠ 수집 실패: ${esc(error)}</span>`
    : `<span class="muted"> (${scaleNote}${points.length ? '' : ' · 시계열 없음'})</span>`;
  // 각 표본을 [뷰박스 x, 뷰박스 y, t0 이후 초, 원값] 으로 싣는다. 좌표를 여기서 미리
  // 계산해 두면 브라우저 쪽이 축 종류를 몰라도 되고, 로그·선형이 같은 코드로 동작한다.
  const data = pts.map((p) => [
    Number(x(rel(p)).toFixed(1)), Number(y(p.v).toFixed(1)), Math.round(rel(p)), Number(p.v.toPrecision(6)),
  ]);
  return `<div class="chart" data-pts="${esc(JSON.stringify(data))}" data-unit="${esc(unit)}" data-t0="${t0.getTime()}" data-pre="${phases.preSec}" data-fault="${phases.faultSec}"><div class="t">${esc(title)}${note}</div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <rect x="${fx0.toFixed(1)}" y="${T}" width="${(fx1 - fx0).toFixed(1)}" height="${PH}" fill="#fbe9e9"/>
    ${yAxis}
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#ccc"/>
    ${lines}
    <path d="${path}" fill="none" stroke="#2456a4" stroke-width="1.4"/>
    ${ticks}
    <line class="cx" x1="0" y1="${T}" x2="0" y2="${H - B}" stroke="#333" stroke-width="0.7" style="display:none"/>
    <circle class="cd" cx="0" cy="0" r="2.5" fill="#b00000" style="display:none"/>
  </svg><div class="tip"></div></div>`;
}

/**
 * 시간축 그래프의 마우스 오버 판독기.
 *
 * 축은 모양만 보여 준다. 숫자를 읽는 것은 이 스크립트다 — 커서에 가장 가까운 표본을 찾아
 * 원값·경과 초·구간·벽시계 시각을 함께 띄운다. 벽시계는 Grafana 로 넘어가 같은 순간을
 * 찾을 때 쓰라고 붙였다. 스크립트가 막혀도 선과 눈금은 그대로 남는다.
 */
const CHART_JS = `
(function () {
  var PHASES = [['pre', '#555'], ['fault', '#b00000'], ['post', '#2456a4']];
  function fmtVal(v, unit) {
    var a = Math.abs(v);
    var s = a >= 1000 ? Math.round(v).toLocaleString('en-US') : a >= 1 ? v.toFixed(2) : a === 0 ? '0' : v.toPrecision(3);
    return s + unit;
  }
  function kst(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(11, 19) + ' KST'; }
  Array.prototype.forEach.call(document.querySelectorAll('.chart[data-pts]'), function (box) {
    var pts;
    try { pts = JSON.parse(box.getAttribute('data-pts')); } catch (e) { return; }
    if (!pts.length) return;
    var svg = box.querySelector('svg');
    var cx = svg.querySelector('.cx');
    var dot = svg.querySelector('.cd');
    var tip = box.querySelector('.tip');
    var unit = box.getAttribute('data-unit') || '';
    var t0 = Number(box.getAttribute('data-t0'));
    var pre = Number(box.getAttribute('data-pre'));
    var fault = Number(box.getAttribute('data-fault'));
    function show(ev) {
      var r = svg.getBoundingClientRect();
      var vx = (ev.clientX - r.left) / r.width * 1100;
      var best = pts[0], bd = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var d = Math.abs(pts[i][0] - vx);
        if (d < bd) { bd = d; best = pts[i]; }
      }
      var ph = PHASES[best[2] < pre ? 0 : best[2] < pre + fault ? 1 : 2];
      cx.setAttribute('x1', best[0]); cx.setAttribute('x2', best[0]); cx.style.display = '';
      dot.setAttribute('cx', best[0]); dot.setAttribute('cy', best[1]); dot.style.display = '';
      tip.innerHTML = '<b>' + fmtVal(best[3], unit) + '</b><br>+' + best[2] + 's · <span style="color:' + ph[1] + '">' + ph[0] + '</span> · ' + kst(t0 + best[2] * 1000);
      // 툴팁은 .chart 박스 기준으로 놓는다. svg 위에 제목 줄이 있으므로 그 높이만큼
      // 내려야 커서와 눈금이 맞는다.
      var px = best[0] / 1100 * r.width;
      var flip = px > r.width - 160;
      tip.style.left = (flip ? px - 8 : px + 10) + 'px';
      tip.style.transform = flip ? 'translateX(-100%)' : 'none';
      tip.style.top = (r.top - box.getBoundingClientRect().top + Math.max(4, Math.min(92, best[1] - 12))) + 'px';
      tip.style.display = 'block';
    }
    function hide() { tip.style.display = 'none'; cx.style.display = 'none'; dot.style.display = 'none'; }
    svg.addEventListener('mousemove', show);
    svg.addEventListener('mouseleave', hide);
  });
})();
`;

function phaseTable(k6Phases, dropped, load, all) {
  const rows = PHASE_ORDER.filter((p) => k6Phases[p]).map((p) => {
    const s = k6Phases[p];
    return `<tr><td><span class="band ${p}">${p}</span></td><td>${n(s.durationSec, 0)}s</td><td>${n(s.httpReqs, 0)}</td><td>${n(s.rps, 2)}</td>
      <td>${ms(s.med)}</td><td>${ms(s.p95)}</td><td>${ms(s.p99)}</td><td>${msRaw(s.max)}</td><td class="${s.errorRate > 0.01 ? 'warn' : ''}">${pct(s.errorRate)}</td><td>${n(s.tps, 2)}</td></tr>`;
  }).join('');
  // maxVUs 를 같이 적는다 — "maxVUs 를 올려라"라고 조언하면서 현재 값을 안 보여 주면
  // 보고서만 보고는 판단할 수 없다.
  const vus = load ? ` 이 실행의 maxVUs 는 <b>${n(load.maxVus || 1000, 0)}</b>, preVUs 는 <b>${n(load.preVus || 100, 0)}</b> 다.` : '';
  return `<table><thead><tr><th>구간</th><th>길이</th><th>요청</th><th>RPS</th><th>p50</th><th>p95</th><th>p99</th><th>max</th><th>오류율</th><th>TPS</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">dropped_iterations (도착률을 못 지킨 횟수, 전체): <b>${n(dropped, 0)}</b> — 0 이 아니면 장애 중 VU 가 모자라 부하가 계획보다 적게 걸렸다는 뜻이다. maxVUs 를 올리거나 그 자체를 관측으로 기록한다.${vus}</div>
  ${allSummary(all)}`;
}

/**
 * 실행 전체(세 구간 합)의 k6 요약 한 줄.
 *
 * `checks` 는 오류율과 다른 것을 잰다. HTTP 200 이 나와도 응답 본문이 비어 있거나 기대한
 * 필드가 없으면 check 는 실패한다 — 장애 중에는 "에러는 안 나는데 내용이 틀린" 응답이
 * 흔하므로, 오류율만 보면 그 구간을 정상으로 읽게 된다.
 */
function allSummary(all) {
  if (!all) return '';
  const failed = all.checksFailed != null ? all.checksFailed : null;
  const rate = all.checkRate != null ? pct(all.checkRate) : '—';
  const cls = failed ? 'warn' : '';
  return `<div class="sub">전체 — 요청 ${n(all.httpReqs, 0)} · iteration ${n(all.iterations, 0)} · 오류율 ${pct(all.errorRate)} ·
    <span class="${cls}">check 통과율 ${rate} (실패 ${n(failed, 0)}건)</span> · 서버 대기 p95 ${ms(all.waitingP95Ms)} · 최대 VU ${n(all.vusMax, 0)}.
    check 는 상태 코드가 아니라 <b>응답 내용</b>이 기대와 맞는지를 본다 — 오류율 0% 인데 check 가 깨지면 장애 중 잘못된 응답이 나간 것이다.</div>`;
}

/**
 * 실패 응답의 지연 분포. 해설문의 기준선(30초·60초)은 상수가 아니라 **이 실행에 기록된
 * 설정값**에서 만든다. 예전에는 프레임워크 기본값을 본문에 박아 두어, 설정을 바꾼 실행에도
 * 같은 문장이 그대로 나왔다.
 */
function failedLatencyTable(fl, config) {
  const rows = PHASE_ORDER.filter((p) => fl[p]).map((p) => {
    const s = fl[p];
    return `<tr><td><span class="band ${p}">${p}</span></td><td>${n(s.count, 0)}</td><td>${msRaw(s.med)}</td><td>${msRaw(s.p90)}</td><td>${msRaw(s.p95)}</td><td>${msRaw(s.max)}</td></tr>`;
  }).join('');
  const items = (config && config.items) || [];
  const pickKnob = (key) => items.find((i) => i.key === key);
  const line = (key, label) => {
    const k = pickKnob(key);
    if (!k) return null;
    return `${label} <b>${esc(String(k.value))}</b>${k.assumed ? ' <span class="assumed">(설정 없음 → 기본값 가정)</span>' : ''}`;
  };
  const knobs = [
    line('hikari.connectionTimeout', '커넥션 획득'),
    line('jdbc.socketTimeout', 'MySQL 소켓 읽기'),
    line('redis.commandTimeout', 'Redis 명령'),
  ].filter(Boolean);
  const basis = knobs.length
    ? `<div class="sub">이 실행에 적용된 상한 — ${knobs.join(' · ')}. 실패 지연이 이 값 근처에 몰리면 그 타임아웃이 실패 시점을 정한 것이다. 전체 목록은 아래 "실패 지연을 만드는 설정".</div>`
    : '<div class="sub muted">타임아웃 설정이 기록되지 않은 실행이다 — 실패 지연을 어떤 상한과 대조해야 하는지 알 수 없다.</div>';
  return `<table><thead><tr><th>구간</th><th>실패 응답 수</th><th>p50</th><th>p90</th><th>p95</th><th>max</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">실패 응답만의 지연이다. 즉시 실패(수 ms)와 "한참 기다린 뒤 실패"를 구분하는 것이 이 표의 목적이다.</div>${basis}`;
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

/**
 * 인프라 지표를 구간별로. `primaryIds` 는 펼쳐서, 나머지 수집된 그룹은 접어서 보여 준다.
 *
 * 예전에는 pool·cpu·mysql·redis·k6ts 다섯 그룹만 렌더하고 나머지는 버렸다. 그런데
 * `collectInfra` 는 heap·gc·jvm·memory·network 까지 이미 모아 온다 — 의존성이 멈춰 요청이
 * 쌓이면 힙과 GC 가 같이 움직이므로, 그 자료가 run.json 에만 있고 보고서에 없으면 원인을
 * 좁힐 때 매번 JSON 을 직접 열어야 한다. 버리지 말고 접어 둔다.
 */
/**
 * 구간별 인프라 지표 원자료.
 *
 * 그룹을 전부 접어 둔다. 펼쳐 두면 165개 값이 화면을 채워서, 정작 먼저 봐야 할 포화도와
 * 헬스 전이가 스크롤 아래로 밀린다. 병목 후보는 위의 포화도 표가 답하고, 여기는 그 뒤에
 * "그래서 그 안의 어느 값이 움직였나"를 확인하는 자리다.
 *
 * @param {object} infra 구간별 수집 결과.
 * @param {string[]} primaryIds 먼저 보여 줄 그룹 — 접힘 목록에서 앞에 오고 요약에 이름이 붙는다.
 */
function infraTable(infra, primaryIds) {
  const phases = PHASE_ORDER.filter((p) => infra[p]);
  if (!phases.length) return '<p class="muted">인프라 지표 없음</p>';
  const first = infra[phases[0]];
  const all = first.groups || [];
  const groups = all.filter((g) => primaryIds.includes(g.id));
  const rest = all.filter((g) => !primaryIds.includes(g.id));
  const render = (g) => {
    const rows = g.metrics.map((m, i) => {
      const cells = phases.map((p) => {
        const gm = (infra[p].groups || []).find((x) => x.id === g.id);
        const v = gm && gm.metrics[i] ? gm.metrics[i].value : null;
        return `<td class="${p}">${v == null ? '—' : esc(fmt.byUnit(v, m.unit))}</td>`;
      }).join('');
      return `<tr><td title="${esc(m.desc || '')}">${esc(m.label)}</td>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr><th>지표</th>${phases.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  };
  const fold = (g) => `<details><summary class="sub">${esc(g.label)} — 지표 ${g.metrics.length}개</summary>${render(g)}</details>`;
  const ordered = [...groups, ...rest];
  const errs = phases.flatMap((p) => (infra[p].errors || []).map((e) => `${p}: ${e.key || ''} ${e.error || e.reason || ''}`));
  return `<div class="sub">그룹 ${ordered.length}개 · 값 ${ordered.reduce((a, g) => a + g.metrics.length, 0)}개. 필요한 그룹만 펼쳐 본다 — 병목 후보는 위 포화도 표가 먼저 답한다.</div>
    ${ordered.map(fold).join('')}
    ${errs.length ? `<details><summary class="sub warn">수집 실패·결측 ${errs.length}건 — 그 자리의 빈칸은 "0" 이 아니라 "모름"이다</summary><pre style="font-size:11px">${esc(errs.join('\n'))}</pre></details>` : ''}`;
}

/**
 * 헬스 실패의 원인 표시.
 *
 * 2026-09-09 실행에서 `UNREACHABLE` 5건이 전부 폴러의 4초 상한 초과였고 그중 3건은 장애가
 * 끝난 뒤였다. 앱이 죽은 게 아니라 관측 도구가 못 기다린 것인데, 한 가지 빨간 라벨로만
 * 보여서 전면 장애로 읽혔다. 원인을 셋으로 갈라 표시한다.
 */
const HEALTH_CAUSE = {
  up: { text: 'UP', cls: 'ok' },
  down: { text: 'DOWN (앱이 스스로 보고)', cls: 'warn' },
  timeout: { text: '무응답 (폴러 상한 초과)', cls: 'assumed' },
  unreachable: { text: '연결 실패', cls: 'warn' },
};

function healthTable(transitions, samples, byPhase, pollTimeoutMs) {
  if (!samples || !samples.length) return '<p class="muted">헬스 표본 없음</p>';
  const rows = transitions.map((s) => {
    const c = HEALTH_CAUSE[healthCause(s)];
    return `<tr><td>${s.tSec == null ? '—' : `${s.tSec}s`}</td><td class="${c.cls}">${esc(c.text)}</td>
      <td>${s.httpStatus == null ? '—' : s.httpStatus}</td><td>${s.latencyMs == null ? '—' : msRaw(s.latencyMs)}</td>
      <td class="l">${esc(s.components ? Object.entries(s.components).map(([k, v]) => `${k}=${v}`).join(' ') : (s.error || ''))}</td></tr>`;
  }).join('');
  const phases = PHASE_ORDER.filter((p) => byPhase && byPhase[p]);
  const summary = phases.length
    ? `<table><thead><tr><th>구간</th><th>표본</th><th>UP</th><th>DOWN</th><th>무응답</th><th>연결 실패</th><th>응답 p50</th><th>응답 p95</th><th>응답 max</th></tr></thead><tbody>
      ${phases.map((p) => {
    const h = byPhase[p];
    return `<tr><td><span class="band ${p}">${p}</span></td><td>${n(h.count, 0)}</td><td>${n(h.up, 0)}</td>
        <td class="${h.down ? 'warn' : ''}">${n(h.down, 0)}</td><td class="${h.timeout ? 'assumed' : ''}">${n(h.timeout, 0)}</td>
        <td class="${h.unreachable ? 'warn' : ''}">${n(h.unreachable, 0)}</td>
        <td>${msRaw(h.latency.p50)}</td><td>${msRaw(h.latency.p95)}</td><td>${msRaw(h.latency.max)}</td></tr>`;
  }).join('')}</tbody></table>`
    : '';
  const limit = pollTimeoutMs ? `<b>${msRaw(pollTimeoutMs)}</b>` : '폴러 상한';
  return `${summary}<table><thead><tr><th>t</th><th>판정</th><th>HTTP</th><th>응답 지연</th><th class="l">components / error</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">아래 표는 표본 ${samples.length}건 중 상태가 바뀐 지점만. 세 가지를 구분해 읽는다.
  <b>DOWN</b> 은 앱이 응답하면서 스스로 죽었다고 말한 것이다 — 앱은 살아 있는데 로드밸런서가 인스턴스를 뺀다.
  <span class="assumed">무응답</span> 은 앱 장애의 증거가 아니라 <b>관측 도구가 ${limit} 안에 응답을 못 받은 것</b>이다.
  <b>연결 실패</b> 만이 프로세스·포트 수준의 실패다.
  응답 지연 자체도 관측 대상이다 — 로드밸런서 헬스체크 상한(보통 2~5초)을 넘기면 앱이 정상이어도 인스턴스가 빠진다.</div>`;
}

/**
 * 회복 상태 다섯 가지의 표시. 숫자가 나오는 것은 `recovered` 하나뿐이고, 나머지 넷은
 * 서로 다른 이유로 숫자가 없다 — 넷을 한 라벨로 뭉개면 "0초 만에 회복"과 "못 쟀다"가
 * 같아 보인다. 의미는 `lib/recovery.js` 머리말에.
 */
const RECOVERY_STATUS = {
  recovered: { text: '회복', cls: 'ok' },
  'not-recovered': { text: '미회복', cls: 'warn' },
  unproven: { text: '확인 불가', cls: 'assumed' },
  'no-impact': { text: '영향 없음', cls: 'muted' },
  'no-data': { text: '자료 없음', cls: 'muted' },
};

/** 지표 값 하나를 그 지표의 자릿수·단위로 적는다. */
function metricVal(v, m) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${fmt.num(v, m.digits)}${m.unit}`;
}

/**
 * 회복 시간표 — "장애를 걷은 뒤 언제 평시 대역으로 돌아왔나".
 *
 * 대역·최악값을 같이 싣는 이유는 회복 시간이 **대역을 어떻게 잡았느냐에 따라 달라지는 값**
 * 이기 때문이다. 숫자만 적으면 두 실행의 값을 비교할 때 규칙이 같았는지 확인할 수 없다.
 */
function recoveryTable(analysis) {
  const rows = analysis.metrics.map((m) => {
    const st = RECOVERY_STATUS[m.status] || { text: m.status, cls: '' };
    let when = '—';
    let note = '';
    if (m.status === 'recovered') {
      when = `<b>+${n(m.recoverySec, 1)}s</b>`;
      note = `실행 시작 기준 ${n(m.recoveredAtSec, 0)}s 에 대역 복귀, 이후 ${n(analysis.rules.holdSec, 0)}초 유지`;
    } else if (m.status === 'not-recovered') {
      note = `실행이 끝날 때(${n(m.lastSec, 0)}s)까지 대역 밖 — 마지막 값 ${metricVal(m.lastValue, m)}`;
    } else if (m.status === 'unproven') {
      note = `${n(m.enteredAtSec, 0)}s 에 대역으로 들어왔지만 유지 구간이 ${n(m.shortBySec, 0)}초 모자라다 — post 를 늘려야 잴 수 있다`;
    } else if (m.status === 'no-impact') {
      note = '장애 시작부터 실행 끝까지 대역을 벗어난 적이 없다 — 회복할 것이 없다';
    } else {
      note = m.reason || '';
    }
    if (m.smoothedSec) note += `${note ? ' · ' : ''}<span class="assumed">이동창 ${m.smoothedSec}초 포함</span>`;
    return `<tr><td>${esc(m.label)}</td><td class="${st.cls}">${esc(st.text)}</td><td>${when}</td>
      <td>${metricVal(m.base, m)}</td><td>${m.direction === 'lower' ? '≥' : '≤'} ${metricVal(m.limit, m)}</td>
      <td class="${m.status === 'no-impact' ? '' : 'warn'}">${metricVal(m.worst, m)}</td><td class="l sub">${note}</td></tr>`;
  }).join('');
  if (!rows) return '<p class="muted">회복을 잴 시계열이 없다 — 이 실행은 시간축 수집에 실패했다.</p>';
  return `<table><thead><tr><th>지표</th><th>상태</th><th>회복까지</th><th>pre 기준</th><th>정상 대역</th><th>장애 후 최악</th><th class="l">읽는 법</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub"><b>규칙.</b> pre 기준은 pre 구간 표본의 중앙값이다(앞 ${n(analysis.rules.warmupSkipSec, 0)}초는 웜업이라 뺀다).
  정상 대역은 <code>기준 × 배수</code> 와 <code>기준 ± 고정폭</code> 중 <b>느슨한 쪽</b>이다 — 기준이 0 에 가까운 지표(Hikari pending, 오류율)에서 곱셈만 쓰면 잡음 하나가 미회복이 된다.
  회복 시각은 <b>장애 제거 이후</b> 대역 안으로 들어와 ${n(analysis.rules.holdSec, 0)}초 연속 머문 첫 표본이고, 회복까지는 그 시각에서 장애 제거 시각을 뺀 값이다.
  잠깐 정상으로 보였다가 다시 튀는 구간(복구 직후 빈 캐시 스탬피드)을 회복으로 읽지 않으려고 유지 조건을 둔다.</div>
  <div class="sub">⚠ <span class="assumed">이동창 30초 포함</span> 이 붙은 지표는 30초 이동창에서 계산된다 — 장애 중 표본이 창에서 빠질 때까지 값이 안 내려오므로,
  <b>실제 회복은 표의 값보다 최대 30초 빠르다</b>. 창을 쓰지 않는 게이지(Tomcat busy · Hikari pending · MySQL threads_running)에는 이 지연이 없다.
  이 표는 판정이 아니라 그래프를 읽는 규칙을 고정한 것이다 — 규칙이 같아야 고치기 전과 후의 값을 비교할 수 있다.</div>`;
}

/**
 * 탐지 지연 — "장애가 시작되고 나서 관측이 알아채기까지".
 *
 * 알람 규칙이 아직 없는 이 저장소에서 MTTD 를 대신할 수 있는 유일한 값이다. 앞단(ALB)이
 * 인스턴스를 빼거나 되돌리는 판단도 같은 신호를 쓰므로, 해제 지연은 곧 "고장난 인스턴스가
 * 다시 트래픽을 받기까지"의 하한이다.
 */
function detectionTable(analysis) {
  const d = analysis.detection;
  if (!d || d.status === 'no-data') return `<p class="muted">헬스 표본이 없어 탐지 지연을 잴 수 없다.</p>`;
  const res = d.resolutionSec ? `${n(d.resolutionSec, 1)}초` : '알 수 없음';
  const startLabel = `${esc(d.faultStart.label)}${d.faultStart.source === 'plan' ? ' <span class="assumed">(실제 주입 기록이 없어 계획 시각을 썼다)</span>' : ''}`;
  const endLabel = `${esc(d.faultEnd.label)}${d.faultEnd.source === 'plan' ? ' <span class="assumed">(실제 기록 없음)</span>' : ''}`;
  if (d.status === 'undetected') {
    return `<table><thead><tr><th>구분</th><th class="l">기준 시각</th><th class="l">관측</th><th>지연</th></tr></thead><tbody>
      <tr><td>탐지</td><td class="l">${startLabel}</td><td class="l warn">장애 구간 내내 헬스가 UP 이었다 (표본 ${n(d.checkedSamples, 0)}건)</td><td class="warn">미탐지</td></tr>
      </tbody></table>
      <div class="sub warn">이 장애는 <b>헬스체크로는 알아챌 수 없다</b>. 사용자는 영향을 받는데 앞단은 인스턴스를 정상으로 보고, 알람도 울리지 않는다는 뜻이다.</div>`;
  }
  const cause = HEALTH_CAUSE[d.cause] || { text: d.cause, cls: '' };
  const comps = d.downComponents && d.downComponents.length ? ` · 죽었다고 보고한 컴포넌트: <b>${esc(d.downComponents.join(', '))}</b>` : '';
  const bound = d.lastGoodBeforeSec != null
    ? `직전 정상 표본이 ${n(d.lastGoodBeforeSec, 1)}s 지점이라, 실제 탐지 시각은 그 사이 어딘가다.`
    : `장애 시작 전 정상 표본이 없어 하한을 모른다.`;
  return `<table><thead><tr><th>구분</th><th class="l">기준 시각</th><th class="l">관측</th><th>지연</th></tr></thead><tbody>
    <tr><td>탐지</td><td class="l">${startLabel}</td><td class="l"><span class="${cause.cls}">${esc(cause.text)}</span>${d.httpStatus != null ? ` · HTTP ${d.httpStatus}` : ''}${comps}</td><td><b>+${n(d.lagSec, 1)}s</b></td></tr>
    <tr><td>해제</td><td class="l">${endLabel}</td><td class="l">${d.clearLagSec == null ? '<span class="warn">실행이 끝날 때까지 UP 으로 돌아오지 않았다</span>' : `다시 UP · 장애 제거 뒤 비정상 표본 ${n(d.badAfterEnd, 0)}건`}</td><td>${d.clearLagSec == null ? '<span class="warn">미복귀</span>' : `<b>+${n(d.clearLagSec, 1)}s</b>`}</td></tr>
    </tbody></table>
    <div class="sub"><b>읽는 법.</b> 폴러가 ${res} 간격으로 찍으므로 실제 시각은 측정값에서 한 간격 안쪽에 있다. ${bound}
    지연은 요청을 <b>보낸 때</b>가 아니라 <b>끝난 때</b>까지로 잰다 — 무응답을 알아채는 시점은 상한까지 기다린 뒤이기 때문이다.
    <span class="assumed">무응답</span> 은 앱이 죽었다는 증거가 아니라 폴러가 상한 안에 답을 못 받은 것이다(11번 절).
    해제 지연은 앞단이 인스턴스를 다시 넣기까지의 하한이다 — 앱 지표가 먼저 돌아와도 헬스가 늦으면 그만큼 트래픽이 안 들어온다.</div>`;
}

/**
 * 포화도 막대. 한계 대비 사용량이라 환경이 바뀌어도 그대로 비교된다 — 병목 판단의 1차 기준.
 * 색 경계(70/85/95)는 성능 리포트(`tools/lib/report.js meter`)와 같은 값을 쓴다.
 */
function meter(pctVal) {
  if (pctVal == null || !Number.isFinite(Number(pctVal))) return '<span class="muted">—</span>';
  const p = Math.max(0, Math.min(100, Number(pctVal)));
  const cls = p >= 95 ? 'c' : p >= 85 ? 's' : p >= 70 ? 'w' : '';
  return `<div class="meter"><div class="track"><div class="fill ${cls}" style="width:${p.toFixed(1)}%"></div></div><span class="pct">${p.toFixed(0)}%</span></div>`;
}

function kpi(label, value, foot, cls) {
  return `<div class="kpi ${cls || ''}"><div class="k">${esc(label)}</div><div class="v">${value}</div>${foot ? `<div class="f">${foot}</div>` : ''}</div>`;
}

/** 한계 대비 사용량을 구간별로 볼 항목. 키는 `tools/lib/saturation.js` 가 만든 이름이다. */
const SAT_ROWS = [
  { label: 'CPU', key: 'saturation.cpuPct', limit: (f) => `${n(f['cpu.cores.max'], 2)} / ${n(f['cpu.limitCores'], 1)} core` },
  { label: '메모리', key: 'saturation.memoryPct', limit: (f) => `${fmt.bytes(f['memory.workingSet.max'])} / ${fmt.bytes(f['memory.limitBytes'])}` },
  { label: 'JVM Heap', key: 'saturation.heapPct', limit: (f) => `${fmt.bytes(f['heap.used.max'])} / ${fmt.bytes(f['heap.maxBytes'])}` },
  { label: 'HikariCP', key: 'saturation.hikariPct', limit: (f) => `${n(f['pool.hikariActive.max'], 0)} / ${n(f['pool.hikariMax'], 0)}` },
  { label: 'Tomcat 스레드', key: 'saturation.tomcatPct', limit: (f) => `${n(f['pool.tomcatBusy.max'], 0)} / ${n(f['pool.tomcatMax'], 0)}` },
  { label: 'MySQL 커넥션', key: 'saturation.mysqlConnPct', limit: (f) => `${n(f['mysql.threadsConnected.max'], 0)} / ${n(f['mysql.maxConnections'], 0)}` },
  { label: 'Redis 메모리', key: 'saturation.redisMemPct', limit: (f) => `${fmt.bytes(f['redis.memoryUsed.max'])} / ${fmt.bytes(f['redis.memoryMax'])}` },
];

/**
 * 자원 포화도 — 구간 × 리소스.
 *
 * 성능 리포트는 measure 구간 하나만 보여 주지만, 장애 실험에서는 **pre 대비 fault** 가 곧
 * 답이다. 같은 표에 세 구간을 나란히 두면 "장애가 어느 자원을 밀어 올렸나"가 한 줄로 읽힌다.
 */
function saturationTable(infra) {
  const phases = PHASE_ORDER.filter((p) => infra[p] && infra[p].flat);
  if (!phases.length) return '<p class="muted">자원 지표 없음</p>';
  const rows = SAT_ROWS.map((r) => {
    const cells = phases.map((p) => `<td class="sat ${p}">${meter(infra[p].flat[r.key])}</td>`).join('');
    // 한계값은 fault 구간 기준으로 적는다 — 최댓값이 나오는 구간이라 대조가 가장 쉽다.
    const ref = infra.fault || infra[phases[phases.length - 1]];
    return `<tr><td>${esc(r.label)}</td>${cells}<td class="sub">${esc(r.limit(ref.flat))}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>자원</th>${phases.map((p) => `<th>${p}</th>`).join('')}<th class="l">fault 구간 최대 / 한계</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">각 구간의 <b>최댓값</b>이다. 70%를 넘으면 주황, 85%는 진주황, 95%는 빨강이다.
  절대값과 달리 한계 대비 비율이라 환경이 바뀌어도 그대로 비교된다 — 어디가 먼저 찼는지 보는 1차 기준으로 쓴다.</div>`;
}

/**
 * 맨 위 요약 — 리포트를 열자마자 볼 값만.
 *
 * 고르는 기준은 "이 값 하나가 다르면 결론이 바뀌는가"다. 증상(오류율·지연·실패 지연),
 * 회복(회복 시간·탐지 지연), 정확성(데이터 유실), 원인(최대 포화)을 한 줄씩 고른다.
 * 자세한 내용은 각 절에 있고, 여기 값은 그 절의 요약이지 별도 계산이 아니다.
 */
function kpiGrid(rec, analysis) {
  const ph = rec.k6.phases || {};
  const pre = ph.pre || {};
  const fault = ph.fault || {};
  const tiles = [];

  // 증상 — 장애 구간이 pre 대비 얼마나 나빠졌는가.
  const errBad = fault.errorRate > 0.01;
  tiles.push(kpi('장애 중 오류율', pct(fault.errorRate), `pre ${pct(pre.errorRate)}`, errBad ? 'bad' : ''));
  const p95Bad = pre.p95 != null && fault.p95 != null && fault.p95 > pre.p95 * 3;
  // 타임아웃 상한(30,001 · 60,001)이 그대로 보여야 원인이 읽힌다 — 분 단위로 접지 않는다.
  // 타임아웃 상한(30,001 · 60,001)이 그대로 보여야 원인이 읽힌다 — 분 단위로 접지 않는다.
  tiles.push(kpi('장애 중 p95', msRaw(fault.p95), `pre ${msRaw(pre.p95)}`, p95Bad ? 'bad' : ''));

  const fl = (rec.k6.failedLatency || {}).fault;
  if (fl && fl.count) {
    tiles.push(kpi('실패까지 걸린 시간', msRaw(fl.med), `실패 ${n(fl.count, 0)}건 · 최대 ${msRaw(fl.max)}<br>즉시 실패인가, 기다렸다 실패인가`, fl.med > 5000 ? 'bad' : ''));
  } else {
    tiles.push(kpi('실패까지 걸린 시간', '—', '장애 구간에 실패한 요청이 없다', 'none'));
  }

  // 회복 — 이동창 없는 게이지만 쓴다. 오류율·p95 는 창 때문에 최대 30초 늦게 나온다.
  if (analysis) {
    const gauges = analysis.metrics.filter((m) => !m.smoothedSec);
    const stuck = gauges.filter((m) => m.status === 'not-recovered');
    const done = gauges.filter((m) => m.status === 'recovered');
    if (stuck.length) tiles.push(kpi('회복', '미회복', `${esc(stuck.map((m) => m.label).join(' · '))}<br>실행이 끝날 때까지 pre 대역 밖`, 'bad'));
    else if (done.length) {
      const slowest = done.reduce((a, b) => (b.recoverySec > a.recoverySec ? b : a));
      tiles.push(kpi('회복까지', `+${n(slowest.recoverySec, 1)}s`, `가장 늦은 것: ${esc(slowest.label)}<br>이동창 없는 지표 기준`, ''));
    } else tiles.push(kpi('회복까지', '—', '장애가 게이지를 밀어 올리지 않았다', 'none'));

    const d = analysis.detection || {};
    if (d.status === 'detected') {
      const cause = HEALTH_CAUSE[d.cause] || { text: d.cause };
      tiles.push(kpi('탐지 지연', `+${n(d.lagSec, 1)}s`, `헬스가 ${esc(cause.text)} 로 알아챘다${d.clearLagSec != null ? `<br>해제 +${n(d.clearLagSec, 1)}s` : ''}`, d.lagSec > 30 ? 'soft' : ''));
    } else if (d.status === 'undetected') {
      tiles.push(kpi('탐지 지연', '미탐지', '헬스가 장애 내내 UP 이었다', 'bad'));
    } else tiles.push(kpi('탐지 지연', '—', '헬스 표본 없음', 'none'));
  }

  // 정확성 — 오류율이 0 이어도 여기가 깨질 수 있다.
  const ig = rec.integrity;
  if (ig && ig.probes && ig.probes.length) {
    const results = invariants.reconcile(ig.probes, ig.samples || [], { k6: rec.k6, env: rec.env });
    const hits = results.flatMap((r) => r.segments.flatMap((s) => (s.checks || []).filter((c) => c.status === 'loss' || c.status === 'mismatch').map((c) => ({ r, s, c }))));
    const unknowns = results.flatMap((r) => r.segments.filter((s) => s.status === 'unknown'));
    if (hits.length) {
      const worst = hits[0];
      const amount = worst.c.status === 'loss' ? `${n(-worst.c.delta, 0)}건` : `${worst.c.delta > 0 ? '+' : ''}${n(worst.c.delta, 0)}`;
      tiles.push(kpi('데이터 유실', amount, `${esc(worst.c.name)} · ${esc(worst.r.id)}${hits.length > 1 ? ` 외 ${hits.length - 1}건` : ''}<br>오류율과 무관하게 틀어진 값`, 'bad'));
    } else if (unknowns.length === results.reduce((a, r) => a + r.segments.length, 0)) {
      tiles.push(kpi('데이터 유실', '확인 불가', '표본을 못 떠 판정하지 못했다', 'soft'));
    } else {
      tiles.push(kpi('데이터 유실', '없음', `${esc(ig.probes.join(' · '))} 검사 통과`, ''));
    }
  } else {
    tiles.push(kpi('데이터 유실', '안 쟀다', '계획이 불변식을 고르지 않았다', 'none'));
  }

  // 원인 — 장애 구간에 가장 먼저 찬 자원.
  const fInfra = (rec.infra || {}).fault;
  if (fInfra && fInfra.flat) {
    const top = SAT_ROWS
      .map((r) => ({ label: r.label, v: fInfra.flat[r.key] }))
      .filter((x) => Number.isFinite(x.v))
      .sort((a, b) => b.v - a.v)[0];
    if (top) tiles.push(kpi('장애 중 최대 포화', `${n(top.v, 0)}%`, `${esc(top.label)}<br>한계 대비 사용량`, top.v >= 95 ? 'bad' : top.v >= 70 ? 'soft' : ''));
  }

  const dropped = rec.k6.droppedIterations;
  if (dropped) tiles.push(kpi('못 보낸 요청', n(dropped, 0), 'VU 가 모자라 도착률을 못 지킨 횟수<br>부하가 계획보다 적게 걸렸다', 'soft'));

  return `<div class="kpis">${tiles.join('')}</div>
  <div class="sub">여기 값은 아래 각 절의 요약이다 — 판정이 아니라 어디부터 볼지를 정하는 용도다.
  회복·탐지는 4번, 데이터 정확성은 6번, 자원 포화도는 10번 절에 근거가 있다.</div>`;
}

const INTEGRITY_STATUS = {
  ok: { text: '정합', cls: 'ok' },
  mismatch: { text: '불일치', cls: 'warn' },
  // 유실은 하한만 아는 값이라 불일치와 라벨을 나눈다 — "최소 N건"과 "N건 틀렸다"는 다르다.
  loss: { text: '유실', cls: 'warn' },
  unknown: { text: '확인 불가', cls: 'assumed' },
  idle: { text: '변화 없음', cls: 'muted' },
};

/**
 * 불변식 대조표 — "오류율은 멀쩡한데 데이터도 맞았나".
 *
 * 표본은 저장된 원자료를 그대로 쓰고, 등식은 렌더링 시점에 계산한다. 규칙을 고치면
 * `render-report.js` 로 지난 실행까지 같은 규칙으로 다시 읽힌다(회복 절과 같은 이유).
 */
function integrityTable(rec) {
  const ig = rec.integrity;
  if (!ig || !Array.isArray(ig.probes) || !ig.probes.length) {
    return `<p class="muted">이 계획은 불변식을 고르지 않았다 — 계획 파일의 <code>integrity.probes</code> 에 이름을 넣으면 검사한다
    (있는 것: ${esc(invariants.ids().join(', '))}).</p>`;
  }
  const results = invariants.reconcile(ig.probes, ig.samples || [], { k6: rec.k6, env: rec.env });
  const sampleRows = (ig.samples || []).map((s) => `<tr><td>${esc(s.label)}</td><td>${s.tSec == null ? '—' : `${s.tSec}s`}</td>
    <td class="${s.ok ? 'ok' : 'warn'}">${s.ok ? '채취' : '실패'}</td><td>${msRaw(s.elapsedMs)}</td>
    <td class="l sub">${s.ok ? Object.entries(s.values).map(([k, v]) => `${esc(k)}=${n(v, 0)}`).join(' · ') : esc(s.error || '')}</td></tr>`).join('');

  const blocks = results.map((r) => {
    const rows = r.segments.map((seg) => {
      const st = INTEGRITY_STATUS[seg.status] || { text: seg.status, cls: '' };
      const detail = seg.status === 'unknown'
        ? `<span class="assumed">${esc(seg.reason || '')}</span>`
        : seg.checks.map((c) => {
          // 하한만 아는 검사는 양수 delta 가 정상이다(새로 들어온 몫). 그걸 빨갛게 칠하면
          // 정상 구간이 매번 결함처럼 보인다.
          const bad = c.exact === false ? c.delta < 0 : c.delta !== 0;
          const deltaTag = c.delta ? ` <span class="${bad ? 'warn' : 'muted'}">(${c.delta > 0 ? '+' : ''}${n(c.delta, 0)})</span>` : '';
          return `${esc(c.name)} <b>${n(c.actual, 0)}</b> / ${n(c.expected, 0)}${c.unit}${deltaTag}${c.note ? `<br><span class="sub">${c.note}</span>` : ''}`;
        }).join('<br>');
      const cls = seg.key === 'run' ? '' : seg.key;
      return `<tr><td>${cls ? `<span class="band ${cls}">${esc(seg.label)}</span>` : `<b>${esc(seg.label)}</b>`}</td>
        <td class="${st.cls}">${esc(st.text)}</td><td class="l">${detail}</td></tr>`;
    }).join('');
    return `<div class="sub" style="margin-top:10px"><b>${esc(r.id)}</b> — ${esc(r.question)}</div>
      <table><thead><tr><th>구간</th><th>판정</th><th class="l">실제 / 기대 (증가분)</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  return `${blocks}
  <details><summary class="sub">표본 ${(ig.samples || []).length}건 — 언제 무엇을 읽었나</summary>
    <table><thead><tr><th>표본</th><th>t</th><th>결과</th><th>질의 시간</th><th class="l">값</th></tr></thead><tbody>${sampleRows}</tbody></table>
    <div class="sub">S0 는 부하 시작 직전(복원·FLUSHALL 뒤), S1 은 주입 직전, S2 는 제거 직후, S3 는 수집이 끝난 뒤에 뜬다.
    ${ig.drainWaitSec ? `S3 앞에 <b>드레인 ${n(ig.drainWaitSec, 0)}초</b>를 기다렸다 — 비동기로 DB 에 내려가는 값의 마지막 주기가 돌아야 "결국 DB 까지 갔는가"에 답할 수 있다. 덜 기다리면 유실이 <b>과소</b> 보고된다(아직 버퍼에 남은 몫은 사라진 것으로 세지 않는다).` : '고른 프로브가 모두 동기 반영이라 드레인 대기가 없다.'}</div>
  </details>
  <div class="sub">증가분(Δ)으로 본다. 절대값으로 보면 지난 실행이 남긴 기존 드리프트가 섞여 이번 장애가 만든 몫을 가려낼 수 없다.
  <b>불일치는 느린 것이 아니라 틀린 것이다</b> — 오류율·지연이 정상이어도 여기가 깨지면 <code>docs/issues/</code> 에 등록한다.
  <span class="assumed">확인 불가</span> 는 그 구간의 표본을 못 뜬 것이지 정합의 증거가 아니다.</div>
  <div class="sub">⚠ <b>유실</b> 은 조회수 검사에서만 나온다. 식은 <code>올랐어야 할 수 − 실제로 오른 수</code> 이고, 올랐어야 할 수는 <b>부하 발생기가 센다</b> —
  Redis 가 죽으면 조회수 증가가 아예 시도되지 않아 서버 어디에도 흔적이 없기 때문이다. 함께 적히는 <b>불확실</b> 건수는 타임아웃된 요청이다: 서버가 올렸는지 알 수 없다.
  Redis 버퍼는 이 식에 안 들어간다. 끝에 버퍼가 비었는지 <b>확인</b>하는 용도이고, 안 비었으면 숫자를 내지 않는다 — 아직 안 간 것과 사라진 것을 구분할 수 없어서다.</div>`;
}

/**
 * 구간 × 상태 코드 — 실패의 종류.
 *
 * 오류율은 "얼마나 실패했나"만 말한다. 대응을 정하려면 어떻게 실패했는지가 필요하다.
 */
function statusTable(sp) {
  const phases = PHASE_ORDER.filter((p) => sp && sp[p]);
  if (!phases.length) return '<p class="muted">상태 코드 자료 없음 — k6 요약에 status 축이 없다(옛 실행이거나 스크립트가 다르다).</p>';
  const codes = [...new Set(phases.flatMap((p) => Object.keys(sp[p].byStatus || {})))].sort();
  if (!codes.length) {
    return '<p class="muted">지켜본 상태 코드(0·401·429·500·502·503·504)가 한 건도 나오지 않았다 — 모든 응답이 2xx·3xx 였다.</p>';
  }
  const rows = codes.map((code) => {
    const cells = PHASE_ORDER.map((p) => {
      const c = (sp[p] && sp[p].byStatus[code]) || {};
      return `<td class="${p} ${c.count ? 'warn' : ''}">${c.count ? n(c.count, 0) : '—'}</td><td class="${p}">${c.count ? msRaw(c.p95) : '—'}</td>`;
    }).join('');
    return `<tr><td>${esc(code === '0' ? '0 (응답 없음)' : code)}</td>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr><th rowspan="2">상태 코드</th><th colspan="2">pre</th><th colspan="2">fault</th><th colspan="2">post</th></tr>
  <tr><th>건수</th><th>p95</th><th>건수</th><th>p95</th><th>건수</th><th>p95</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sub"><b>0 (응답 없음)</b> 은 연결이 거부됐거나 요청이 타임아웃돼 응답 자체가 없었던 경우다 — 앱이 응답조차 못 했다.
  <b>500</b> 은 앱이 살아서 예외를 응답한 것이고(커넥션 획득 실패 등), <b>503</b> 은 앞단이 인스턴스를 뺐거나 앱이 준비되지 않았다고 답한 것이다.
  셋은 고칠 곳이 다르다. p95 를 같이 보면 그 실패가 즉시 났는지 한참 기다린 뒤 났는지도 갈린다.</div>`;
}

/**
 * 구간 × 앱이 실제로 내보낸 응답 — 서버 쪽에서 본 실패.
 *
 * 위의 상태 코드 표는 **클라이언트(k6)가 받은 것**이고 이 표는 **서버가 기록한 것**이다.
 * 둘의 차이가 정보다 — 클라이언트는 실패를 봤는데 서버 기록에 없으면 그 요청은 앱에
 * 닿지 못했거나 앱이 응답을 끝내지 못한 것이다.
 */
function serverOutcomeTable(fm, statusByPhase) {
  const oc = fm && (fm.outcomes || fm.exceptions);
  const phases = PHASE_ORDER.filter((p) => oc && oc[p]);
  if (!phases.length) return '<p class="muted">서버 응답 기록 없음 — 수집에 실패했거나 옛 실행이다.</p>';
  const keyOf = (i) => `${i.status}|${i.outcome}|${i.exception || ''}`;
  const kinds = [];
  for (const p of phases) {
    for (const i of oc[p].items || []) if (!kinds.some((k) => keyOf(k) === keyOf(i))) kinds.push(i);
  }
  if (!kinds.length) return '<p class="muted">사용자 트래픽에 대한 서버 응답 기록이 없다.</p>';
  const rows = kinds.map((kind) => {
    const cells = PHASE_ORDER.map((p) => {
      const hit = oc[p] && (oc[p].items || []).find((i) => keyOf(i) === keyOf(kind));
      const bad = hit && /ERROR/.test(hit.outcome);
      return `<td class="${p} ${bad ? 'warn' : ''}">${hit ? n(hit.count, 0) : '—'}</td>`;
    }).join('');
    return `<tr><td>${esc(kind.status)} <span class="sub">${esc(kind.outcome)}</span>${kind.exception ? ` · <b>${esc(kind.exception)}</b>` : ''}</td>${cells}</tr>`;
  }).join('');
  // 클라이언트가 본 실패와 서버가 기록한 실패의 차이. 같은 사건을 양쪽에서 센 값이다.
  const gaps = PHASE_ORDER.filter((p) => oc[p] && statusByPhase && statusByPhase[p]).map((p) => {
    const clientNoResponse = (statusByPhase[p].byStatus['0'] || {}).count || 0;
    const clientFailed = statusByPhase[p].total || 0;
    const serverFailed = oc[p].failed || 0;
    if (!clientFailed && !serverFailed) return null;
    return `<li><span class="band ${p}">${p}</span> 클라이언트가 본 실패 <b>${n(clientFailed, 0)}</b>건(그중 응답 없음 ${n(clientNoResponse, 0)}건) · 서버가 기록한 실패 <b>${n(serverFailed, 0)}</b>건</li>`;
  }).filter(Boolean);
  const noException = kinds.every((k) => !k.exception);
  return `<table><thead><tr><th>앱 응답 (status · outcome · 예외)</th>${PHASE_ORDER.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  ${gaps.length ? `<ul class="sub">${gaps.join('')}</ul><div class="sub">두 값이 어긋나는 이유는 둘 중 하나다. 어느 쪽인지는 사람이 정한다.
  <b>① 요청이 서버에 닿지 못했다</b> — 연결이 거부됐거나 앱이 응답을 끝내지 못해 서버 계측이 그 요청을 아예 세지 못한 경우다. 클라이언트의 "응답 없음(status 0)"이 많은데 서버 기록이 적으면 이쪽이다.
  <b>② 구간 경계에서 갈렸다</b> — k6 는 요청을 <b>시작한</b> 시각의 구간에 넣고, 서버 계측은 응답을 <b>끝낸</b> 시각에 센다. 장애 중 수십 초 매달린 요청은 k6 에서는 fault, 서버에서는 post 로 기록된다. post 의 서버 실패 건수가 클라이언트 실패보다 많으면 이쪽을 먼저 의심한다.</div>` : ''}
  <div class="sub">Spring Boot 의 <code>http_server_requests</code> 계측이다. <code>/actuator</code> 는 뺐다 — 헬스 폴러의 200 이 사용자 트래픽을 가린다.
  ${noException ? '<b>예외 열이 비어 있는 것은 정상이다</b>: 이 앱은 도메인 오류를 <code>GlobalExceptionHandler</code> 가 잡아 응답으로 바꾸므로 Micrometer 에는 "처리된 예외"로 남아 라벨이 <code>none</code> 이 된다. 예외 클래스가 여기 뜬다면 그건 <b>핸들러를 거치지 않고 새어 나간</b> 예외라는 뜻이라, 뜨는 것 자체가 신호다.' : '예외 클래스가 붙은 행은 <code>GlobalExceptionHandler</code> 를 거치지 않고 새어 나간 예외다.'}</div>`;
}

/** 구간별 JVM 스레드 상태 — 스레드가 늘어난 것과 막힌 것을 가른다. */
function threadTable(fm) {
  const th = fm && fm.threads;
  const phases = PHASE_ORDER.filter((p) => th && th[p]);
  if (!phases.length) return '';
  const specs = (fm.specs || []).filter((s) => s.key.startsWith('threads.'));
  if (!specs.length) return '';
  const rows = specs.map((spec) => {
    const cells = PHASE_ORDER.map((p) => `<td class="${p}">${th[p] && th[p][spec.key] != null ? n(th[p][spec.key], 0) : '—'}</td>`).join('');
    return `<tr><td title="${esc(spec.desc || '')}">${esc(spec.label)}</td>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr><th>스레드 상태</th>${PHASE_ORDER.map((p) => `<th>${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <div class="sub">Tomcat busy 가 올랐을 때 이 표가 원인을 좁힌다. <b>timed-waiting</b> 이 함께 오르면 상한이 있는 대기(커넥션 획득 타임아웃 등)에 묶인 것이고,
  <b>runnable</b> 이 오르면 응답 없는 소켓에서 read 로 매달린 것이다 — 후자는 상한이 없어 스스로 풀리지 않는다.
  <b>blocked</b> 는 모니터 락 경합이다. JVM 전체 스레드가 대상이라 Tomcat 워커 외의 스레드도 포함된다.</div>`;
}

/**
 * 주입한 장애 — 계획 명세와 실제 실행을 한 표에.
 *
 * 예전에는 도구·동작·대상만 찍었다. 그러면 `mysql-hang`(응답 없음)과 `mysql-slow`(지연
 * 추가)의 보고서가 둘 다 "toxiproxy add / mysql" 한 줄로 똑같이 보인다. 어떤 장애였는지가
 * 보고서 어디에도 없는 셈이라, toxic 의 종류·강도·속성을 계획에서 그대로 꺼내 보여 준다.
 * `detail` 은 도구가 돌려준 실제 응답이다 — 계획대로 걸렸는지의 직접 증거다.
 */
function injectTable(plan, events) {
  const steps = (plan.inject || []).map((s, i) => ({ ...s, index: i }));
  const injects = events.filter((e) => e.kind === 'inject');
  const rows = injects.map((e) => {
    const step = steps.find((s) => s.index === e.index) || {};
    const spec = specOf(step);
    const drift = e.plannedAtSec != null && e.actualAtSec != null ? e.actualAtSec - e.plannedAtSec : null;
    return `<tr>
      <td>${e.plannedAtSec == null ? '—' : `${e.plannedAtSec}s`}</td>
      <td>${e.actualAtSec == null ? '—' : `${e.actualAtSec}s`}${drift ? ` <span class="sub">(${drift > 0 ? '+' : ''}${n(drift, 1)}s)</span>` : ''}</td>
      <td class="l">${esc(e.tool)} ${esc(e.action || '')}</td>
      <td class="l">${txt(e.target)}</td>
      <td class="l">${spec}</td>
      <td class="${e.ok ? 'ok' : 'warn'}">${e.ok ? '✓' : `✗ ${esc(e.error || '')}`}</td>
      <td>${n(e.durationMs, 0)}ms</td>
    </tr>`;
  }).join('');
  // 실행되지 않은 계획 단계 — 드라이버가 예약 전에 죽었거나 k6 가 일찍 끝난 경우다.
  const fired = new Set(injects.map((e) => e.index));
  const missed = steps.filter((s) => !fired.has(s.index))
    .map((s) => `<tr class="warn"><td>${txt(s.at)}</td><td>실행 안 됨</td><td class="l">${esc(s.tool)} ${esc(s.action || '')}</td><td class="l">${txt(s.proxy || s.container)}</td><td class="l">${specOf(s)}</td><td class="warn">✗</td><td>—</td></tr>`)
    .join('');
  const others = events.filter((e) => e.kind !== 'inject')
    .map((e) => `<li class="sub"><b>${esc(e.kind)}</b> ${esc(e.at)} — ${esc(e.message || (e.actions || []).join(', ') || '')}${e.reason ? ` (${esc(e.reason)})` : ''}</li>`).join('');
  const details = injects.filter((e) => e.detail != null)
    .map((e) => `<pre class="spec">[${e.actualAtSec}s] ${esc(e.tool)} ${esc(e.action || '')} ${esc(e.target || '')} → ${esc(JSON.stringify(e.detail))}</pre>`).join('');
  return `<table><thead><tr><th>계획</th><th>실제</th><th class="l">도구·동작</th><th class="l">대상</th><th class="l">명세</th><th>결과</th><th>소요</th></tr></thead>
  <tbody>${rows}${missed}</tbody></table>
  <div class="sub">"명세"는 계획 파일에 적힌 장애의 내용이다 — 같은 <code>toxiproxy add</code> 라도 <code>timeout(0)</code>은 응답 없음, <code>latency(500ms)</code>는 느려짐으로 결과가 전혀 다르다. 아래 블록은 도구가 실제로 돌려준 응답이다.</div>
  ${details}${others ? `<ul>${others}</ul>` : ''}`;
}

/** 주입 단계 하나를 사람이 읽는 한 줄 명세로. 도구마다 결정적인 필드가 다르다. */
function specOf(step) {
  if (!step || !step.tool) return '—';
  if (step.tool === 'toxiproxy') {
    if (step.action === 'add' && step.toxic) {
      const t = step.toxic;
      const attrs = Object.entries(t.attributes || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      return `<code>${esc(t.type)}</code> ${esc(t.stream || 'downstream')} · toxicity ${n(t.toxicity != null ? t.toxicity : 1, 2)}${attrs ? ` · ${esc(attrs)}` : ''} <span class="sub">(이름 ${esc(t.name || '?')})</span>`;
    }
    if (step.action === 'remove') return `toxic <code>${esc(step.toxicName || '?')}</code> 제거`;
    return `프록시 ${step.action === 'enable' ? '복구(enable)' : '차단(disable)'}`;
  }
  if (step.tool === 'docker') return `컨테이너 <code>${esc(step.action || '?')}</code>${step.signal ? ` · signal ${esc(step.signal)}` : ''}${step.graceSec != null ? ` · grace ${step.graceSec}s` : ''}`;
  if (step.tool === 'pumba') return `<code>pumba ${esc((step.args || []).join(' '))}</code>`;
  if (step.tool === 'shell') return `<code>${esc((step.argv || []).join(' '))}</code>`;
  return '—';
}

/** `key: value` 두 칸짜리 표. 값은 이미 이스케이프된 HTML 조각을 받는다. */
function kvTable(rows) {
  const body = rows.filter(Boolean).map(([k, v, note]) => `<tr><td>${esc(k)}</td><td class="l">${v}</td>${note === undefined ? '' : `<td class="l sub">${note}</td>`}</tr>`).join('');
  return `<table><tbody>${body}</tbody></table>`;
}

/** 앱 이미지 한 줄 — tools/lib/appimage.js 의 probe() 결과를 사람이 읽는 형태로. */
function formatAppImage(img) {
  if (!img) return '<span class="warn">미기록 — 이 실행은 "무엇을 쟀는지" 모르는 기록이다</span>';
  if (typeof img === 'string') return `${esc(img)} <span class="sub">(옛 형식 — 빌드 시각·최신 여부 없음)</span>`;
  if (!img.available) return `<span class="warn">확인 실패: ${esc(img.reason || '미조회')}</span>`;
  const short = String(img.imageId).replace(/^sha256:/, '').slice(0, 12);
  const built = img.imageCreated ? esc(fmt.localTime(img.imageCreated)) : '빌드 시각 불명';
  const ref = img.imageRef ? `${esc(img.imageRef)} ` : '';
  let state = ' · <span class="muted">소스 대비 최신 여부 판정 불가</span>';
  if (img.stale === true) {
    const days = (img.staleBySec / 86400).toFixed(1);
    state = ` · <span class="warn">⚠ 소스가 이미지보다 ${days}일 새것 — 옛 코드를 잰 실행일 수 있다</span>`;
  } else if (img.stale === false) {
    state = ' · <span class="ok">소스와 일치</span>';
  }
  return `${ref}<code>${esc(short)}</code> · 빌드 ${built}${state}`;
}

/** 9. 무엇을 쟀는가 — 코드·바이너리·부하 스크립트의 신원. */
function provenanceTable(rec) {
  const run = rec.run || {};
  const dirty = typeof run.commit === 'string' && run.commit.endsWith('+dirty');
  const commitCell = run.commit
    ? `<code>${esc(run.commit.replace(/\+dirty$/, '').slice(0, 12))}</code>${dirty ? ' <span class="warn">+dirty (커밋되지 않은 변경이 있는 상태로 실행)</span>' : ''}`
    : '<span class="warn">미기록</span>';
  return kvTable([
    ['브랜치', txt(run.branch)],
    ['커밋 (실행 시점 작업 트리 HEAD)', commitCell, '컨테이너 안의 코드와 직접 연결되지 않는다 — 아래 앱 이미지가 실제 측정 대상이다'],
    ['앱 이미지 (실제 측정 대상)', formatAppImage(rec.appImage), rec.appImage && rec.appImage.labelCommit ? `이미지에 구운 커밋 ${shortHash(rec.appImage.labelCommit)}` : '이미지에 커밋 라벨 없음'],
    ['부하 스크립트 지문', run.scriptVersion ? `<code>${shortHash(run.scriptVersion, 16)}</code>` : '<span class="warn">미기록</span>', '진입 스크립트와 트래픽 형태를 정하는 공용 모듈의 해시. 값이 다르면 부하의 성격이 다르다'],
    ['k6', txt(rec.env && rec.env.k6Version), txt(rec.env && rec.env.k6Bin)],
    ['실행자 · 빌드', `${txt(run.executor)} · ${txt(run.buildNumber)}`],
  ]);
}

/** 10. 어떤 조건에서 쟀는가 — 부하·데이터·연결 경로. */
function conditionsTable(rec) {
  const run = rec.run || {};
  const env = rec.env || {};
  const plan = rec.plan;
  const profile = rec.k6 && rec.k6.loadProfile;
  // 프록시를 쓰지 않는 계획(docker pause 등)에서 "toxic 이 안 닿는다"는 틀린 경고다.
  const needsProxy = !!((plan.requires || {}).proxy) || (plan.inject || []).some((i) => i.tool === 'toxiproxy');
  const routing = env.viaProxy
    ? '<span class="ok">toxiproxy 경유</span>'
    : (needsProxy
      ? '<span class="warn">직결 — 이 계획의 toxic 이 앱에 닿지 않는다</span>'
      : '직결 <span class="sub">(이 계획은 프록시를 쓰지 않는다)</span>');
  return kvTable([
    ['도착률 · 구간', `${n(plan.load.rate, 2)}/s · pre ${plan.phases.preSec}s / fault ${plan.phases.faultSec}s / post ${plan.phases.postSec}s`],
    ['VU', `preVUs ${n(plan.load.preVus || 100, 0)} · maxVUs ${n(plan.load.maxVus || 1000, 0)}`, 'maxVUs 에 닿으면 도착률을 못 지킨다 — dropped_iterations 와 함께 읽는다'],
    ['데이터셋', `${txt(run.dataset)}${run.datasetFingerprint ? ` <span class="sub">지문 <code>${shortHash(run.datasetFingerprint)}</code></span>` : ' <span class="warn">지문 없음</span>'}`, '이름이 같아도 지문이 다르면 다른 데이터다'],
    ['연결 경로', routing, `DB_URL ${txt(env.dbUrl)} · REDIS_HOST ${txt(env.redisHost)}`],
    ['앱 주소', txt(env.baseUrl)],
    ['실행 전 초기화', `${env.restore ? `스냅샷 ${esc(env.restore)} 복원` : '스냅샷 복원 없음'} · ${env.flushRedis ? 'Redis FLUSHALL 수행' : '<span class="warn">Redis 초기화 없음 (--no-flush-redis)</span>'}${env.cacheState ? ` · 시작 캐시 ${esc(env.cacheState)}${env.cacheKeysBefore != null ? ` (키 ${n(env.cacheKeysBefore, 0)}개)` : ''}` : ''}`, 'Redis 초기화는 기본이다. pre 구간은 캐시가 차오르는 중이고, 끄면 남은 캐시·조회 중복 마커가 기준과 조회수 계산을 흔든다'],
    ['t0 기준', txt(rec.t0Source), 'k6-setup 이 아니면 주입 시각이 몇 초 어긋날 수 있다'],
    ['k6 종료 코드', rec.k6ExitCode === 0 ? '<span class="ok">0</span>' : `<span class="warn">${txt(rec.k6ExitCode)}</span>`, '이 도구는 종료 코드로 성패를 판정하지 않는다. 0 이 아니면 부하가 계획대로 끝나지 않았는지 확인한다'],
    profile ? ['k6 실행 프로파일', `<pre class="spec">${esc(JSON.stringify(profile, null, 1))}</pre>`] : null,
  ]);
}

/** 11. 실패 지연을 만드는 설정 — 값과 출처. 출처가 "기본값"이면 실측이 아니라 가정이다. */
function configTable(config) {
  if (!config || !config.items || !config.items.length) {
    return '<p class="warn">타임아웃·풀 설정이 기록되지 않았다 — 실패 지연 수치를 어떤 상한과 대조해야 하는지 알 수 없다.</p>';
  }
  const rows = config.items.map((i) => `<tr class="${i.assumed ? 'assumed' : ''}">
    <td>${esc(i.label)}</td>
    <td class="l"><b>${esc(String(i.value))}</b></td>
    <td class="l ${i.assumed ? 'assumed' : 'sub'}">${esc(i.source)}</td>
    <td class="l sub">${esc(i.why || '')}</td></tr>`).join('');
  const assumed = config.assumedCount
    ? `<div class="sub"><span class="assumed">노란 줄 ${config.assumedCount}건</span>은 컨테이너·JDBC URL·프로퍼티 파일 어디에도 값이 없어 프레임워크 기본값을 적어 둔 것이다. 실측이 아니라 <b>가정</b>이므로, 이 값을 근거로 결론을 쓰려면 먼저 명시적으로 설정하고 다시 돌리는 편이 낫다.</div>`
    : '<div class="sub">모든 값이 컨테이너·URL·설정 파일에서 실제로 확인된 값이다.</div>';
  return `<table><thead><tr><th>설정</th><th class="l">값</th><th class="l">출처</th><th class="l">관측에서 무엇으로 보이나</th></tr></thead><tbody>${rows}</tbody></table>${assumed}
  <div class="sub">⚠ 출처가 "저장소 파일"인 값은 <b>작업 트리</b>의 파일에서 읽은 것이다. 앱 이미지가 소스보다 낡았다면(위 9번) 실제 적용된 값과 다를 수 있다.</div>`;
}

function renderReport(rec, { siblings = [] } = {}) {
  const plan = rec.plan;
  const t0 = new Date(rec.t0);
  const s = rec.series || {};
  const ev = rec.events || [];
  const run = rec.run || {};
  // 시계열 수집 오류는 `"<축 이름>: <메시지>"` 형태로 모여 온다. 축별로 갈라 그래프 옆에 붙인다.
  const seriesError = {};
  for (const line of rec.seriesErrors || []) {
    const i = String(line).indexOf(':');
    if (i > 0) seriesError[String(line).slice(0, i).trim()] = String(line).slice(i + 1).trim();
  }
  const base = { t0, phases: plan.phases, events: ev };
  // 폴러 표본을 시계열 그래프가 받는 모양({t: 초, v: 값})으로 바꾼다. 무응답 표본은
  // latencyMs 가 상한값이라 그리면 오해를 부르므로 뺀다 — 그 사건은 아래 전이 표가 말한다.
  const healthPoints = (rec.health || [])
    .filter((h) => h.httpStatus != null && Number.isFinite(h.latencyMs))
    .map((h) => ({ t: Date.parse(h.at) / 1000, v: h.latencyMs }));
  // 헬스 "무응답" 판정의 근거가 된 상한. 설정 표에 기록된 값을 그대로 인용한다.
  const pollItem = ((rec.config && rec.config.items) || []).find((i) => i.key === 'health.pollTimeoutMs');
  const pollTimeoutMs = pollItem ? parseInt(String(pollItem.value), 10) : null;
  const charts = [
    chart('k6 RPS', s.rps || [], { ...base, unit: '/s', error: seriesError.rps }),
    chart('k6 오류율 (%)', s.errorPct || [], { ...base, unit: '%', yMax: 100, error: seriesError.errorPct }),
    chart('k6 p95 (ms)', s.p95 || [], { ...base, unit: 'ms', logScale: true, error: seriesError.p95 }),
    chart('Tomcat busy threads', s.tomcatBusy || [], { ...base, unit: '', yMax: rec.env && rec.env.tomcatMax ? rec.env.tomcatMax : null, error: seriesError.tomcatBusy }),
    chart('HikariCP pending (커넥션 대기 스레드)', s.hikariPending || [], { ...base, unit: '', error: seriesError.hikariPending }),
    chart('HikariCP active', s.hikariActive || [], { ...base, unit: '', yMax: rec.env && rec.env.hikariMax ? rec.env.hikariMax : null, error: seriesError.hikariActive }),
    chart('MySQL threads_running', s.mysqlThreadsRunning || [], { ...base, unit: '', error: seriesError.mysqlThreadsRunning }),
    chart('5xx 응답 (건/s)', s.status5xx || [], { ...base, unit: '/s', error: seriesError.status5xx }),
    chart('응답 없음 status=0 (건/s) — 연결 거부·요청 타임아웃', s.statusNoResponse || [], { ...base, unit: '/s', error: seriesError.statusNoResponse }),
    chart('JVM 스레드 waiting + timed-waiting', s.threadsWaiting || [], { ...base, unit: '', error: seriesError.threadsWaiting }),
    chart('JVM 스레드 blocked', s.threadsBlocked || [], { ...base, unit: '', error: seriesError.threadsBlocked }),
    // 헬스 지연은 Prometheus 가 아니라 폴러 표본에서 만든다. 폴러가 잰 값이라야 "무응답"
    // 판정과 같은 자를 쓴다 — 다른 출처로 그리면 표와 그래프가 서로 다른 것을 말한다.
    chart('헬스 응답 지연 (ms) — 폴러 표본', healthPoints, { ...base, unit: 'ms', logScale: true }),
  ].join('');

  const expect = (plan.expect || []).map((e) => `<li>${esc(e)}<br><span class="obs">관측: (실행 뒤 채운다)</span></li>`).join('');

  // 회복·탐지는 저장된 원자료에서 렌더링할 때 계산한다. run.json 에 값을 적어 두지 않는
  // 이유는, 그러면 규칙을 고쳤을 때 옛 실행의 값만 옛 규칙으로 남아 두 실행을 비교할 수
  // 없기 때문이다. 지금 규칙으로 지난 실행까지 다시 읽으려면 render-report.js 만 돌리면 된다.
  const analysis = recovery.analyze(rec);
  const recoverySection = analysis
    ? `${recoveryTable(analysis)}${detectionTable(analysis)}`
    : '<p class="muted">t0 나 구간 정보가 없어 회복·탐지를 계산할 수 없다.</p>';
  const sib = siblings.length
    ? `<ul>${siblings.map((x) => `<li><a href="../${esc(x.id)}/report.html">${esc(x.id)}</a> <span class="sub">${esc(x.startedAt || '')}${x.commitShort ? ` · 커밋 ${esc(x.commitShort)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</span></li>`).join('')}</ul><div class="sub">링크만 둔다. 두 실행의 수치를 나란히 놓는 것은 사람이 한다 — 자동 비교·판정은 이 도구의 범위 밖이다. 다만 커밋이 같은지는 여기서 먼저 확인할 수 있다.</div>`
    : '<p class="muted">같은 계획으로 돌린 다른 실행 없음</p>';

  // 경고는 "이 실행의 수치를 그대로 믿으면 안 되는 이유"만 모은다.
  const warn = [];
  if (rec.env && rec.env.viaProxy === false && (plan.requires || {}).proxy) warn.push('이 계획은 toxiproxy 가 필요한데 앱이 프록시를 거치지 않는다 — toxic 이 앱에 닿지 않았다. docker-compose.fault.yml 오버레이로 다시 올릴 것.');
  if (rec.t0Source !== 'k6-setup') warn.push(`t0 기준이 ${esc(rec.t0Source || '?')} 다 — 주입 시각이 몇 초 어긋날 수 있다.`);
  const failedInj = ev.filter((e) => e.kind === 'inject' && !e.ok);
  if (failedInj.length) warn.push(`주입 ${failedInj.length}건이 실패했다 — 이 실행은 계획한 장애를 만들지 못했을 수 있다.`);
  if (rec.appImage && rec.appImage.available && rec.appImage.stale) {
    warn.push(`앱 이미지가 소스보다 ${(rec.appImage.staleBySec / 86400).toFixed(1)}일 낡았다 — 이 실행은 지금의 코드가 아니라 옛 코드를 쟀을 수 있다. 재빌드: <code>docker compose -f environment/docker-compose.perf.yml -f environment/docker-compose.fault.yml --env-file environment/.env.perf up -d --build app</code>`);
  }
  if (rec.appImage && rec.appImage.available === false) warn.push(`앱 이미지를 확인하지 못했다(${esc(rec.appImage.reason || '')}) — 무엇을 쟀는지 모르는 기록이다.`);
  if (typeof run.commit === 'string' && run.commit.endsWith('+dirty')) warn.push('커밋되지 않은 변경이 있는 작업 트리에서 실행했다 — 커밋 해시만으로 재현되지 않는다.');
  if ((rec.seriesErrors || []).length) warn.push(`시간축 ${rec.seriesErrors.length}개 축의 수집이 실패했다 — 해당 그래프의 빈 구간은 "값이 0"이 아니라 "모르는 상태"다.`);
  if (rec.k6ExitCode != null && rec.k6ExitCode !== 0) warn.push(`k6 가 종료 코드 ${esc(String(rec.k6ExitCode))} 로 끝났다 — 부하가 계획대로 끝나지 않았을 수 있다(이 도구는 종료 코드로 성패를 판정하지 않는다).`);

  const header = [
    `${esc(rec.startedAt)} → ${esc(rec.endedAt)}`,
    `도착률 ${plan.load.rate}/s`,
    `pre ${plan.phases.preSec}s / fault ${plan.phases.faultSec}s / post ${plan.phases.postSec}s`,
    `데이터셋 ${txt(run.dataset)}`,
    `VU ${n(plan.load.preVus || 100, 0)}→${n(plan.load.maxVus || 1000, 0)}`,
    run.commitShort ? `커밋 ${esc(run.commitShort)}` : null,
    rec.note ? esc(rec.note) : null,
  ].filter(Boolean).join(' · ');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(rec.id)} — 장애 관측</title><style>${CSS}</style></head><body>
<h1>${esc(plan.id)} <span class="sub">${esc(rec.id)}</span></h1>
<div class="sub">${header}</div>
<div class="q">${esc(plan.question)}</div>
${warn.length ? `<div class="warn"><b>주의</b><ul>${warn.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
${kpiGrid(rec, analysis)}

<h2>1. 가설과 관측</h2>
<ul class="expect">${expect}</ul>
<div class="sub">판정은 없다. 가설이 맞았는지 틀렸는지, 무엇을 고칠지는 아래 표를 보고 사람이 적는다. 기준은 다른 실행이 아니라 <b>이 실행의 pre 구간</b>이다.</div>

<h2>2. 주입한 장애 — 계획과 실제</h2>
${injectTable(plan, ev)}

<h2>3. 시간축</h2>
<div class="sub">빨간 음영 = fault 구간(계획), 빨간 점선 = 실제 주입 시각. 시계열은 Prometheus 5초 step (k6 remote-write · Actuator · mysqld-exporter).
그래프 위에 마우스를 올리면 그 지점의 표본값·경과 초·구간·벽시계 시각이 나온다. 제목에 "로그 축"이라고 적힌 그래프는 세로가 <b>10배 단위</b>다 — 눈금 한 칸이 열 배이므로 선의 높이차를 배수로 읽어야 한다.</div>
<div class="sub">⚠ RPS·오류율·p95·5xx·무응답은 <b>30초 이동창</b>에서 계산한다. 구간 경계를 넘어도 창 안에 이전 구간의 요청이 남아 있어, 스파이크가 fault 종료 뒤 최대 30초까지 끌린다.
구간별 정확한 수치는 아래 <b>5번 표</b>가 기준이다 — 그래프와 표가 다르면 표를 믿는다. 그래프는 <b>언제·어떤 모양으로</b> 변했는지를 본다.</div>
${charts}

<h2>4. 회복과 탐지 — 언제 돌아왔고, 언제 알아챘나</h2>
${recoverySection}

<h2>5. 구간별 요약 (k6)</h2>
${phaseTable(rec.k6.phases || {}, rec.k6.droppedIterations, plan.load, rec.k6.all)}

<h2>6. 데이터 정확성 — 불변식 대조</h2>
<div class="sub">오류율과 지연은 "얼마나 실패했나"에 답한다. 이 절은 <b>실패하지 않은 요청의 결과가 맞았나</b>에 답한다.
Redis 호출 실패는 <code>ResilientRedisAspect</code> 가 삼키고 기본값을 돌려주므로, 데이터가 사라지는 동안에도 사용자는 HTTP 200 을 받고 오류율은 0 에 가깝다 — 위 표들만 보면 "폴백 정상 동작"으로 읽힌다.</div>
${integrityTable(rec)}

<h2>7. 실패 응답의 지연 분포</h2>
${failedLatencyTable(rec.k6.failedLatency || {}, rec.config)}

<h2>8. 실패의 종류 — 상태 코드·예외·스레드</h2>
<div class="sub">오류율은 "얼마나"만 말한다. 무엇을 고칠지는 실패의 종류에서 나온다. 아래 표들은 같은 실패를 <b>클라이언트가 받은 응답</b>, <b>앱이 던진 예외</b>, <b>스레드가 놓인 상태</b> 세 방향에서 본 것이다.</div>
${statusTable(rec.k6.statusByPhase)}
${serverOutcomeTable(rec.faultMetrics, rec.k6.statusByPhase)}
${threadTable(rec.faultMetrics)}
${(rec.faultMetrics && rec.faultMetrics.errors && rec.faultMetrics.errors.length) ? `<details><summary class="warn">이 절의 수집 실패 ${rec.faultMetrics.errors.length}건 — 빈 칸은 "0" 이 아니라 "모름"이다</summary><pre style="font-size:11px">${esc(rec.faultMetrics.errors.join('\n'))}</pre></details>` : ''}

<h2>9. 폭발 반경 — 기능 × 구간</h2>
${featureTable(rec.k6.featureByPhase || {})}

<h2>10. 자원 사용 — 구간별</h2>
${saturationTable(rec.infra || {})}
<h3 style="font-size:14px;margin:18px 0 4px">지표 원자료</h3>
${infraTable(rec.infra || {}, ['pool', 'cpu', 'mysql', 'redis', 'k6ts'])}

<h2>11. 헬스체크 전이 (${esc(rec.healthUrl || '')})</h2>
${healthTable(rec.healthTransitions || [], rec.health || [], rec.healthByPhase, pollTimeoutMs)}

<h2>12. 무엇을 쟀는가 — 코드 신원</h2>
${provenanceTable(rec)}

<h2>13. 어떤 조건에서 쟀는가</h2>
${conditionsTable(rec)}

<h2>14. 실패 지연을 만드는 설정 — 타임아웃·풀</h2>
${configTable(rec.config)}

<h2>15. 같은 계획의 다른 실행</h2>
${sib}

<h2>16. 원자료</h2>
<ul class="sub"><li><code>run.json</code> — 이 보고서의 전부${rec.planFile ? ` · 계획 원본 <code>${esc(rec.planFile)}</code>` : ''}</li><li><code>k6.json</code> — k6 요약 원본 (phase 이름은 warmup/measure/rampdown 그대로)</li>${rec.grafana && rec.grafana.dashboard ? `<li><a href="${esc(rec.grafana.dashboard)}">Grafana 대시보드 (실행 구간)</a></li>` : ''}</ul>
<script>${CHART_JS}</script>
</body></html>`;
}

module.exports = { renderReport, chart, specOf, formatAppImage, statusTable, serverOutcomeTable, meter, saturationTable };
