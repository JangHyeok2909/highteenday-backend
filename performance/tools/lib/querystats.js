'use strict';
/**
 * querystats — **어느 SQL 이 몇 번 돌고 몇 행을 봤는가**. measure 구간만 잘라낸다.
 *
 * 왜 필요한가 — 두 계층 사이에 다리가 없다
 * ----------------------------------------
 * 지금 수집되는 것은 양 끝뿐이다.
 *
 *   MySQL 지표  `mysql.rowsReadPerSec` · `mysql.selectScan` · `mysql.qps`
 *               → 서버 전체 **합계**. 어느 쿼리가 만들었는지 모른다.
 *   k6 지표     `k6.breakdown.name.<엔드포인트>` 의 count · p95
 *               → 엔드포인트별 **시간과 횟수**. 그 요청이 쓴 쿼리·행은 모른다.
 *
 * 그래서 "읽은 행 4,910/s 중 검색 쿼리 몫이 얼마인가" 같은 질문에 저장된 자료만으로는
 * 답할 수 없다. 실제로 그 질문에서 **호출당 비용을 사후에 한 번 재서 곱하는** 방식으로
 * 추정했다가 틀렸다 — 파라미터에 따라 요청 비용이 극단적으로 갈리기 때문이다
 * (`performance/docs/investigations/perf-request-cost-skew.md`, E-51). 검증 두 개가 반대했다:
 * 호출 수와 총 읽은 행의 상관이 r = 0.11 이었고, 곱한 값의 합이 실측 총량의 3배였다.
 *
 * `events_statements_summary_by_digest` 는 정규화된 SQL 하나마다 한 행을 유지하고
 * `COUNT_STAR`(호출 수)와 `SUM_ROWS_EXAMINED`(본 행 수)를 함께 들고 있다. 즉 추정 없이
 * 조회로 답이 나온다.
 *
 * 왜 실행 전후가 아니라 measure 구간인가
 * --------------------------------------
 * P_S 카운터는 서버 시작 이후 **누적**이라 값 하나로는 못 쓴다. 그런데 실행 전후로 재면
 * warmup(180초)+measure(300초)+rampdown(120초)이 전부 섞인다. 판정은 measure 구간에서만
 * 하므로(`performance/README.md`), 창이 다르면 다른 지표와 나란히 놓을 수 없다.
 *
 * 그래서 `loadbench` 와 같은 방식으로 워커를 분리해 **measure 시작과 끝에 각각 한 번씩**
 * 찍는다. 부모는 `spawnSync('k6')` 로 막혀 있어 스스로는 그 시점에 아무것도 못 한다.
 *
 * 비용은 조회 두 번이다. digest 테이블은 인메모리이고 이 워크로드에서 행이 111개라
 * 실측 수십 ms 수준이다. measure 창 안에서 돌지만 `loadbench` 와 달리 CPU 를 태우지
 * 않으므로 측정을 오염시키지 않는다.
 *
 * 무엇을 조심해야 하는가
 * ----------------------
 * 1. **서버 전역이라 다른 클라이언트가 섞인다.** mysqld-exporter 가 스크레이프마다
 *    `SHOW GLOBAL STATUS` 등 4개 문장을 날린다(실측: 5초 간격, 43시간에 각 31,183회).
 *    그 넷이 `Select_scan` 의 상당 부분을 만든다 — 분리하지 않으면 앱이 풀스캔하는
 *    것으로 오독한다. `classify()` 가 그 몫을 따로 센다.
 * 2. **`SUM_ROWS_EXAMINED` 는 서버 계층 값**이라 `Innodb_rows_read`(스토리지 계층)와
 *    정확히 같지 않다. 두 값을 섞어 쓰지 말고 각각 안에서 비교한다.
 * 3. **digest 한도.** `performance_schema_digests_size` 를 넘으면 초과분이 DIGEST NULL
 *    한 행으로 뭉친다. 그 행을 `overflow` 로 따로 보고해 유실을 조용히 넘기지 않는다.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CONTAINER = process.env.PERF_MYSQL_CONTAINER || 'perf-mysql';
const PASSWORD = process.env.MYSQL_ROOT_PASSWORD || 'perfroot';
const DATABASE = process.env.PERF_MYSQL_DATABASE || 'highteenday';

/** run.json 에 실을 상위 항목 수. 전부 실으면 실행 기록이 지문보다 커진다. */
const TOP_N = 25;

