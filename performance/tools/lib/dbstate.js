'use strict';
/**
 * DB 상태 지문 — "실행이 시작될 때 데이터베이스에 실제로 무엇이 있었는가".
 *
 * 왜 필요한가
 * ------------
 * `meta.json`의 생성 지문(generation)은 **"어떻게 만들었는가"**에 답한다. 생성 시점에 한 번
 * 계산되어 파일에 고정되므로, 그 뒤 데이터가 어떻게 변하든 값이 그대로다. 그래서
 * write-heavy 가 게시글 3만 건을 더 만들어 놓아도 이름도 `large`, 생성 지문도 그대로라
 * 다음 실행이 **비교 가능으로 판정된다**.
 *
 * 이 모듈은 그 위에 얹는 두 번째 축이다. 실행 직전에 DB를 직접 세어 **"지금 무엇이
 * 들어 있는가"**에 답한다.
 *
 * 왜 집계 지문인가 (버린 대안)
 * ------------------------------
 * 모든 행의 체크섬을 뜨는 전수 해시가 정확하지만 100만 행에서 수 분이 걸린다. 이 값은
 * 실행마다 **두 번**(전/후) 계산되므로 그 비용은 측정 자체를 방해한다. 집계는 인덱스만
 * 읽어 훨씬 싸다. 놓치는 것은 "행 수도 카운터 합도 같은데 내용만 바뀐" 경우인데, 부하
 * 테스트는 INSERT/UPDATE 위주라 실질적으로 걸린다.
 *
 * `MAX(pk)`를 함께 넣는 이유: 100건을 만들고 100건을 소프트 삭제하면 활성 행 수는 그대로다.
 * ID 최댓값은 되돌아가지 않으므로 그 경우를 잡는다. 그래서 `MAX`는 `is_valid` 로 거르지
 * 않는다 — 삭제된 행도 ID를 소비했다는 사실은 남아야 한다.
 *
 * 무엇을 지문에서 빼는가 — 이 모듈에서 가장 중요한 판단
 * ------------------------------------------------------
 * 아래 값들을 지문에 넣으면 **아무 일도 하지 않았는데 매번 불일치가 나서 복원이 무한히
 * 반복된다.**
 *
 *   tokens          VU 가 로그인할 때마다 발급·회전된다. 읽기 전용 시나리오도 반드시 바꾼다.
 *   view_count 합   Redis 버퍼를 스케줄러가 주기적으로 flush 한다. 같은 상태여도 잰 시점에
 *                   따라 값이 다르다.
 *   hot post 테이블 hot score 스케줄러가 쓴다. 부하와 무관하게 시간이 지나면 바뀐다.
 *
 * 버리지는 않고 `volatile` 로 따로 기록한다. 그래야 리포트가 "쓰기가 있었다"(core 변화)와
 * "조회수·토큰만 움직였다"(volatile 만 변화)를 구분해 말할 수 있다.
 *
 * 정적 참조 데이터(boards·schools·subjects·flyway 등)는 부하가 건드리지 않으므로 양쪽 다
 * 제외한다. 대상 테이블은 `datasets/verify.sh` 가 검증하는 범위와 맞춘다.
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');

const CONTAINER = process.env.PERF_MYSQL_CONTAINER || 'perf-mysql';
const DATABASE = process.env.PERF_MYSQL_DATABASE || 'highteenday';
const PASSWORD = process.env.MYSQL_ROOT_PASSWORD || 'perfroot';
const REDIS_CONTAINER = process.env.PERF_REDIS_CONTAINER || 'perf-redis';

/**
 * 지문에 들어가는 테이블. `soft:false` 는 `is_valid` 컬럼이 없는 테이블이다
 * (`medias` — 스키마를 확인해 넣은 값이지 추측이 아니다).
 */
const CORE_TABLES = [
  { table: 'users', pk: 'USR_id', soft: true },
  { table: 'posts', pk: 'PST_id', soft: true },
  { table: 'comments', pk: 'CMT_id', soft: true },
  { table: 'posts_reactions', pk: 'PST_RCT_id', soft: true },
  { table: 'comments_reactions', pk: 'CMT_RCT_id', soft: true },
  { table: 'scraps', pk: 'SC_id', soft: true },
  { table: 'friends', pk: 'FRD_id', soft: true },
  { table: 'friends_requests', pk: 'FRD_REQ_id', soft: true },
  { table: 'chat_rooms', pk: 'CHT_RM_id', soft: true },
  { table: 'chat_participants', pk: 'CHT_PT_id', soft: true },
  { table: 'chat_messages', pk: 'CHT_MSG_id', soft: true },
  { table: 'notifications', pk: 'NT_id', soft: true },
  { table: 'medias', pk: 'MDA_id', soft: false },
];

