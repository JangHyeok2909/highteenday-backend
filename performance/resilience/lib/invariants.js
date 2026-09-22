/**
 * 불변식 카탈로그 — "장애가 지나간 뒤 데이터가 여전히 맞는가".
 *
 * 부수효과가 없다. 값을 읽는 것은 `integrity.js` 가 하고, 여기에는 **읽을 값의 정의**와
 * **그 값들이 만족해야 할 등식**만 있다.
 *
 * <h2>왜 필요한가</h2>
 *
 * 지금 보고서는 오류율과 지연만 잰다. 그래서 <b>에러 없이 데이터만 사라지는 실패</b>를
 * 구조적으로 못 본다. Redis 호출 실패는 {@code ResilientRedisAspect} 가 삼키고 기본값을
 * 돌려주므로 사용자는 HTTP 200 을 받고, 오류율은 0 에 가깝고, 보고서는 "폴백 정상 동작"으로
 * 읽힌다. 실제로는 그 사이에 조회수가 사라지고 카운터가 틀어졌을 수 있다.
 *
 * <h2>왜 계획 파일에 SQL 을 쓰지 않는가</h2>
 *
 * 계획 파일(`faults/*.json`)은 "무엇을 언제 주입하는가"라는 절차다. 도메인 지식을 거기 넣으면
 * 같은 등식이 계획마다 복사되고, JSON 안의 SQL 에는 테스트가 붙지 않는다. 그래서
 * `tools/lib/metrics-catalog.js` 와 같은 방식으로 카탈로그를 두고 계획은 **이름만 고른다.**
 *
 * <h2>숫자를 믿어도 되는지 함께 적는다</h2>
 *
 * `exact: true` 는 그 숫자를 그대로 믿어도 된다는 뜻이다. `exact: false` 는 실행 조건 때문에
 * 값이 한쪽으로 밀렸다는 뜻이고, 왜 그런지는 `note` 에 적는다. 둘을 같은 모양으로 보여 주면
 * 사람이 흔들리는 숫자를 확정된 숫자로 읽는다.
 */
'use strict';

/**
 * 표본 하나에서 읽을 집계값. `integrity.js` 가 선택된 프로브의 항목을 모아 UNION ALL 로
 * 한 번에 읽는다. `from` 에 조인을 써도 된다.
 */