/**
 * DIGEST_TEXT 를 180자로 자르고 탭·개행을 공백으로 바꾼다. `-N -B` 출력이 TSV 라
 * 문장 안의 탭·개행이 열을 깨뜨리기 때문이다.
 */
const SQL = `
SELECT DIGEST,
       IFNULL(SCHEMA_NAME, ''),
       COUNT_STAR,
       SUM_ROWS_EXAMINED,
       SUM_ROWS_SENT,
       SUM_SELECT_SCAN,
       SUM_SELECT_FULL_JOIN,
       SUM_NO_INDEX_USED,
       SUM_CREATED_TMP_DISK_TABLES,
       SUM_TIMER_WAIT DIV 1000000000,
       REPLACE(REPLACE(REPLACE(LEFT(DIGEST_TEXT, 180), '\\t', ' '), '\\n', ' '), '\\r', ' ')
FROM performance_schema.events_statements_summary_by_digest
WHERE DIGEST IS NOT NULL`.trim();

const FIELDS = [
  'schema', 'calls', 'rowsExamined', 'rowsSent', 'selectScan',
  'selectFullJoin', 'noIndexUsed', 'tmpDiskTables', 'totalMs', 'stmt',
];

/** 초과로 뭉쳐진 항목이 있는지. 있으면 이 구간의 수치가 일부 유실된 것이다. */
const OVERFLOW_SQL =
  "SELECT IFNULL(SUM(COUNT_STAR), 0) FROM performance_schema.events_statements_summary_by_digest WHERE DIGEST IS NULL";

function mysql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', CONTAINER, 'mysql', '-uroot', `-p${PASSWORD}`, '-N', '-B', '-e', sql],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`docker exec 실패: ${r.error.message}`);
  if (r.status !== 0) {
    const msg = (r.stderr || '').split('\n').filter((l) => l && !/Using a password/.test(l)).join(' ');
    throw new Error(`MySQL 조회 실패 (exit ${r.status}): ${msg || '(출력 없음)'}`);
  }
  return r.stdout || '';
}

/**
 * 지금 시점의 digest 표를 읽는다.
 *
 * @returns {{at:string, rows:object, overflowCalls:number}}
 *   rows 는 DIGEST 해시를 키로 하는 맵이다. 이름이 아니라 해시를 키로 쓰는 이유는
 *   DIGEST_TEXT 를 180자로 잘라 저장하기 때문이다 — 앞부분이 같은 서로 다른 쿼리가
 *   한 항목으로 합쳐지면 안 된다.
 */
function capture() {
  const rows = {};
  for (const line of mysql(SQL).split('\n')) {
    if (!line.trim() || /Using a password/.test(line)) continue;
    const c = line.split('\t');
    if (c.length < FIELDS.length + 1) continue;
    const digest = c[0];
    const rec = {};
    FIELDS.forEach((f, i) => {
      const v = c[i + 1];
      rec[f] = (f === 'schema' || f === 'stmt') ? v : Number(v);
    });
    rows[digest] = rec;
  }
  let overflowCalls = 0;
  try {
    overflowCalls = Number((mysql(OVERFLOW_SQL).split('\n')[0] || '0').trim()) || 0;
  } catch { /* 없으면 0 으로 둔다 — 이 값이 없다고 캡처를 실패시키지 않는다 */ }
  return { at: new Date().toISOString(), rows, overflowCalls };
}

/**
 * 문장이 누가 날린 것인지 가른다.
 *
 * `exporter` 는 mysqld-exporter 의 스크레이프다. 이 몫을 앱과 섞으면 "풀스캔이 초당
 * 3건씩 일어난다"처럼 읽힌다 — 실제로는 그중 상당수가 지표 수집이다.
 */
function classify(rec) {
  const s = (rec.stmt || '').trim();
  // 이 모듈이 스스로 날린 조회. 두 번 찍으므로 반드시 델타에 남는다 — 빼지 않으면
  // 계측이 자기 자신을 측정 대상에 포함시킨다.
  if (/events_statements_summary_by_digest/i.test(s)) return 'self';
  if (/^SHOW\s/i.test(s)) return 'exporter';
  if (/performance_schema|information_schema|INNODB_(CMP|BUFFER|METRICS)/i.test(s)) return 'exporter';
  if (rec.schema === DATABASE) return 'app';
  return 'other';
}

