/**
 * Grafana Deep Link 생성기.
 *
 * 왜 이게 중요한가
 * ----------------
 * 보고서에서 이상 징후를 발견한 사람이 다음에 하는 행동은 항상 같다 — "그 시간대 그래프를 보고 싶다".
 * 이때 Grafana를 열고 대시보드를 찾고 시간 범위를 손으로 맞추는 3단계가 끼면, 대부분은
 * 그냥 안 본다. 링크 한 번으로 **정확히 그 테스트 구간**이 열려야 분석이 실제로 일어난다.
 *
 * 시간 범위에 패딩을 주는 이유: 테스트 구간만 딱 자르면 "부하가 걸리기 직전 상태"가 안 보인다.
 * 힙이 원래 높았는지, 이번 부하로 올라간 건지 구분하려면 앞뒤 여유가 필요하다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE = process.env.GRAFANA_URL || 'http://localhost:3001';
const DASHBOARD_FILE = path.join(__dirname, '..', '..', 'metrics', 'dashboards', 'perf-overview.json');

/** 대시보드 정의에서 uid/slug/패널목록을 읽는다 — 하드코딩하면 대시보드 수정 시 링크가 깨진다. */
function loadDashboard(file = DASHBOARD_FILE) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      uid: d.uid,
      title: d.title,
      slug: String(d.title || 'dashboard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      panels: (d.panels || []).map((p) => ({ id: p.id, title: p.title })),
    };
  } catch (e) {
    return { uid: 'htd-perf-overview', title: 'Performance Overview', slug: 'performance-overview', panels: [] };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.startedAt ISO
 * @param {string} opts.endedAt   ISO
 * @param {number} opts.padSec    앞뒤 여유(초). 기본 120.
 */
function buildLinks(opts = {}) {
  const dash = loadDashboard(opts.dashboardFile);
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const pad = (opts.padSec != null ? opts.padSec : 120) * 1000;

  const start = new Date(opts.startedAt).getTime();
  const end = new Date(opts.endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { dashboard: null, panels: [], uid: dash.uid, from: null, to: null };
  }

  const from = start - pad;
  const to = end + pad;
  const root = `${base}/d/${dash.uid}/${dash.slug}`;
  const q = `from=${from}&to=${to}`;

  // 패널 제목으로 관심 지표를 찾는다. 제목이 바뀌어도 링크가 사라질 뿐 깨지지는 않는다.
  const findPanel = (re) => (dash.panels.find((p) => re.test(p.title || '')) || {}).id;

  const named = [
    { key: 'latency', label: '지연 P50/P95/P99', id: findPanel(/latency/i) },
    { key: 'rps', label: 'RPS', id: findPanel(/rps|요청 처리율/i) },
    { key: 'errors', label: '오류율 / VU', id: findPanel(/error|오류/i) },
    { key: 'heap', label: 'JVM Heap', id: findPanel(/heap/i) },
    { key: 'gc', label: 'GC Pause', id: findPanel(/gc/i) },
    { key: 'hikari', label: 'HikariCP', id: findPanel(/hikari/i) },
    { key: 'tomcat', label: 'Tomcat Threads', id: findPanel(/tomcat/i) },
    { key: 'mysql', label: 'MySQL', id: findPanel(/mysql/i) },
    { key: 'redis', label: 'Redis', id: findPanel(/redis/i) },
    { key: 'cpu', label: '컨테이너 CPU', id: findPanel(/cpu/i) },
  ].filter((p) => p.id != null);

  return {
    uid: dash.uid,
    title: dash.title,
    from,
    to,
    dashboard: `${root}?${q}`,
    // kiosk 모드 — 캡처해서 문서/슬랙에 붙일 때 크롬 UI 없이 그래프만 나온다.
    kiosk: `${root}?${q}&kiosk`,
    panels: named.map((p) => ({
      ...p,
      url: `${root}?${q}&viewPanel=${p.id}`,
    })),
  };
}

module.exports = { buildLinks, loadDashboard };
