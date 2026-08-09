#!/usr/bin/env node
/**
 * 과거 실행 이관 — reports/raw/*.summary.json 을 새 파이프라인의 1단계 산출물로 변환한다.
 *
 * 왜 이관하는가
 * -------------
 * 이력 기반 시스템은 이력이 쌓여야 쓸모가 생긴다. 새 구조를 도입하고 "이제부터 모읍니다"라고 하면
 * 추세 분석이 의미를 갖는 데 몇 달이 걸린다. 이미 165회 분의 실행 결과가 있으므로 그걸 그대로
 * 가져오면 첫날부터 추세를 볼 수 있다.
 *
 * 운영 지표까지 소급되는 이유
 *   Prometheus TSDB의 보관 기간이 30일(--storage.tsdb.retention.time=30d)이다.
 *   과거 실행의 시간 구간이 그 안에 있으면, 그때의 CPU/GC/DB 지표를 지금 조회해도 그대로 나온다.
 *   즉 "그때는 수집 안 했지만 지금 채워 넣을 수 있다".
 *
 * 시간 구간 복원
 *   파일명의 타임스탬프는 handleSummary 실행 시각 = 테스트 **종료** 시각이다.
 *   시작 시각은 state.testRunDurationMs 를 빼서 구한다.
 *
 * 사용법
 *   node tools/migrate-raw.js --dry-run     무엇이 이관될지만 출력
 *   node tools/migrate-raw.js               스테이징 파일 생성
 *   node tools/migrate-raw.js && node tools/collect.js --all --no-wait
 */
'use strict';

const fs = require('fs');
const path = require('path');
const repo = require('./lib/repository');

const RAW_DIR = path.join(repo.PERF_ROOT, 'reports', 'raw');

/** `posts-2026-07-31T06-07-03.summary.json` → { scenario:'posts', endedAt:Date } */
function parseName(file) {
  const m = /^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.summary\.json$/.exec(file);
  if (!m) return null;
  const [, scenario, stamp] = m;
  // 'YYYY-MM-DDTHH-MM-SS' → ISO. 파일명 생성 시 UTC ISO를 그대로 치환했으므로 UTC로 되돌린다.
  const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3') + 'Z';
  const endedAt = new Date(iso);
  return Number.isFinite(endedAt.getTime()) ? { scenario, endedAt, runId: `${scenario}-${stamp}` } : null;
}

function trendStats(v) {
  if (!v) return null;
  const g = (k) => (v[k] == null ? null : v[k]);
  return {
    avg: g('avg'), min: g('min'), med: v.med != null ? v.med : g('p(50)'),
    max: g('max'), p90: g('p(90)'), p95: g('p(95)'), p99: g('p(99)'),
  };
}

function breakdown(metrics) {
  const out = {};
  for (const [key, m] of Object.entries(metrics)) {
    const mm = /^([a-z_]+)\{(.+)\}$/.exec(key);
    if (!mm || mm[1] !== 'http_req_duration') continue;
    // 다중 태그 서브메트릭은 단일 축 분해 대상이 아니다 (scripts/lib/summary.js 와 동일 규칙).
    const tags = mm[2].split(',');
    if (tags.length !== 1) continue;
    const sep = tags[0].indexOf(':');
    if (sep < 0) continue;
    const tagKey = tags[0].slice(0, sep);
    const tagVal = tags[0].slice(sep + 1);
    out[tagKey] = out[tagKey] || {};
    out[tagKey][tagVal] = { ...trendStats(m.values), count: m.values && m.values.count != null ? m.values.count : null };
  }
  return out;
}

function collectChecks(group, prefix = '', acc = []) {
  if (!group) return acc;
  for (const c of group.checks || []) {
    acc.push({ name: prefix ? `${prefix} / ${c.name}` : c.name, passes: c.passes || 0, fails: c.fails || 0 });
  }
  for (const g of Object.values(group.groups || {})) {
    collectChecks(g, prefix ? `${prefix} / ${g.name}` : g.name, acc);
  }
  return acc;
}