const KINDS = ['app', 'exporter', 'self', 'other'];
const NUMERIC = FIELDS.filter((f) => f !== 'schema' && f !== 'stmt');

/**
 * 두 캡처의 차를 낸다 — 그 구간에서 실제로 일어난 것만 남는다.
 *
 * 구간 중 처음 등장한 digest 는 before 에 없으므로 0 에서 시작한 것으로 본다.
 * before 에만 있고 after 에 없는 항목은 나올 수 없다(P_S 는 항목을 지우지 않는다).
 * 단, 구간 중 MySQL 이 재시작하면 카운터가 되감기므로 **음수 델타를 감지해 보고**한다.
 */
function diff(before, after) {
  const out = [];
  let rewound = false;
  for (const [digest, a] of Object.entries(after.rows)) {
    const b = before.rows[digest];
    const rec = { digest, schema: a.schema, stmt: a.stmt, kind: classify(a) };
    let any = false;
    for (const f of NUMERIC) {
      const d = a[f] - (b ? b[f] : 0);
      if (d < 0) rewound = true;
      rec[f] = d;
      if (f === 'calls' && d > 0) any = true;
    }
    if (any) out.push(rec);
  }
  return { rows: out, rewound };
}

/**
 * 상위 목록을 만드는 축들.
 *
 * **왜 셋인가 — 하나로는 찾는 것을 놓친다.**
 * 원래는 `rowsExamined` 하나로만 정렬해 상위 25개를 실었다. 그 목록은 "행을 많이 훑은
 * 쿼리"는 잘 보여주지만 **행을 거의 안 읽으면서 수없이 불리는 쿼리는 절대 보여주지 않는다.**
 * 그런데 N+1 이 정확히 그 모양이다 — 1행짜리 조회가 수천 번.
 *
 * 실측(normal-day-2026-08-31T08-35-17)에서 그 구멍이 그대로 드러났다. 앱이 실행한 문장은
 * 60,763회·10,090ms 였는데 행 기준 상위 25개에 들어온 것은 5,520회·1,394ms 뿐이었다.
 * **호출의 91%, 시간의 86% 가 목록 밖**에 있었고, 그것들이 읽은 행은 다 합쳐 306행이었다.
 * 행이 없으니 영원히 순위에 못 든다. N+1 을 판정하려고 만든 도구가 N+1 의 흔적을 구조적으로
 * 가리고 있었던 것이다.
 *
 * 축마다 답하는 질문이 다르다.
 *   rows  — 어느 쿼리가 데이터를 많이 훑었나 (인덱스·쿼리 계획 문제)
 *   calls — 어느 쿼리가 많이 불렸나         (N+1·루프 안 조회)
 *   time  — 어느 쿼리가 서버 시간을 썼나    (실제 비용의 소재)
 */
const AXES = [
  { id: 'byRows', field: 'rowsExamined', label: '읽은 행 기준' },
  { id: 'byCalls', field: 'calls', label: '호출 수 기준' },
  { id: 'byTime', field: 'totalMs', label: '소요 시간 기준' },
];

function shape(r) {
  return {
    stmt: r.stmt, kind: r.kind, calls: r.calls,
    rowsExamined: r.rowsExamined, rowsPerCall: r.calls ? +(r.rowsExamined / r.calls).toFixed(1) : 0,
    rowsSent: r.rowsSent, selectScan: r.selectScan, selectFullJoin: r.selectFullJoin,
    noIndexUsed: r.noIndexUsed, totalMs: r.totalMs,
    msPerCall: r.calls ? +(r.totalMs / r.calls).toFixed(3) : 0,
  };
}

/**
 * run.json 에 실을 형태로 줄인다.
 *
 * 상위 N 개만 싣되 **합계는 전체로 낸다.** 상위만 더한 합계를 실으면 나중에 읽는 사람이
 * "이게 전부"로 오해한다.
 *
 * `coverage` 를 함께 싣는 이유도 같다. 목록이 전체의 몇 %를 설명하는지 적어 두지 않으면,
 * 읽는 사람은 목록에 없는 것을 "없는 것"으로 읽는다. 위 실측이 그 오독의 실례다.
 */