const CATALOG = {
  'counter-drift': {
    id: 'counter-drift',
    question: '비정규화된 반응 카운터가 실제 반응 행 수와 함께 움직였는가',
    // 카운터는 반응 트랜잭션 안에서 행을 세어 다시 채워지므로(PostReactionService.syncCounts),
    // 드레인 주기를 기다릴 필요가 없다. 조회수 계열 프로브만 대기가 필요하다.
    needs: { db: true, drain: false },
    columns: [
      { key: 'sumLike', expr: 'COALESCE(SUM(PST_like_count),0)', from: 'posts', where: 'is_valid=1' },
      { key: 'sumDislike', expr: 'COALESCE(SUM(PST_dislike_count),0)', from: 'posts', where: 'is_valid=1' },
      // 게시글 쪽 합계가 `is_valid=1` 인 게시글만 더하므로, 행 쪽도 같은 조건으로 좁혀야 한다.
      // 조인을 빼면 소프트 삭제된 게시글에 달린 반응이 행 쪽에만 남아, 부하가 글을 지울
      // 때마다(writeCycle) 결함이 아닌 불일치가 나온다.
      {
        key: 'rowsLike',
        expr: 'COUNT(*)',
        from: 'posts_reactions r JOIN posts p ON r.PST_id = p.PST_id',
        where: "r.is_valid=1 AND p.is_valid=1 AND r.PST_RCT_kind='LIKE'",
      },
      {
        key: 'rowsDislike',
        expr: 'COUNT(*)',
        from: 'posts_reactions r JOIN posts p ON r.PST_id = p.PST_id',
        where: "r.is_valid=1 AND p.is_valid=1 AND r.PST_RCT_kind='DISLIKE'",
      },
    ],
    /**
     * 두 등식을 따로 본다. 합쳐서 보면 좋아요가 싫어요로 잘못 반영된 경우가 서로를 상쇄해
     * 정상으로 보인다.
     *
     * 증가분(Δ)으로 보는 것이 핵심이다. 절대값으로 보면 지난 실행이 남긴 기존 드리프트까지
     * 섞여, 이번 장애가 만든 몫을 가려낼 수 없다.
     */
    evaluate(before, after) {
      const d = (k) => after[k] - before[k];
      return [
        { name: '좋아요', expected: d('rowsLike'), actual: d('sumLike'), unit: '건', exact: true },
        { name: '싫어요', expected: d('rowsDislike'), actual: d('sumDislike'), unit: '건', exact: true },
      ].map((c) => ({ ...c, delta: c.actual - c.expected, status: c.actual === c.expected ? 'ok' : 'mismatch' }));
    },
  },

  'viewcount-conservation': {
    id: 'viewcount-conservation',
    question: '올랐어야 할 조회수가 DB 에 다 들어갔는가',
    needs: { db: true, redis: true, drain: true, k6: true },
    // 부하 쪽 카운터가 실행 전체의 합이라 구간별로 쪼갤 수 없다. 전체만 판정한다.
    scope: 'run',
    columns: [
      // view_count 는 게시글이 소프트 삭제돼도 그 행에 남는다. 보존을 보는 값이라
      // is_valid 로 거르지 않는다 — 거르면 삭제가 곧 유실로 보인다.
      { key: 'dbViews', expr: 'COALESCE(SUM(PST_view_count),0)', from: 'posts', where: null },
      // 식에는 안 쓴다. 끝에 버퍼가 비었는지 확인하는 용도다 — 아래 evaluate 참고.
      { key: 'bufSum', source: 'redis', pattern: 'post:views:*', pick: 'sum' },
      { key: 'bufKeys', source: 'redis', pattern: 'post:views:*', pick: 'keys' },
      // 중복 제거 마커. 실행 시작(S0)에 남아 있으면 서버는 그 조회를 중복으로 접는데
      // 부하 쪽은 새 조회로 세므로, 유실이 실제보다 크게 나온다. 기본 동작인 시작 시 FLUSHALL
      // 이 0 으로 만들어 주고, 이 항목은 --no-flush-redis 로 껐을 때를 위한 안전망이다.
      //
      // optional 인 이유: 식에 안 쓰고 경고에만 쓴다. 필수로 두면 이 항목이 생기기 전에
      // 저장된 실행이 통째로 "확인 불가"가 되는데, 그 실행들의 유실 수치는 멀쩡하다.
      { key: 'dedupKeys', source: 'redis', pattern: 'viewed:*', pick: 'keys', optional: true },
    ],
    /**
     * 유실 = (올랐어야 할 수) − (실제로 오른 수).
     *
     * 올랐어야 할 수는 부하 발생기가 센다({@code scripts/posts.js} 의 {@code view_expected}).
     * 서버에서는 알 수 없기 때문이다 — Redis 가 죽으면 조회수 증가가 아예 시도되지 않아
     * Redis 에도 DB 에도 흔적이 남지 않는다.
     *
     * <b>버퍼 잔량은 식에 안 들어간다.</b> 끝에 버퍼가 비었는지 확인하는 데만 쓴다. 버퍼에
     * 남아 있는 것은 사라진 게 아니라 아직 DB 로 안 간 것이라, 그 상태로 빼면 없는 유실이
     * 잡힌다. 그래서 버퍼가 비지 않았으면 숫자를 내지 않고 "더 기다려야 한다"고 말한다.
     *
     * <b>불확실 구간.</b> 타임아웃된 요청은 서버가 조회수를 올렸는지 알 수 없다. 그 건수를
     * 따로 적어, "유실 203건 (불확실 79건)" 처럼 읽게 한다.
     *
     * <b>과다 계상 조건 둘.</b> 실행 시작 시 `viewed:*` 키가 남아 있거나, VU 가 데이터셋
     * 사용자 수보다 많으면 부하 쪽이 실제보다 많이 센다. 앞의 것은 시작 시 FLUSHALL 이 기본이라
     * 보통 일어나지 않고, 여기 남은 검사는 그걸 끄고 돌렸을 때를 위한 안전망이다.
     */
    evaluate(before, after, ctx) {
      const k6 = (ctx && ctx.k6) || {};
      const env = (ctx && ctx.env) || {};
      const expected = Number.isFinite(k6.viewExpected) ? k6.viewExpected : null;
      const applied = after.dbViews - before.dbViews;
      if (expected == null) {
        return [{
          name: '조회수', expected: null, actual: applied, delta: null, unit: '건', exact: true, status: 'unknown',
          note: '부하 쪽 조회 카운터가 없다 — 이 실행은 카운터를 넣기 전 부하 스크립트로 돌았다',
        }];
      }
      if (after.bufSum > 0) {
        return [{
          name: '조회수', expected, actual: applied, delta: applied - expected, unit: '건', exact: true, status: 'unknown',
          note: `Redis 버퍼에 ${after.bufSum.toLocaleString()}건(키 ${after.bufKeys})이 남아 있다 — 아직 DB 로 안 간 것이라 유실과 구분되지 않는다. 드레인을 더 기다려야 한다`,
        }];
      }
      const lost = expected - applied;
      const unknown = Number.isFinite(k6.viewUnknown) ? k6.viewUnknown : 0;
      const vusMax = k6.all && Number.isFinite(k6.all.vusMax) ? k6.all.vusMax : null;
      const warn = [];
      if (!Number.isFinite(before.dedupKeys)) warn.push('시작 시 <code>viewed:*</code> 키가 남아 있었는지 모른다 — 이 항목이 생기기 전에 저장된 실행이다');
      else if (before.dedupKeys > 0) warn.push(`시작 시 <code>viewed:*</code> 키 ${before.dedupKeys.toLocaleString()}개가 남아 있었다 — 그만큼 서버는 중복으로 접었을 수 있어 유실이 실제보다 크다. <code>--no-flush-redis</code> 를 빼면 자동으로 지워진다`);
      if (vusMax != null && env.datasetUsers && vusMax > env.datasetUsers) warn.push(`VU 가 ${vusMax.toLocaleString()}까지 늘어 데이터셋 사용자 ${env.datasetUsers.toLocaleString()}명을 넘었다 — 두 VU 가 같은 계정을 써서 부하 쪽이 과다 계상했다`);
      const band = unknown ? ` · 불확실 ${unknown.toLocaleString()}건(타임아웃이라 서버가 올렸는지 모른다)` : '';
      const head = lost > 0 ? `<b>${lost.toLocaleString()}건 유실</b>${warn.length ? ' <b>(상한)</b>' : ''}` : '유실 없음';
      return [{
        name: '조회수',
        expected,
        actual: applied,
        delta: applied - expected,
        unit: '건',
        exact: warn.length === 0,
        status: lost > 0 ? 'loss' : 'ok',
        note: `${head} · 버퍼 비었음(확인)${band}`
          + (warn.length ? `<br><span class="warn">⚠ ${warn.join('<br>⚠ ')}</span>` : ''),
      }];
    },
  },
};

