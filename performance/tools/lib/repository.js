/**
 * Performance Repository — 실행 이력의 저장/조회 계층.
 *
 * 설계 판단: 왜 DB가 아니라 파일인가
 * ------------------------------------
 * 성능 이력은 (a) 쓰기가 테스트당 1회로 극히 드물고 (b) 읽기는 "최근 N개" 패턴이
 * 사실상 전부이며 (c) Git으로 코드와 함께 버전 관리될 때 가치가 가장 크다.
 * 이 조건에서 RDB는 순수 비용이다 — 스키마 마이그레이션, 접속 정보, 백업, CI에서의 기동까지
 * 전부 새 운영 부담이 된다. 반면 파일은 CI 아티팩트로 그대로 올라가고, PR diff에
 * 성능 변화가 드러나며, 개발자가 로컬에서 아무 준비 없이 재현할 수 있다.
 *
 * 대신 "나중에 DB로 옮길 수 있는 모양"은 유지한다:
 *   - run.json 하나가 곧 한 행(row)이다 (조인 불필요, 자기완결적)
 *   - index.json은 파생 캐시일 뿐 — 언제든 run.json들로부터 재생성 가능(rebuild)
 * 팀이 커져 대시보드 동시 조회가 필요해지면 index.json 생성부만 DB 적재로 바꾸면 된다.
 *
 * 레이아웃
 *   reports/runs/<runId>.k6.json      1단계 스테이징 (k6가 평면 파일로 씀 — mkdir 불가하므로)
 *   reports/runs/<runId>/k6.json      수집기가 정리해 넣은 원본
 *   reports/runs/<runId>/run.json     2단계 산출물 (수집기가 보강한 최종 레코드)
 *   reports/runs/<runId>/report.html  사람이 읽는 보고서
 *   reports/index.json                이력 인덱스 (파생 — rebuild 가능)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PERF_ROOT = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(PERF_ROOT, 'reports', 'runs');
const INDEX_FILE = path.join(PERF_ROOT, 'reports', 'index.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

const runDir = (runId) => path.join(RUNS_DIR, runId);
const runFile = (runId) => path.join(runDir(runId), 'run.json');
const k6File = (runId) => path.join(runDir(runId), 'k6.json');
const reportFile = (runId) => path.join(runDir(runId), 'report.html');
// 스테이징 — k6가 직접 쓰는 평면 경로
const stagedK6File = (runId) => path.join(RUNS_DIR, `${runId}.k6.json`);
const stagedTxtFile = (runId) => path.join(RUNS_DIR, `${runId}.summary.txt`);

/** 저장된 모든 runId — 정리된 디렉터리 + 아직 스테이징 상태인 것 모두 */
function listRunIds() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const ids = new Set();
  for (const d of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
    if (d.isDirectory()) ids.add(d.name);
    else if (d.name.endsWith('.k6.json')) ids.add(d.name.slice(0, -'.k6.json'.length));
  }
  return [...ids].sort();
}

/** 아직 수집(2단계)되지 않은 실행 */
function listPendingRunIds() {
  return listRunIds().filter((id) => !fs.existsSync(runFile(id)));
}

function loadRun(runId) {
  return readJson(runFile(runId));
}

/** 정리된 위치를 먼저 보고, 없으면 스테이징에서 읽는다. */
function loadK6(runId) {
  return readJson(k6File(runId)) || readJson(stagedK6File(runId));
}

/**
 * 스테이징 평면 파일을 <runId>/ 디렉터리로 옮긴다.
 * 수집이 성공한 뒤에만 호출한다 — 실패 시 스테이징이 남아 재시도할 수 있어야 하므로.
 */
function promoteStaged(runId) {
  ensureDir(runDir(runId));
  for (const [src, dest] of [
    [stagedK6File(runId), k6File(runId)],
    [stagedTxtFile(runId), path.join(runDir(runId), 'summary.txt')],
  ]) {
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
    }
  }
}

/**
 * 인덱스에 담는 요약 행.
 * 이력 화면과 트렌드 분석이 이 필드만으로 동작하도록 필요한 값을 전부 평탄화해 둔다
 * (수백 개 run.json을 매번 여는 걸 피하기 위한 캐시).
 */