function convert(data, info) {
  const m = data.metrics || {};
  const val = (k, f) => (m[k] && m[k].values ? m[k].values[f] : null);

  const durationSec = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const endedAt = info.endedAt;
  const startedAt = new Date(endedAt.getTime() - durationSec * 1000);

  const dur = trendStats(m.http_req_duration && m.http_req_duration.values) || {};
  const iterations = val('iterations', 'count') || 0;

  const thresholds = [];
  for (const [metricName, metric] of Object.entries(m)) {
    if (!metric.thresholds) continue;
    for (const [expr, res] of Object.entries(metric.thresholds)) {
      thresholds.push({ metric: metricName, expression: expr, ok: typeof res === 'object' ? !!res.ok : !!res });
    }
  }

  return {
    schemaVersion: 1,
    phase: 'k6',
    migrated: true,
    run: {
      id: info.runId,
      scenario: info.scenario,
      environment: 'perf',
      // 이관 데이터는 원본에 메타데이터가 없다. 추측해서 채우지 않고 명시적으로 표시한다 —
      // 나중에 "이 실행은 어느 커밋이었지?"를 물었을 때 거짓 답을 주는 것보다 낫다.
      branch: 'unknown(migrated)',
      commit: 'unknown',
      commitShort: 'migrated',
      buildNumber: 'migrated',
      executor: 'migrated',
      scriptVersion: 'unknown',
      dataset: 'small',
      baseUrl: 'http://localhost:18080',
      note: '과거 reports/raw 에서 이관된 실행 — 실행 메타데이터는 원본에 없습니다.',
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSec: Number(durationSec.toFixed(1)),
      vusConfigured: null,
      rampUp: null,
      hold: null,
    },
    k6: {
      overall: {
        ...dur,
        missingPercentiles: ['p90', 'p95', 'p99'].filter((p) => dur[p] == null),
        rps: val('http_reqs', 'rate') || 0,
        tps: val('iterations', 'rate') || (durationSec ? iterations / durationSec : 0),
        errorRate: val('http_req_failed', 'rate') || 0,
        // Rate 메트릭의 passes = 조건(실패)이 참인 표본 = 실패 요청 수 (summary.js 참고)
        failedRequests: val('http_req_failed', 'passes') || 0,
        httpReqs: val('http_reqs', 'count') || 0,
        iterations,
        checkRate: val('checks', 'rate') || 0,
        checksPassed: val('checks', 'passes') || 0,
        checksFailed: val('checks', 'fails') || 0,
        vusMax: val('vus_max', 'max') || val('vus_max', 'value') || 0,
        dataReceivedBytes: val('data_received', 'count') || 0,
        dataSentBytes: val('data_sent', 'count') || 0,
        waitingAvgMs: m.http_req_waiting ? m.http_req_waiting.values.avg : null,
        waitingP95Ms: m.http_req_waiting ? m.http_req_waiting.values['p(95)'] : null,
        blockedAvgMs: m.http_req_blocked ? m.http_req_blocked.values.avg : null,
        connectingAvgMs: m.http_req_connecting ? m.http_req_connecting.values.avg : null,
        iterationDurationAvgMs: m.iteration_duration ? m.iteration_duration.values.avg : null,
      },
      breakdown: breakdown(m),
      thresholds,
      thresholdsPassed: thresholds.every((t) => t.ok),
      checks: collectChecks(data.root_group),
      rawMetrics: m,
    },
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(RAW_DIR)) {
    console.error(`원본 디렉터리 없음: ${RAW_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.summary.json')).sort();
  console.log(`원본 ${files.length}건 발견\n`);

  let converted = 0, skipped = 0, failed = 0;
  const byScenario = {};

  for (const file of files) {
    const info = parseName(file);
    if (!info) { skipped++; continue; }

    // 이미 새 파이프라인으로 처리된 실행은 건드리지 않는다 (덮어쓰면 메타데이터가 사라진다).
    if (!force && (fs.existsSync(repo.runFile(info.runId)) || fs.existsSync(repo.stagedK6File(info.runId)))) {
      skipped++;
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'));
      if (!data.metrics) { skipped++; continue; }
      const record = convert(data, info);

      byScenario[info.scenario] = (byScenario[info.scenario] || 0) + 1;
      if (!dryRun) {
        repo.ensureDir(repo.RUNS_DIR);
        fs.writeFileSync(repo.stagedK6File(info.runId), JSON.stringify(record, null, 2));
      }
      converted++;
    } catch (e) {
      console.error(`  ✗ ${file}: ${e.message}`);
      failed++;
    }
  }

  console.log('시나리오별 이관 건수:');
  for (const [sc, n] of Object.entries(byScenario).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sc.padEnd(22)} ${n}`);
  }
  console.log(`\n이관 ${converted}건 · 건너뜀 ${skipped}건 · 실패 ${failed}건${dryRun ? ' (dry-run — 파일 생성 안 함)' : ''}`);
  if (!dryRun && converted) {
    console.log('\n다음 단계: node tools/collect.js --all --no-wait');
    console.log('  (Prometheus 보관 기간 내의 실행은 운영 지표까지 소급 채워집니다)');
  }
}

if (require.main === module) main();

module.exports = { parseName, convert, breakdown, trendStats };