/**
 * 비정규화 카운터의 합. 행 수가 같아도 카운터가 어긋나면 다른 상태다 — KI-53 이 정확히
 * 그 상황이었다(댓글 행은 맞는데 저장된 카운터가 13,284 부족).
 */
const CORE_SUMS = [
  ['posts.sumCommentCount', 'PST_comment_count'],
  ['posts.sumLikeCount', 'PST_like_count'],
  ['posts.sumDislikeCount', 'PST_dislike_count'],
  ['posts.sumScrapCount', 'PST_scrap_count'],
];

function buildSql() {
  const parts = [];
  const add = (key, expr, from, where) =>
    parts.push(`SELECT '${key}' AS k, CAST(${expr} AS CHAR) AS v FROM ${from}${where ? ` WHERE ${where}` : ''}`);

  for (const t of CORE_TABLES) {
    add(`core:${t.table}.count`, 'COUNT(*)', t.table, t.soft ? 'is_valid=1' : null);
    // MAX 는 is_valid 로 거르지 않는다 — 소프트 삭제된 행도 ID 를 소비했다.
    add(`core:${t.table}.maxId`, `COALESCE(MAX(${t.pk}),0)`, t.table, null);
  }
  for (const [key, col] of CORE_SUMS) {
    add(`core:${key}`, `COALESCE(SUM(${col}),0)`, 'posts', 'is_valid=1');
  }

  add('volatile:tokens.count', 'COUNT(*)', 'tokens', null);
  add('volatile:posts.sumViewCount', 'COALESCE(SUM(PST_view_count),0)', 'posts', null);
  add('volatile:daily_hot_post.count', 'COUNT(*)', 'daily_hot_post', null);
  add('volatile:recenthotpost.count', 'COUNT(*)', 'recenthotpost', null);

  return parts.join(' UNION ALL ');
}

/**
 * `docker exec ... mysql -N -B` 한 번으로 전부 읽는다. 왕복을 늘리면 그만큼 느려진다.
 *
 * `query` 라는 이름으로 밖에도 내보낸다. 장애 실험의 불변식 검사
 * (`resilience/lib/integrity.js`)가 자기 집계를 따로 읽어야 하는데, 그 값을 지문의
 * `core` 에 넣으면 **저장된 모든 실행의 지문이 바뀌어** 기존 스냅샷·성능 기록과의
 * 비교 가능성이 통째로 깨진다. 그래서 항목은 그대로 두고 통로만 공유한다.
 *
 * @param {string} sql 탭 구분 두 열(`k`, `v`)을 내는 SELECT.
 * @returns {Object<string,string>} 첫 열을 키로 한 문자열 값.
 * @throws {Error} docker 실행 실패 또는 MySQL 이 0 이 아닌 코드로 끝난 경우.
 */