/** 나쁜 쪽이 이긴다. 구간 판정은 그 구간 검사들 중 가장 나쁜 것으로 정한다. */
const STATUS_SEVERITY = { ok: 0, idle: 0, loss: 2, mismatch: 3, unknown: 1 };

/** 대조할 구간. `S0`~`S3` 은 `integrity.js` 가 뜨는 표본 이름이다. */
const SEGMENTS = [
  { key: 'pre', label: 'pre', from: 'S0', to: 'S1' },
  { key: 'fault', label: 'fault', from: 'S1', to: 'S2' },
  { key: 'post', label: 'post', from: 'S2', to: 'S3' },
  { key: 'run', label: '전체', from: 'S0', to: 'S3' },
];

function get(id) {
  return CATALOG[id] || null;
}

function ids() {
  return Object.keys(CATALOG);
}

/** 계획이 고른 프로브 중 카탈로그에 없는 것. 계획 검증에서 쓴다. */
function unknownProbes(probeIds) {
  return (probeIds || []).filter((id) => !CATALOG[id]);
}

/** 선택된 프로브 중 하나라도 드레인 대기를 요구하면 참. */
function needsDrain(probeIds) {
  return (probeIds || []).some((id) => CATALOG[id] && CATALOG[id].needs.drain);
}