function summarize(d, opts = {}) {
  const topN = opts.topN || TOP_N;
  const totals = {};
  for (const k of [...KINDS, 'all']) {
    totals[k] = {};
    for (const f of NUMERIC) totals[k][f] = 0;
  }

  for (const r of d.rows) {
    for (const f of NUMERIC) {
      totals[r.kind][f] += r[f];
      // `all` 에서 self 는 뺀다. 계측이 만든 부하를 총계에 넣으면 그 자체가 측정 오차다.
      if (r.kind !== 'self') totals.all[f] += r[f];
    }
  }
  // 상위 목록에서도 self 는 제외한다 — 항상 상위권에 들어와 자리만 차지한다.
  const ranked = d.rows.filter((r) => r.kind !== 'self');

  const top = {};
  const coverage = {};
  // 목록에 한 번이라도 등장한 digest 의 합집합. 세 축을 합치면 실제로 무엇이 보이지 않는지가
  // 나온다 — 축 하나씩 따로 세면 같은 쿼리를 세 번 세게 된다.
  const shown = new Set();
  for (const axis of AXES) {
    const sorted = [...ranked].sort((x, y) => y[axis.field] - x[axis.field]).slice(0, topN);
    top[axis.id] = sorted.map(shape);
    for (const r of sorted) shown.add(r.digest);
    const sum = sorted.reduce((a, r) => a + r[axis.field], 0);
    const all = totals.all[axis.field];
    coverage[axis.id] = { shown: sum, total: all, pct: all ? +((100 * sum) / all).toFixed(1) : null };
  }
  // 세 축 어디에도 안 나온 문장들. 여기 호출이 많이 남아 있으면 목록만 보고 판단하면 안 된다.
  const hiddenRows = ranked.filter((r) => !shown.has(r.digest));
  const hidden = { statements: hiddenRows.length };
  for (const f of NUMERIC) hidden[f] = hiddenRows.reduce((a, r) => a + r[f], 0);

  return {
    totals,
    distinctStatements: ranked.length,
    rewound: d.rewound,
    topN,
    axes: AXES.map((a) => ({ id: a.id, label: a.label })),
    top,
    coverage,
    hidden,
  };
}

// ---------------------------------------------------------------- 워커

/**
 * measure 구간의 시작과 끝에 캡처하도록 워커를 띄운다.
 *
 * 부모는 k6 를 `spawnSync` 로 돌려 그동안 아무것도 못 하므로 별도 프로세스가 필요하다
 * (`loadbench` 와 같은 이유·같은 구조). stdio 를 버리는 것도 같은 이유다 — 부모가 막혀
 * 있는 동안 워커가 파이프를 채우면 워커가 write 에서 멈춘다.
 */
function start(opts = {}) {
  const { startDelaySec, windowSec } = opts;
  if (!Number.isFinite(startDelaySec) || startDelaySec < 0 || !Number.isFinite(windowSec) || windowSec <= 0) {
    return {
      enabled: false,
      reason: 'measure 창을 정할 수 없음 — --warmup 과 --hold 를 함께 지정할 것',
    };
  }
  const file = path.join(os.tmpdir(), `perf-querystats-${process.pid}-${Date.now()}.json`);
  let child;
  try {
    child = spawn(
      process.execPath,
      [path.join(__dirname, 'querystats-worker.js'), file, String(startDelaySec), String(windowSec)],
      { stdio: 'ignore', detached: false },
    );
  } catch (e) {
    return { enabled: false, reason: `워커 기동 실패: ${e.message}` };
  }
  child.on('error', () => { /* stop() 에서 파일 부재로 드러난다 */ });
  return { enabled: true, file, child, startDelaySec, windowSec };
}

/** 워커가 남긴 결과를 읽는다. 실패는 실행 전체를 죽이지 않고 사유만 남긴다. */
function stop(handle) {
  if (!handle || !handle.enabled) {
    return { enabled: false, reason: handle ? handle.reason : '미기동' };
  }
  try {
    if (!fs.existsSync(handle.file)) {
      return { enabled: false, reason: '워커 결과 파일 없음 — measure 창 안에 실행이 끝났을 수 있다' };
    }
    const raw = JSON.parse(fs.readFileSync(handle.file, 'utf8'));
    fs.unlinkSync(handle.file);
    if (raw.error) return { enabled: false, reason: raw.error };
    return { enabled: true, window: raw.window, ...raw.summary };
  } catch (e) {
    return { enabled: false, reason: `결과 읽기 실패: ${e.message}` };
  }
}

module.exports = { capture, diff, summarize, classify, start, stop, SQL, TOP_N, AXES, CONTAINER, DATABASE };
