'use strict';
/**
 * 데이터셋 상태 축(v3) 테스트.
 *
 * 이 장치가 막으려는 사고는 "쓰기 시나리오가 데이터를 바꿔 놓았는데 이름과 생성 지문이
 * 같아서 비교 가능으로 판정되는 것"이다. 그 판정은 실행해 봐야만 드러나므로 단위 테스트로
 * 고정해 둔다. 인프라(도커·MySQL)가 필요 없는 순수 로직만 다룬다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const cmp = require('../lib/comparability');
const repo = require('../lib/repository');
const guard = require('../lib/guard');
const dbstate = require('../lib/dbstate');

const LOAD = {
  write_heavy: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '5m', target: 200 }] },
};
const PLAN = {
  schemaVersion: 1, mode: 'steady-state', warmupSec: 300, measureSec: 900, rampdownSec: 120,
  measureStartOffsetSec: 300, measureEndOffsetSec: 1200, gatePhase: 'measure',
};

function run(over = {}) {
  return {
    run: {
      scenario: 'write-heavy',
      environment: 'perf',
      dataset: 'large',
      datasetFingerprint: 'sha256:bb5fdd9cb816',
      loadProfile: LOAD,
      scriptVersion: 'abc123',
      phasePlan: PLAN,
      ...over,
    },
  };
}

// ---------------------------------------------------------------------------
// 비교 조건 — 생성 지문이 같아도 상태가 다르면 비교하지 않는다
// ---------------------------------------------------------------------------

test('생성 지문이 같아도 상태 지문이 다르면 blocking 불일치', () => {
  const cur = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:aaaa' }));
  const base = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:bbbb' }));
  const res = cmp.compare(cur, base);
  assert.equal(res.comparable, false);
  assert.ok(res.mismatches.some((m) => m.key === 'dataset' && m.materiality === 'blocking'));
});

test('생성 지문도 상태 지문도 같으면 비교 가능', () => {
  const cur = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:aaaa' }));
  const base = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:aaaa' }));
  assert.equal(cmp.compare(cur, base).comparable, true);
});

test('guard=off 면 상태 축이 조건에 들어가지 않는다 — 상태가 달라도 비교된다', () => {
  const cur = cmp.conditionsOf(run({ datasetGuard: 'off', stateBefore: 'sha256:aaaa' }));
  const base = cmp.conditionsOf(run({ datasetGuard: 'off', stateBefore: 'sha256:bbbb' }));
  assert.equal(cmp.compare(cur, base).comparable, true);
  assert.equal('state' in cur.dataset, false);
});

test('guard 미기록(이 변경 이전 실행)도 off 와 같게 다뤄 소급 탈락시키지 않는다', () => {
  const old = cmp.conditionsOf(run());
  assert.equal('state' in old.dataset, false);
});

test('guard 모드가 다르면 계열이 갈린다 — 보장 수준이 다른 증거를 섞지 않는다', () => {
  const strict = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:aaaa' }));
  const off = cmp.conditionsOf(run({ datasetGuard: 'off', stateBefore: 'sha256:aaaa' }));
  assert.notEqual(cmp.seriesHash(strict), cmp.seriesHash(off));
});

test('상태가 기록되지 않은 strict 실행은 기록된 실행과 비교되지 않는다', () => {
  const withState = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: 'sha256:aaaa' }));
  const without = cmp.conditionsOf(run({ datasetGuard: 'strict', stateBefore: null }));
  assert.equal(cmp.compare(withState, without).comparable, false);
});

// ---------------------------------------------------------------------------
// 기준선 자격 — 오염된 상태에서 잰 실행은 대조군이 될 수 없다
// ---------------------------------------------------------------------------

test('stateMatchedSnapshot=false 면 기준선 자격 박탈', () => {
  const r = repo.eligibilityOf({ stateMatchedSnapshot: false, measurementStatus: 'MEASURED' });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'dataset-state-drift');
});

test('stateMatchedSnapshot=true 는 통과', () => {
  assert.equal(repo.eligibilityOf({ stateMatchedSnapshot: true }).eligible, true);
});

test('stateMatchedSnapshot 미기록(과거 실행)은 통과 — 소급 탈락 금지', () => {
  assert.equal(repo.eligibilityOf({}).eligible, true);
  assert.equal(repo.eligibilityOf({ stateMatchedSnapshot: null }).eligible, true);
});

test('탈락 사유가 사람이 읽는 문장으로 나온다', () => {
  const text = repo.describeRejection({ reasonCode: 'dataset-state-drift' });
  assert.match(text, /스냅샷/);
});

// ---------------------------------------------------------------------------
// 스위치 — 우선순위와 오타 처리
// ---------------------------------------------------------------------------

test('우선순위: CLI > 환경변수 > 설정파일 > 기본값', () => {
  const cfg = { datasetGuard: 'warn' };
  assert.equal(guard.resolveMode(null, {}, {}).mode, 'off');
  assert.equal(guard.resolveMode(null, {}, cfg).mode, 'warn');
  assert.equal(guard.resolveMode(null, { PERF_DATASET_GUARD: 'strict' }, cfg).mode, 'strict');
  assert.equal(guard.resolveMode('off', { PERF_DATASET_GUARD: 'strict' }, cfg).mode, 'off');
});

test('출처를 함께 돌려준다 — 리포트가 "왜 이 모드였나"에 답해야 한다', () => {
  assert.equal(guard.resolveMode(null, {}, { datasetGuard: 'strict' }).source, 'perf.config.json');
  assert.equal(guard.resolveMode('warn', {}, {}).source, '--guard');
});

test('오타는 조용히 off 로 떨어지지 않고 던진다', () => {
  assert.throws(() => guard.resolveMode('strcit', {}, {}), /올바르지 않습니다/);
  assert.throws(() => guard.resolveMode(null, { PERF_DATASET_GUARD: 'on' }, {}), /올바르지 않습니다/);
});

test('빈 문자열은 "지정 안 함"으로 보고 다음 우선순위로 넘어간다', () => {
  assert.equal(guard.resolveMode('', {}, { datasetGuard: 'strict' }).mode, 'strict');
});

// ---------------------------------------------------------------------------
// 지문 계산 — 순서 독립성과 변화 감지
// ---------------------------------------------------------------------------

test('키 순서가 달라도 같은 지문 — UNION ALL 반환 순서는 보장되지 않는다', () => {
  const a = dbstate.fingerprintOf({ 'posts.count': 100, 'users.count': 10 });
  const b = dbstate.fingerprintOf({ 'users.count': 10, 'posts.count': 100 });
  assert.equal(a, b);
});

test('값이 하나만 달라도 지문이 달라진다', () => {
  const a = dbstate.fingerprintOf({ 'posts.count': 100 });
  const b = dbstate.fingerprintOf({ 'posts.count': 101 });
  assert.notEqual(a, b);
});

test('SQL 이 core 테이블 전부와 volatile 항목을 덮는다', () => {
  const sql = dbstate.buildSql();
  for (const t of dbstate.CORE_TABLES) {
    assert.ok(sql.includes(`'core:${t.table}.count'`), `${t.table} count 누락`);
    assert.ok(sql.includes(`'core:${t.table}.maxId'`), `${t.table} maxId 누락`);
  }
  // tokens 와 조회수는 **지문에 들어가면 안 된다** — 로그인과 스케줄러가 매번 바꾸므로
  // core 에 넣으면 아무 일도 안 했는데 불일치가 나서 복원이 무한히 반복된다.
  assert.ok(sql.includes("'volatile:tokens.count'"));
  assert.ok(!sql.includes("'core:tokens.count'"));
  assert.ok(sql.includes("'volatile:posts.sumViewCount'"));
  assert.ok(!sql.includes("'core:posts.sumViewCount'"));
});

test('MAX(pk) 는 is_valid 로 거르지 않는다 — 소프트 삭제된 행도 ID 를 소비했다', () => {
  const sql = dbstate.buildSql();
  const seg = sql.split('UNION ALL').find((s) => s.includes("'core:posts.maxId'"));
  assert.ok(!seg.includes('is_valid'), 'maxId 가 is_valid 로 걸러지고 있다');
  const cnt = sql.split('UNION ALL').find((s) => s.includes("'core:posts.count'"));
  assert.ok(cnt.includes('is_valid=1'), 'count 는 활성 행만 세야 한다');
});

test('diff 가 core 변화와 volatile 변화를 분리한다', () => {
  const before = { core: { 'posts.count': 100 }, volatile: { 'tokens.count': 10 } };
  const after = { core: { 'posts.count': 100 }, volatile: { 'tokens.count': 200 } };
  const d = dbstate.diff(before, after);
  // 토큰만 늘어난 것은 "쓰기가 있었다"가 아니다 — 읽기 전용 실행도 로그인은 한다.
  assert.equal(d.coreChanged, false);
  assert.equal(d.volatileChanged.length, 1);
  assert.equal(dbstate.describeDiff(d), '변화 없음');
});

test('describeDiff 가 큰 변화부터 보여준다', () => {
  const d = dbstate.diff(
    { core: { 'posts.count': 100, 'comments.count': 10 }, volatile: {} },
    { core: { 'posts.count': 101, 'comments.count': 5010 }, volatile: {} },
  );
  assert.equal(d.coreChanged, true);
  assert.match(dbstate.describeDiff(d), /^comments\.count \+5,000/);
});
