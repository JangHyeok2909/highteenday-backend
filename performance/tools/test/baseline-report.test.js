'use strict';

/**
 * 기준선 탈락 사유와 기준선의 당시 상태가 **콘솔과 HTML 양쪽에** 사람이 읽을 문장으로
 * 나오는지 검증한다(S-10).
 *
 * 왜 렌더링까지 테스트하는가: 판정 로직이 아무리 정확해도 리포트가 빈 칸을 보여주면
 * 사용자에게는 "이유 없이 비교를 안 했다"와 같다. 실제로 사전 필터로 지워진 후보는
 * rejected 에 남지 않아 리포트가 "이 조건의 첫 실행입니다"라고 말해 왔다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sectionRegression } = require('../lib/report');
const { printConsole } = require('../collect');

const REJECTED = [
  { id: 'run-101', startedAt: '2026-08-01T00:00:00Z', reasonCode: 'unmeasured', mismatches: [], details: { measurementStatus: 'UNMEASURED' } },
  { id: 'run-100', startedAt: '2026-08-02T00:00:00Z', reasonCode: 'window-incomplete', mismatches: [], details: { windowIncomplete: true } },
  {
    id: 'run-099',
    startedAt: '2026-08-03T00:00:00Z',
    reasonCode: 'conditions',
    mismatches: [{ key: 'dataset', label: '데이터셋', materiality: 'blocking', desc: '데이터셋: small → large' }],
    details: {},
  },
];

/** 리포트 렌더링에 필요한 최소 레코드. */
function record(reg) {
  return {
    run: {
      id: 'cur', number: 12, scenario: 'normal-day', environment: 'perf', branch: 'main',
      commitShort: 'abc1234', buildNumber: '42', startedAt: '2026-08-05T00:00:00Z',
      durationSec: 600, dataset: 'large',
      loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 200 }] } },
    },
    k6: { all: { vusMax: 200 }, phases: { measure: { p95: 2200, avg: 900, p99: 3000, rps: 50, tps: 10, errorRate: 0 } } },
    infra: { flat: {}, available: false },
    regression: {
      verdict: 'FAIL', measurementStatus: 'MEASURED', missingRequired: [], missingOptional: [],
      notApplicable: [], comparisons: [], counts: { total: 0, fail: 0, warn: 0, gateFail: 0, skipped: 0, suppressed: 0 },
      hasBaseline: false, baselineStatus: 'first-run', hadPriorCandidates: false,
      rejectedBaselines: [], comparability: null,
      baselineThresholdsPassed: null, baselineVerdict: null,
      ...reg,
    },
    bottleneckHints: [],
  };
}

