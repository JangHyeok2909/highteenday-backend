#!/usr/bin/env node
/**
 * 회귀 비교기 — k6 summary JSON을 baseline과 비교해 회귀를 판정한다.
 *
 * 사용법:
 *   node tools/compare.js --save-baseline reports/raw/normal-day-XXX.summary.json
 *       → regression/baseline.json 갱신 (개선 확정 시에만 수동 실행)
 *
 *   node tools/compare.js reports/raw/normal-day-XXX.summary.json
 *       → baseline과 비교, thresholds.json 기준 초과 시 exit 1 (CI 실패)
 *
 * 판정 기준은 regression/thresholds.json 에서 읽는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REG_DIR = path.join(__dirname, '..', 'regression');
const BASELINE = path.join(REG_DIR, 'baseline.json');
const THRESHOLDS = path.join(REG_DIR, 'thresholds.json');

function extract(summaryFile) {
  const data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const m = data.metrics;
  const dur = (m.http_req_duration && m.http_req_duration.values) || {};
  const failed = (m.http_req_failed && m.http_req_failed.values) || {};
  const reqs = (m.http_reqs && m.http_reqs.values) || {};
  return {
    source: path.basename(summaryFile),
    rps: reqs.rate ?? 0,
    p50: dur['p(50)'] ?? dur.med ?? 0,
    p90: dur['p(90)'] ?? 0,
    p95: dur['p(95)'] ?? 0,
    p99: dur['p(99)'] ?? 0,
    avg: dur.avg ?? 0,
    error_rate: failed.rate ?? 0,
  };
}

const args = process.argv.slice(2);
const saveIdx = args.indexOf('--save-baseline');

if (saveIdx >= 0) {
  const file = args[saveIdx + 1];
  if (!file) { console.error('usage: compare.js --save-baseline <summary.json>'); process.exit(2); }
  const snap = extract(file);
  snap.saved_at = new Date().toISOString();
  snap.note = args[args.indexOf('--note') + 1] || '';
  fs.writeFileSync(BASELINE, JSON.stringify(snap, null, 2));
  console.log(`baseline 저장됨 ← ${file}`);
  console.log(JSON.stringify(snap, null, 2));
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: compare.js <summary.json> | --save-baseline <summary.json>'); process.exit(2); }
if (!fs.existsSync(BASELINE)) {
  console.error('baseline이 없습니다. 먼저: node tools/compare.js --save-baseline <summary.json>');
  process.exit(2);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const cur = extract(file);
const rules = JSON.parse(fs.readFileSync(THRESHOLDS, 'utf8'));

console.log(`\nbaseline: ${base.source} (${base.saved_at})`);
console.log(`current : ${cur.source}\n`);
console.log('지표          baseline      current       변화        판정');
console.log('-----------  ------------  ------------  ----------  ----');

let failedCount = 0;
for (const rule of rules.rules) {
  const b = base[rule.metric];
  const c = cur[rule.metric];
  if (b == null || c == null) continue;

  let regressed = false;
  let changeDesc;
  if (rule.type === 'ratio_increase') {
    // 지연류: baseline 대비 상승률 제한 (b가 0이면 절대값 상한만)
    const change = b > 0 ? (c - b) / b : 0;
    regressed = b > 0 ? change > rule.max_increase : c > (rule.abs_max ?? Infinity);
    changeDesc = b > 0 ? `${(change * 100).toFixed(1)}%` : 'n/a';
  } else if (rule.type === 'ratio_decrease') {
    // 처리율: baseline 대비 하락률 제한
    const change = b > 0 ? (b - c) / b : 0;
    regressed = change > rule.max_decrease;
    changeDesc = b > 0 ? `-${(change * 100).toFixed(1)}%` : 'n/a';
  } else if (rule.type === 'abs_max') {
    regressed = c > rule.value;
    changeDesc = `≤${rule.value}?`;
  }

  if (regressed) failedCount++;
  console.log(
    `${rule.metric.padEnd(11)}  ${String(b.toFixed(2)).padEnd(12)}  ${String(c.toFixed(2)).padEnd(12)}  ${changeDesc.padEnd(10)}  ${regressed ? '❌ 회귀' : '✅'}`,
  );
}

if (failedCount > 0) {
  console.error(`\n회귀 ${failedCount}건 — 실패`);
  process.exit(1);
}
console.log('\n회귀 없음 — 통과');