function runQuery(sql) {
  const r = spawnSync(
    'docker',
    ['exec', CONTAINER, 'mysql', '-uroot', `-p${PASSWORD}`, DATABASE, '-N', '-B', '-e', sql],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`docker exec 실패: ${r.error.message}`);
  if (r.status !== 0) {
    const msg = (r.stderr || '').split('\n').filter((l) => l && !/Using a password/.test(l)).join(' ');
    throw new Error(`MySQL 조회 실패 (exit ${r.status}): ${msg || '(출력 없음)'}`);
  }
  const out = {};
  for (const line of (r.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    if (/Using a password/.test(line)) continue;
    const i = line.indexOf('\t');
    if (i < 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

/**
 * 키를 정렬해 해싱한다. UNION ALL 의 반환 순서는 보장되지 않으므로 정렬이 없으면 같은
 * 상태가 다른 지문을 낼 수 있다.
 */
function fingerprintOf(obj) {
  const canonical = Object.keys(obj).sort().map((k) => `${k}=${obj[k]}`).join('\n');
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/**
 * 현재 DB 상태를 읽어 지문과 원자료를 돌려준다.
 *
 * @returns {{fingerprint:string, core:object, volatile:object, elapsedMs:number, computedAt:string}}
 */
function computeState() {
  const startedAt = Date.now();
  const rows = runQuery(buildSql());

  const core = {};
  const volatile_ = {};
  for (const [k, v] of Object.entries(rows)) {
    if (k.startsWith('core:')) core[k.slice(5)] = Number(v);
    else if (k.startsWith('volatile:')) volatile_[k.slice(9)] = Number(v);
  }

  const expected = CORE_TABLES.length * 2 + CORE_SUMS.length;
  if (Object.keys(core).length !== expected) {
    // 조용히 일부만 읽히면 지문이 "다른 상태인데 같은 값"이 될 수 있다. 그건 이 장치가
    // 막으려던 바로 그 상황이므로 소리 내고 멈춘다.
    throw new Error(
      `상태 지문 항목 수 불일치: ${Object.keys(core).length}/${expected} — 스키마가 바뀌었는지 확인하세요.`,
    );
  }

  return {
    fingerprint: fingerprintOf(core),
    core,
    volatile: volatile_,
    elapsedMs: Date.now() - startedAt,
    computedAt: new Date().toISOString(),
  };
}

/**
 * 캐시 상태 — warm 으로 잰 값과 cold 로 잰 값은 같은 실험이 아니다.
 *
 * 왜 여기 있나: Redis 는 별개 저장소가 아니라 **같은 데이터 계층의 일부**다. 조회수 버퍼가
 * 아직 DB 로 안 내려간 채 Redis 에 있고, 그래서 스냅샷 복원이 `FLUSHALL` 을 강제한다.
 * DB 상태를 묻는 자리에서 캐시 상태를 함께 묻는 것이 자연스럽다.
 *
 * `RT:` 접두사(세션 리프레시 토큰)는 캐시가 아니므로 뺀다. VU 가 로그인만 해도 쌓이는데
 * 그걸 warm 이라고 부르면 **모든 실행이 warm 으로 기록되어 이 값이 무의미해진다.**
 *
 * warm/cold 는 편의 라벨이고 판단 근거는 `cacheKeys` 숫자다 — 키 3개짜리 캐시를 warm 이라
 * 부르는 것이 맞는지는 사람이 정할 문제라, 라벨과 원자료를 함께 남긴다.
 */
function computeCacheState() {
  const r = spawnSync('docker', ['exec', REDIS_CONTAINER, 'redis-cli', '--scan', '--count', '1000'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    // 캐시 상태를 못 읽는 것은 실행을 막을 이유가 아니다. 다만 "cold 였다"고 단정해서도
    // 안 되므로 unknown 으로 남긴다 — 모르는 것과 비어 있는 것은 다르다.
    return { state: 'unknown', totalKeys: null, cacheKeys: null };
  }
  let total = 0;
  let cache = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const k = line.trim();
    if (!k) continue;
    total++;
    if (!k.startsWith('RT:')) cache++;
  }
  return { state: cache === 0 ? 'cold' : 'warm', totalKeys: total, cacheKeys: cache };
}

/**
 * 두 상태의 차이. 리포트가 "무엇이 얼마나 변했는가"를 한 줄로 말할 수 있어야 한다 —
 * "지문이 다릅니다"만으로는 사람이 다음 행동을 정할 수 없다.
 */
function diff(before, after) {
  const changed = [];
  for (const key of Object.keys(before.core)) {
    const d = after.core[key] - before.core[key];
    if (d !== 0) changed.push({ key, before: before.core[key], after: after.core[key], delta: d });
  }
  const volatileChanged = [];
  for (const key of Object.keys(before.volatile)) {
    const d = after.volatile[key] - before.volatile[key];
    if (d !== 0) volatileChanged.push({ key, before: before.volatile[key], after: after.volatile[key], delta: d });
  }
  return {
    coreChanged: changed.length > 0,
    changed: changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    volatileChanged,
  };
}

/** 사람이 읽는 한 줄. "게시글 +1,203, 댓글 +4,881 (외 2개)" */
function describeDiff(d, limit = 3) {
  if (!d.coreChanged) return '변화 없음';
  const head = d.changed.slice(0, limit)
    .map((c) => `${c.key} ${c.delta > 0 ? '+' : ''}${c.delta.toLocaleString()}`)
    .join(', ');
  const rest = d.changed.length - limit;
  return rest > 0 ? `${head} (외 ${rest}개)` : head;
}

module.exports = {
  computeState, computeCacheState, fingerprintOf, diff, describeDiff,
  CORE_TABLES, CORE_SUMS, buildSql, CONTAINER, DATABASE,
  query: runQuery,
};
