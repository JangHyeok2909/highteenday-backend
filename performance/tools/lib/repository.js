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
const cmp = require('./comparability');

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
  // temp + rename — 쓰다 죽어도 반쪽짜리 JSON 이 원본을 대체하지 않는다.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
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
  // measure 구간(k6.phases.measure)을 우선한다 — 이력 표와 추세 스파크라인이 warmup/
  // rampdown 섞인 전체 구간이 아니라 게이트가 실제로 본 값을 추적해야 한다(T-03/S-08).
  // measure가 없는 실행(진단 시나리오·과거 run.json)만 k6.all로 폴백한다.
  const k = (record.k6 && ((record.k6.phases && record.k6.phases.measure) || record.k6.all)) || {};
  const i = record.infra || {};
  const flat = i.flat || {};
  const reg = record.regression || {};
  const conditions = cmp.conditionsOf(record);

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
    // 스크립트 지문 — "같은 것을 잰 결과인가"를 이력 화면에서도 판별할 수 있어야 한다.
    // 회귀 판정은 run.json 을 직접 읽으므로 인덱스에 없어도 동작하지만, 그러면 추세
    // 그래프에서 꺾인 지점이 성능 변화인지 스크립트 변경인지 구분할 방법이 없다.
    scriptVersion: r.scriptVersion || null,
    // 실행 조건 전체 + 계열 해시. 기준선 탐색이 run.json 을 열지 않고 인덱스만으로
    // 후보를 거를 수 있어야 하고, 탈락 사유를 사람에게 설명하려면 원본 값도 필요하다
    // (해시만 남기면 "해시가 다릅니다"밖에 말할 수 없다).
    conditions,
    seriesHash: cmp.seriesHash(conditions),
    note: r.note,
    // vusMax는 항상 전체 구간 기준 — ramp-up까지 포함해야 "최대 몇 VU를 걸었는가"에 맞다.
    vusMax: record.k6 && record.k6.all ? record.k6.all.vusMax : null,
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
    // 기준선 탐색이 run.json 을 열지 않고 "제대로 측정된 실행인가"를 걸러낼 수 있어야 한다.
    // 이 필드가 없는 과거 엔트리는 undefined 라 아래 findBaseline 필터를 그대로 통과한다
    // (기존 이력을 소급 탈락시키지 않는다).
    measurementStatus: reg.measurementStatus || null,
    infraAvailable: !!(i.flat && Object.keys(i.flat).length),
  };
}

function loadIndex(file = INDEX_FILE) {
  // 파일이 없는 것(첫 실행)과 파일이 깨진 것은 다르다. 깨진 인덱스를 빈 이력으로
  // 대체하면 다음 saveRun 이 런 1개짜리 새 인덱스를 써서 이력이 조용히 사라지고,
  // findBaseline 이 null 을 돌려줘 게이트까지 통과해 버린다. 손상은 소리 내고 멈춘다.
  if (!fs.existsSync(file)) return { schemaVersion: 1, updatedAt: null, runs: [] };
  let idx;
  try {
    idx = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(
      `index.json 파싱 실패 (${e.message}) — 복구: node tools/history.js --rebuild`,
    );
  }
  if (idx && Array.isArray(idx.runs)) return idx;
  throw new Error('index.json 형식 오류 (runs 배열 없음) — 복구: node tools/history.js --rebuild');
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
 * 비교 기준이 될 실행을 찾는다.
 *
 * "직전 실행"이 아니라 "비교 가능한 가장 최근 실행"이다. 시간축에서 바로 앞이라는 것과
 * 대조군으로 유효하다는 것은 다른 조건이고, 후자를 판정하는 책임은 comparability.js 에 있다.
 * 여기서는 시간순으로 거슬러 올라가며 첫 번째 유효 대조군을 고른다.
 *
 * 실패한 실행(threshold 미달)은 기준에서 제외한다 — 망가진 실행을 기준으로 삼으면
 * 그 다음 실행이 "개선"으로 보이는 착시가 생긴다.
 *
 * 탈락한 후보를 함께 돌려주는 이유: 조건이 엄격해질수록 "기준선 없음"이 흔해지는데,
 * 그때 사람에게 필요한 건 침묵이 아니라 "8월 4일 실행이 있었지만 데이터셋이 small→large 로
 * 바뀌어 비교하지 않았다"는 문장이다. 이유를 못 대면 조용한 통과와 구분되지 않는다.
 *
 * @returns {{baseline:object|null, comparability:object|null, seriesHash:string|null, rejected:Array}}
 */
function findBaseline(record, opts = {}) {
  const { scenario, id, startedAt } = record.run;
  const current = cmp.conditionsOf(record);
  const series = cmp.seriesHash(current);
  const idx = loadIndex(opts.indexFile);

  // 시나리오는 계열의 정체성이자 항상 기록되는 값이라 먼저 자른다. 이걸 안 하면
  // rejected 목록이 다른 시나리오 실행으로 가득 차 사람에게 아무 도움이 안 된다.
  const earlier = idx.runs
    .filter((r) => r.id !== id)
    .filter((r) => r.scenario === scenario)
    .filter((r) => String(r.startedAt) < String(startedAt))
    .filter((r) => (opts.includeFailed ? true : r.thresholdsPassed !== false))
    // 측정 불가 실행은 기준선이 될 수 없다. thresholdsPassed 만으로는 걸러지지 않는다 —
    // k6는 표본이 0건인 서브메트릭의 threshold 를 통과 처리하므로(v2.1.0 실측), 아무것도
    // 재지 못한 실행도 thresholdsPassed:true 로 남는다. 그런 실행을 기준선으로 삼으면
    // 다음 실행의 모든 증감률이 무의미해진다.
    .filter((r) => r.measurementStatus !== 'UNMEASURED');

  const rejected = [];
  for (let i = earlier.length - 1; i >= 0; i--) {
    const cand = earlier[i];
    const result = cmp.compare(current, cmp.conditionsOf(cand));
    if (result.comparable) {
      return { baseline: cand, comparability: result, seriesHash: series, rejected };
    }
    // 전부 쌓으면 리포트가 이력 전체를 뱉는다. 최근 것 몇 개면 사유는 충분히 전달된다.
    if (rejected.length < REJECTED_LIMIT) {
      rejected.push({
        id: cand.id,
        startedAt: cand.startedAt,
        mismatches: result.mismatches,
      });
    }
  }

  return { baseline: null, comparability: null, seriesHash: series, rejected };
}

const REJECTED_LIMIT = 5;

/**
 * 추세 분석용 최근 N개.
 *
 * seriesHash 로 계열을 가른다. 시나리오 이름만으로 묶으면 small/15VU 실행과
 * large/200VU 실행이 한 선에 섞여, 데이터셋을 바꾼 지점이 성능 급락으로 보인다
 * (기준선 선택과 똑같은 결함이 추세 그래프에도 있었다).
 */
function recentRuns({ scenario, environment, seriesHash, limit = 20, indexFile } = {}) {
  const idx = loadIndex(indexFile);
  return idx.runs
    .filter((r) => !scenario || r.scenario === scenario)
    .filter((r) => !environment || r.environment === environment)
    .filter((r) => !seriesHash || r.seriesHash === seriesHash)
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
  nextRunNumber, findBaseline, recentRuns, toIndexEntry,
};
