/**
 * handleSummary 공통 구현 — 모든 시나리오가 이 함수를 export 해서 쓴다.
 *
 * 실행이 끝나면 reports/raw/ 아래에 3종을 남긴다:
 *   <name>-<ts>.summary.json  전체 메트릭 (regression/compare.js 입력)
 *   <name>-<ts>.summary.csv   핵심 지표 한 줄 요약 (스프레드시트 비교용)
 *   <name>-<ts>.summary.html  단독 열람용 리포트
 *
 * 타임스탬프는 k6가 넘겨주는 state가 아니라 실행 시각 기반이므로
 * 같은 시나리오를 여러 번 돌려도 파일이 덮어써지지 않는다.
 */
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const KEY_METRICS = [
  'http_reqs',
  'http_req_duration',
  'http_req_failed',
  'iterations',
  'vus_max',
  'checks',
];

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function csvLine(name, data) {
  const m = data.metrics;
  const d = (m.http_req_duration && m.http_req_duration.values) || {};
  const f = (m.http_req_failed && m.http_req_failed.values) || {};
  const r = (m.http_reqs && m.http_reqs.values) || {};
  const header =
    'scenario,requests,rps,p50_ms,p90_ms,p95_ms,p99_ms,avg_ms,max_ms,error_rate,vus_max\n';
  const row = [
    name,
    r.count || 0,
    (r.rate || 0).toFixed(2),
    (d['p(50)'] || d.med || 0).toFixed(1),
    (d['p(90)'] || 0).toFixed(1),
    (d['p(95)'] || 0).toFixed(1),
    (d['p(99)'] || 0).toFixed(1),
    (d.avg || 0).toFixed(1),
    (d.max || 0).toFixed(1),
    (f.rate || 0).toFixed(4),
    (m.vus_max && m.vus_max.values.max) || 0,
  ].join(',');
  return header + row + '\n';
}

function html(name, data) {
  const rows = Object.entries(data.metrics)
    .filter(([k]) => KEY_METRICS.includes(k) || k.startsWith('http_req_duration{'))
    .map(([k, v]) => {
      const vals = Object.entries(v.values)
        .map(([vk, vv]) => `<td>${vk}: ${typeof vv === 'number' ? vv.toFixed(2) : vv}</td>`)
        .join('');
      return `<tr><th style="text-align:left">${k}</th>${vals}</tr>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${name} — k6 summary</title>
<style>body{font-family:ui-monospace,monospace;padding:2rem}table{border-collapse:collapse}
td,th{border:1px solid #ccc;padding:4px 10px;font-size:13px}</style>
<h1>${name}</h1><p>generated ${new Date().toISOString()}</p><table>${rows}</table>`;
}

/** name: 시나리오 식별자 (예: 'normal-day') */
export function makeHandleSummary(name) {
  return function (data) {
    const stamp = `${name}-${ts()}`;
    // 출력 경로는 k6 프로세스의 CWD 기준 — 반드시 performance/ 루트에서 실행한다.
    const dir = __ENV.REPORT_DIR || 'reports/raw';
    return {
      stdout: textSummary(data, { indent: ' ', enableColors: true }),
      [`${dir}/${stamp}.summary.json`]: JSON.stringify(data, null, 2),
      [`${dir}/${stamp}.summary.csv`]: csvLine(name, data),
      [`${dir}/${stamp}.summary.html`]: html(name, data),
    };
  };
}