/** console.log 를 가로채 콘솔 리포트 전문을 문자열로 받는다. */
function captureConsole(rec) {
  const lines = [];
  const original = console.log;
  console.log = (s = '') => lines.push(String(s));
  try {
    printConsole(rec);
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 탈락 사유 — 세 reasonCode 모두 빈 칸 없이 출력된다
// ---------------------------------------------------------------------------
const INCOMPARABLE = {
  hasBaseline: false, baselineStatus: 'incomparable', hadPriorCandidates: true,
  rejectedBaselines: REJECTED,
};

test('HTML: 탈락 사유 세 종류가 모두 문장으로 나온다 (빈 칸 금지)', () => {
  const html = sectionRegression(record(INCOMPARABLE));
  assert.match(html, /run-101/);
  assert.match(html, /필수 지표가 없어/);
  assert.match(html, /measure 구간이 계획보다 짧게 끝나/);
  assert.match(html, /데이터셋: small → large/);
  assert.doesNotMatch(html, /<td><\/td>/, '사유 칸이 비면 조용한 통과와 구분되지 않는다');
});

test('콘솔: 탈락 사유 세 종류가 HTML 과 같은 문장으로 나온다', () => {
  const out = captureConsole(record(INCOMPARABLE));
  assert.match(out, /run-101 — 필수 지표가 없어/);
  assert.match(out, /run-100 — measure 구간이 계획보다 짧게 끝나/);
  assert.match(out, /run-099 — 데이터셋: small → large/);
  assert.doesNotMatch(out, /첫 실행/, '후보가 있었는데 첫 실행이라고 말하면 안 된다');
});

test('HTML/콘솔: first-run 은 과거 후보가 정말 없을 때만 그렇게 말한다', () => {
  const rec = record({ hasBaseline: false, baselineStatus: 'first-run', hadPriorCandidates: false });
  assert.match(sectionRegression(rec), /과거 실행이 하나도 없습니다/);
  assert.match(captureConsole(rec), /첫 실행/);
});

test('HTML: 탈락 후보 id 는 escape 되어 렌더링된다', () => {
  const rec = record({
    ...INCOMPARABLE,
    rejectedBaselines: [{ id: '<script>x</script>', startedAt: 't', reasonCode: 'unmeasured', mismatches: [], details: {} }],
  });
  const html = sectionRegression(rec);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ---------------------------------------------------------------------------
// 기준선의 당시 상태 — threshold 실패 기준선을 쓰면 반드시 경고한다
// ---------------------------------------------------------------------------
const COMPARED_WITH_FAILED_BASELINE = {
  hasBaseline: true, baselineStatus: 'compared', hadPriorCandidates: true,
  baselineRunId: 'slow-before', baselineStartedAt: '2026-08-01T00:00:00Z', baselineCommit: 'deadbee',
  baselineThresholdsPassed: false, baselineVerdict: 'FAIL',
  comparisons: [{
    key: 'k6.phases.measure.p95', label: 'P95', unit: 'ms', gate: true,
    current: 2200, baseline: 3800, deltaAbs: -1600, deltaPct: -42.1, badChangePct: -42.1,
    verdict: 'FAIL', reasons: [{ type: 'absolute', level: 'FAIL', desc: '2200 > 상한 500' }],
    skipped: null, applicable: true, required: true,
  }],
  counts: { total: 1, fail: 1, warn: 0, gateFail: 1, skipped: 0, suppressed: 0 },
  gateFailed: true,
};

test('HTML: 기준선이 당시 k6 threshold 를 실패했으면 경고를 띄운다', () => {
  const html = sectionRegression(record(COMPARED_WITH_FAILED_BASELINE));
  assert.match(html, /당시 k6 threshold를 통과하지 못했다/);
  assert.match(html, /SLO를\s*\n?\s*만족한다는 뜻이 아니다|만족한다는 뜻이 아니다/);
  assert.match(html, /당시 k6 thresholds <b>FAIL<\/b>/);
  assert.match(html, /당시 Node 판정 <b>FAIL<\/b>/);
  assert.doesNotMatch(html, /measure SLO 실패/, 'thresholdsPassed 는 measure SLO 하나가 아니다');
});

test('콘솔: 기준선이 당시 k6 threshold 를 실패했으면 같은 경고를 낸다', () => {
  const out = captureConsole(record(COMPARED_WITH_FAILED_BASELINE));
  assert.match(out, /기준선은 당시 k6 threshold 미통과 실행입니다/);
  assert.match(out, /현재 SLO 통과를 뜻하지 않습니다/);
  assert.match(out, /당시 Node 판정 FAIL/);
});

test('HTML: 기준선 상태를 알 수 없는(과거 레코드) 경우 경고 대신 "알 수 없음"으로 표시', () => {
  const html = sectionRegression(record({
    ...COMPARED_WITH_FAILED_BASELINE,
    baselineThresholdsPassed: null, baselineVerdict: null,
  }));
  assert.doesNotMatch(html, /통과하지 못했다/);
  assert.match(html, /당시 k6 thresholds <b>알 수 없음<\/b>/);
});

test('HTML: 기준선이 당시 통과한 실행이면 경고를 띄우지 않는다', () => {
  const html = sectionRegression(record({
    ...COMPARED_WITH_FAILED_BASELINE,
    baselineThresholdsPassed: true, baselineVerdict: 'PASS',
  }));
  assert.doesNotMatch(html, /통과하지 못했다/);
  assert.match(html, /당시 k6 thresholds <b>PASS<\/b>/);
});