/**
 * 표본과 프로브 선택에서 대조표를 만든다. 순수 함수다.
 *
 * 표본을 못 뜬 구간은 `unknown` 이다 — 장애 중에 DB 를 못 읽는 것은 흔하고, 그때 값을 0 으로
 * 두면 "변화 없음"으로 보여 결함을 덮는다.
 *
 * @param {string[]} probeIds 계획이 고른 프로브 이름.
 * @param {{label:string, ok:boolean, values:object, error:string}[]} samples 채취된 표본.
 * @param {{k6:object, env:object}} [ctx] 표본 밖의 실행 정보. 부하 쪽 집계(`rec.k6`)와
 *   실행 환경(`rec.env`) 을 담는다 — 부하 발생기만 아는 값이나 데이터셋 크기를 쓰는 프로브가 받는다.
 * @returns {{id:string, question:string, segments:object[]}[]} 프로브별 결과.
 */
function reconcile(probeIds, samples, ctx) {
  const byLabel = {};
  for (const s of samples || []) byLabel[s.label] = s;
  return (probeIds || []).filter((id) => CATALOG[id]).map((id) => {
    const probe = CATALOG[id];
    const wanted = probe.scope === 'run' ? SEGMENTS.filter((s) => s.key === 'run') : SEGMENTS;
    // 표본 전체의 성패가 아니라 **이 프로브가 쓰는 항목이 있는지**로 판단한다. Redis 를
    // 죽인 실험에서 Redis 항목만 빠지고 DB 항목은 멀쩡한데, 표본 하나를 통째로 버리면
    // DB 만 보는 불변식까지 확인 불가가 된다.
    // optional 항목은 없어도 판정한다 — 그런 항목은 식이 아니라 경고에만 쓰인다.
    const has = (s) => s && probe.columns.every((c) => c.optional || Number.isFinite(s.values && s.values[c.key]));
    const segments = wanted.map((seg) => {
      const a = byLabel[seg.from];
      const b = byLabel[seg.to];
      if (!has(a) || !has(b)) {
        const missing = [has(a) ? null : seg.from, has(b) ? null : seg.to].filter(Boolean);
        return { ...seg, status: 'unknown', reason: `${missing.join('·')} 표본에 이 불변식의 값이 없다`, checks: [] };
      }
      const checks = probe.evaluate(a.values, b.values, ctx);
      const worst = checks.reduce((acc, c) => (STATUS_SEVERITY[c.status] > STATUS_SEVERITY[acc] ? c.status : acc), 'ok');
      // 아무 값도 안 움직였으면 "정합"이 아니라 "변화 없음"이다. 판정할 거리가 없었다는 뜻이다.
      const moved = checks.some((c) => c.expected !== 0 || c.actual !== 0);
      if (worst === 'ok' && !moved) return { ...seg, status: 'idle', checks };
      return { ...seg, status: worst, checks };
    });
    return { id, question: probe.question, segments };
  });
}

module.exports = { CATALOG, SEGMENTS, get, ids, unknownProbes, needsDrain, reconcile };
