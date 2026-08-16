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
/** perf-run.js 가 실행 전후로 잰 DB 상태. k6 는 자기 실행 후의 DB 를 알 수 없다. */
const stagedDbStateFile = (runId) => path.join(RUNS_DIR, `${runId}.dbstate.json`);

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
 * DB 상태 블록. loadK6 와 같은 순서로 본다 — 재수집(`--all`)은 이미 승격된 파일에서
 * 읽어야 하고, 최초 수집은 스테이징에서 읽어야 한다. 없으면 null(이 변경 이전 실행).
 */
function loadDbState(runId) {
  return readJson(path.join(runDir(runId), 'dbstate.json')) || readJson(stagedDbStateFile(runId));
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
    [stagedDbStateFile(runId), path.join(runDir(runId), 'dbstate.json')],
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
    // 데이터셋 상태 축(v3). 기준선 탐색이 run.json 을 열지 않고 "스냅샷 상태에서 출발한
    // 실행인가"를 걸러야 하므로 인덱스에 평탄화해 둔다. 이 필드가 없는 과거 엔트리는
    // undefined 라 eligibilityOf 의 `=== false` 검사를 그대로 통과한다(소급 탈락 금지).
    datasetGuard: r.datasetGuard || null,
    stateBefore: r.stateBefore || null,
    stateAfter: r.stateAfter || null,
    stateMatchedSnapshot: r.stateMatchedSnapshot != null ? r.stateMatchedSnapshot : null,
    stateChanged: r.stateChanged != null ? !!r.stateChanged : null,
    snapshotId: r.snapshotId || null,
    // warm 에서 잰 값과 cold 에서 잰 값은 같은 실험이 아니다. 이력 표에서 그 사실을
    // 구분하려면 인덱스에 있어야 한다(run.json 을 열지 않고 걸러야 하므로).
    cacheState: r.cacheState || null,
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
    // 기준선 자격 조건이 **아니다**(S-10). 이력 표와 리포트가 "그 실행의 당시 성능 상태"를
    // 보여주기 위한 값이다 — 느렸다는 사실과 측정이 무효라는 사실은 다른 축이다.
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
    // 이 필드가 없는 과거 엔트리는 null 이라 eligibilityOf 를 그대로 통과한다
    // (기존 이력을 소급 탈락시키지 않는다).
    measurementStatus: reg.measurementStatus || null,
    // PARTIAL 은 성격이 다른 두 상황을 한 값으로 묶는다 — 참고 지표 몇 개가 빠진 실행과
    // measure 구간을 다 채우지 못하고 끊긴 실행. 전자는 p95 대조군으로 여전히 쓸 수 있고
    // 후자는 시간 조건 자체가 달라 쓸 수 없다(S-10). 인덱스만 보고 둘을 가르려면 이 값이
    // 필요하다. regression 이 계산한 값을 우선하고, 없으면 수집기가 남긴 원본을 본다.
    windowIncomplete: reg.windowIncomplete != null
      ? !!reg.windowIncomplete
      : i.window && i.window.incomplete != null ? !!i.window.incomplete : null,
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
 * 기준선 자격 — "이 실행을 대조군으로 써도 되는가"만 판정한다(S-10).
 *
 * 여기서 보는 것은 **측정 무결성** 하나다. 성능이 좋았는지 나빴는지(thresholdsPassed,
 * regression.verdict)는 자격 조건이 아니다. 느린 실행은 나쁜 결과지 잘못된 측정이 아니고,
 * 개선 전후를 비교하려면 바로 그 느린 실행이 기준선이어야 한다. 예전에는
 * `thresholdsPassed !== false` 로 걸렀는데, 그러면 개선 전이 SLO를 넘긴 순간 개선 후와
 * 영원히 비교할 수 없었다(EXP-000: 같은 조건 12회 실행, 기준선 선택 0회).
 *
 * 판정 규칙
 *   UNMEASURED                  → 제외. 필수 지표가 없어 그 실행의 수치 자체가 무의미하다
 *   PARTIAL + measure 구간 미완 → 제외. 계획한 구간을 다 못 채운 실행은 시간 조건이 다르다
 *   PARTIAL (참고 지표만 결측)  → 허용. k6 지연·오류율은 온전하므로 핵심 비교는 성립한다
 *   MEASURED                    → 허용
 *   measurementStatus 미기록    → 허용. 과거 실행을 소급 탈락시키지 않는다(T-08 정책 유지).
 *                                 조건이 부족하면 어차피 아래 comparability 에서 정확한
 *                                 사유와 함께 탈락한다
 *
 * @returns {{eligible:boolean, reasonCode?:string, details?:object}}
 */
function eligibilityOf(entry) {
  // 데이터셋이 스냅샷 상태가 아닌 채로 잰 실행(guard=warn 에서만 생긴다. strict 는 복원하고,
  // off 는 이 값을 남기지 않는다). 성능이 나빴다는 뜻이 아니라 **무엇을 잰 것인지 확정할 수
  // 없다**는 뜻이라 기준선으로 쓰면 뒤따르는 모든 비교가 오염된다.
  if (entry.stateMatchedSnapshot === false) {
    return {
      eligible: false,
      reasonCode: 'dataset-state-drift',
      details: { stateBefore: entry.stateBefore || null, snapshotId: entry.snapshotId || null },
    };
  }
  if (entry.measurementStatus === 'UNMEASURED') {
    return {
      eligible: false,
      reasonCode: 'unmeasured',
      details: { measurementStatus: 'UNMEASURED' },
    };
  }
  // windowIncomplete 만 단독으로 본다 — 이 값이 true 면 regression 은 (UNMEASURED 가
  // 아닌 한) 반드시 PARTIAL 을 매기므로, 상태값과 중복해서 검사할 필요가 없다.
  if (entry.windowIncomplete === true) {
    return {
      eligible: false,
      reasonCode: 'window-incomplete',
      details: { measurementStatus: entry.measurementStatus || null, windowIncomplete: true },
    };
  }
  return { eligible: true };
}

/** reasonCode → 사람이 읽는 한 문장. 콘솔과 HTML 리포트가 같은 문장을 쓰도록 한 곳에 둔다. */
const REJECTION_TEXT = {
  'dataset-state-drift': '데이터셋이 스냅샷 상태가 아니어서 기준선에서 제외',
  unmeasured: '필수 지표가 없어(측정 불가) 기준선에서 제외',
  'window-incomplete': 'measure 구간이 계획보다 짧게 끝나 기준선에서 제외',
  conditions: '실행 조건이 달라 비교하지 않음',
};

/**
 * 탈락 사유 한 줄. 조건 불일치는 무엇이 달랐는지까지 말해야 쓸모가 있으므로 mismatch 설명을
 * 이어 붙인다("데이터셋: small → large").
 */
function describeRejection(rej) {
  if (!rej) return '';
  if (rej.reasonCode === 'conditions') {
    const blocking = (rej.mismatches || []).filter((m) => m.materiality === 'blocking');
    if (blocking.length) return blocking.map((m) => m.desc).join('; ');
    return REJECTION_TEXT.conditions;
  }
  return REJECTION_TEXT[rej.reasonCode] || '기준선으로 쓸 수 없음';
}

/**
 * 비교 기준이 될 실행을 찾는다.
 *
 * "직전 실행"이 아니라 "기준선으로 쓸 수 있는 가장 최근 실행"이다. 시간축에서 바로 앞이라는
 * 것과 대조군으로 유효하다는 것은 다른 조건이고, 후자는 두 질문으로 갈린다.
 *   1) 제대로 측정된 실행인가        → eligibilityOf (측정 무결성)
 *   2) 같은 것을 잰 실행인가          → comparability.js (실행 조건)
 * 둘 다 "성능이 좋았는가"와는 무관하다(S-10).
 *
 * 두 판정을 사전 필터로 분리하지 않고 한 루프에서 처리하는 이유: 사전 필터로 지운 후보는
 * rejected 에 남지 않아 리포트가 "이 조건의 첫 실행입니다"라고 말해 버린다. 실제로 저장된
 * posts-2026-08-11T12-05-00 런은 1분 전에 같은 조건의 실행이 있었는데도 first-run 으로
 * 기록됐다 — 그 실행이 thresholdsPassed=false 라 사전 필터에서 사라졌기 때문이다.
 * 침묵은 조용한 통과와 구분되지 않는다.
 *
 * @returns {{baseline:object|null, comparability:object|null, seriesHash:string|null,
 *            rejected:Array, hadPriorCandidates:boolean}}
 */
function findBaseline(record, opts = {}) {
  const { scenario, id, startedAt } = record.run;
  const current = cmp.conditionsOf(record);
  const series = cmp.seriesHash(current);
  const idx = loadIndex(opts.indexFile);

  // 시나리오는 계열의 정체성이자 항상 기록되는 값이라 먼저 자른다. 이걸 안 하면
  // rejected 목록이 다른 시나리오 실행으로 가득 차 사람에게 아무 도움이 안 된다.
  // 여기까지가 "후보였는가"의 정의다 — 자격·조건 판정은 아래 루프에서만 한다.
  const earlier = idx.runs
    .filter((r) => r.id !== id)
    .filter((r) => r.scenario === scenario)
    .filter((r) => String(r.startedAt) < String(startedAt));

  const hadPriorCandidates = earlier.length > 0;
  const rejected = [];
  // 전부 쌓으면 리포트가 이력 전체를 뱉는다. 최근 것 몇 개면 사유는 충분히 전달된다.
  const reject = (cand, info) => {
    if (rejected.length >= REJECTED_LIMIT) return;
    rejected.push({
      id: cand.id,
      startedAt: cand.startedAt,
      reasonCode: info.reasonCode,
      mismatches: info.mismatches || [],
      details: info.details || {},
    });
  };

  for (let i = earlier.length - 1; i >= 0; i--) {
    const cand = earlier[i];

    const eligibility = eligibilityOf(cand);
    if (!eligibility.eligible) {
      reject(cand, eligibility);
      continue;
    }

    const result = cmp.compare(current, cmp.conditionsOf(cand));
    if (result.comparable) {
      return {
        baseline: cand,
        comparability: result,
        seriesHash: series,
        rejected,
        hadPriorCandidates,
      };
    }
    reject(cand, { reasonCode: 'conditions', mismatches: result.mismatches });
  }

  return {
    baseline: null,
    comparability: null,
    seriesHash: series,
    rejected,
    hadPriorCandidates,
  };
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
  runDir, runFile, k6File, reportFile, stagedK6File, stagedTxtFile, stagedDbStateFile,
  ensureDir, readJson, writeJson, promoteStaged,
  listRunIds, listPendingRunIds, loadRun, loadK6, loadDbState, saveRun,
  loadIndex, saveIndex, rebuildIndex,
  nextRunNumber, findBaseline, recentRuns, toIndexEntry,
  eligibilityOf, describeRejection,
};