function toIndexEntry(record) {
  const r = record.run || {};
  const k = (record.k6 && record.k6.overall) || {};
  const i = record.infra || {};
  const flat = i.flat || {};
  const reg = record.regression || {};

  return {
    id: r.id,
    number: r.number,
    scenario: r.scenario,
    environment: r.environment,
    branch: r.branch,
    commit: r.commit,
    commitShort: r.commitShort,
    buildNumber: r.buildNumber,
    executor: r.executor,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSec: r.durationSec,
    dataset: r.dataset,
    note: r.note,
    vusMax: k.vusMax,
    avg: k.avg,
    p90: k.p90,
    p95: k.p95,
    p99: k.p99,
    rps: k.rps,
    tps: k.tps,
    errorRate: k.errorRate,
    iterations: k.iterations,
    httpReqs: k.httpReqs,
    checkRate: k.checkRate,
    thresholdsPassed: record.k6 ? record.k6.thresholdsPassed : null,
    cpuMaxPct: flat['saturation.cpuPct'],
    cpuCoresMax: flat['cpu.cores.max'],
    memMaxBytes: flat['memory.workingSet.max'],
    heapMaxBytes: flat['heap.used.max'],
    heapPct: flat['saturation.heapPct'],
    gcPauseMaxMs: flat['gc.pauseMaxMs'],
    gcCount: flat['gc.count'],
    mysqlSlowQueries: flat['mysql.slowQueries'],
    mysqlThreadsRunningMax: flat['mysql.threadsRunning.max'],
    mysqlQps: flat['mysql.qps'],
    redisHitPct: flat['redis.hitRatioPct'],
    redisOpsPerSec: flat['redis.opsPerSec'],
    hikariPct: flat['saturation.hikariPct'],
    hikariPendingMax: flat['pool.hikariPending.max'],
    verdict: reg.verdict || null,
    infraAvailable: !!(i.flat && Object.keys(i.flat).length),
  };
}

function loadIndex() {
  const idx = readJson(INDEX_FILE, null);
  if (idx && Array.isArray(idx.runs)) return idx;
  return { schemaVersion: 1, updatedAt: null, runs: [] };
}

function saveIndex(idx) {
  idx.updatedAt = new Date().toISOString();
  writeJson(INDEX_FILE, idx);
}

/** 다음 실행 번호 — 사람이 "Run #42"로 부르기 위한 단조 증가 카운터 */
function nextRunNumber() {
  const idx = loadIndex();
  return idx.runs.reduce((max, r) => Math.max(max, r.number || 0), 0) + 1;
}

/** run 레코드 저장 + 인덱스 갱신 (같은 id면 교체 — 리포트 재생성 시 중복 방지) */
function saveRun(record) {
  const runId = record.run.id;
  writeJson(runFile(runId), record);

  const idx = loadIndex();
  const entry = toIndexEntry(record);
  const pos = idx.runs.findIndex((r) => r.id === runId);
  if (pos >= 0) idx.runs[pos] = entry;
  else idx.runs.push(entry);

  idx.runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  saveIndex(idx);
  return entry;
}

/**
 * 비교 기준이 될 직전 실행을 찾는다.
 *
 * 왜 단순히 "바로 앞 실행"이 아닌가: 시나리오가 다르면 비교가 무의미하고(normal-day와
 * spike를 비교하면 항상 회귀로 보인다), 환경이 다르면 절대값이 안 맞는다.
 * 그래서 **같은 시나리오 + 같은 환경**의 직전 실행만 기준으로 삼는다.
 * 추가로 실패한 실행(threshold 미달)은 기준에서 제외한다 — 망가진 실행을 기준으로 삼으면
 * 그 다음 실행이 "개선"으로 보이는 착시가 생긴다.
 */
function findPrevious(record, opts = {}) {
  const { scenario, environment, id, startedAt } = record.run;
  const idx = loadIndex();
  const candidates = idx.runs
    .filter((r) => r.id !== id)
    .filter((r) => r.scenario === scenario)
    .filter((r) => !environment || r.environment === environment)
    .filter((r) => String(r.startedAt) < String(startedAt))
    .filter((r) => (opts.includeFailed ? true : r.thresholdsPassed !== false));

  return candidates.length ? candidates[candidates.length - 1] : null;
}

/** 같은 시나리오의 최근 N개 (트렌드 분석용, 오래된 것 → 최신 순) */
function recentRuns(scenario, limit = 20, environment) {
  const idx = loadIndex();
  return idx.runs
    .filter((r) => !scenario || r.scenario === scenario)
    .filter((r) => !environment || r.environment === environment)
    .slice(-limit);
}

/** 인덱스를 run.json들로부터 완전히 재생성 — 인덱스 손상/수동 삭제 복구용 */
function rebuildIndex() {
  const idx = { schemaVersion: 1, updatedAt: null, runs: [] };
  for (const runId of listRunIds()) {
    const rec = loadRun(runId);
    if (rec && rec.run && rec.run.id) idx.runs.push(toIndexEntry(rec));
  }
  idx.runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  // 번호가 비어 있으면 시간순으로 다시 매긴다.
  let n = 0;
  for (const r of idx.runs) r.number = ++n;
  saveIndex(idx);
  return idx;
}

module.exports = {
  PERF_ROOT, RUNS_DIR, INDEX_FILE,
  runDir, runFile, k6File, reportFile, stagedK6File, stagedTxtFile,
  ensureDir, readJson, writeJson, promoteStaged,
  listRunIds, listPendingRunIds, loadRun, loadK6, saveRun,
  loadIndex, saveIndex, rebuildIndex,
  nextRunNumber, findPrevious, recentRuns, toIndexEntry,
};
