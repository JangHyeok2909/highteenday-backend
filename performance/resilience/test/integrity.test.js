'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const integrity = require('../lib/integrity');
const invariants = require('../lib/invariants');
const plans = require('../lib/plan');

const PLAN = { id: 'x', phases: { preSec: 100, faultSec: 60, postSec: 100 }, integrity: { probes: ['counter-drift'] } };

/** counter-drift 가 읽는 네 값을 담은 표본. */
function sample(label, values, over = {}) {
  return { label, at: new Date().toISOString(), tSec: null, ok: true, values, elapsedMs: 10, error: null, ...over };
}

function counts(sumLike, sumDislike, rowsLike, rowsDislike) {
  return { sumLike, sumDislike, rowsLike, rowsDislike };
}

// ---------------------------------------------------------------------------
// 항목·질의 생성
// ---------------------------------------------------------------------------

test('선택된 프로브의 항목만 모으고 중복은 접는다', () => {
  const cols = integrity.columnsFor(['counter-drift', 'counter-drift', '없는프로브']);
  assert.deepEqual(cols.map((c) => c.key), ['sumLike', 'sumDislike', 'rowsLike', 'rowsDislike']);
});

test('질의는 UNION ALL 한 문장이다 — 항목마다 왕복하면 표본이 같은 순간이 아니다', () => {
  const sql = integrity.buildSql(integrity.columnsFor(['counter-drift']));
  assert.equal((sql.match(/UNION ALL/g) || []).length, 3);
  assert.equal((sql.match(/SELECT/g) || []).length, 4);
});

test('반응 행 집계는 게시글에 조인해 유효한 글의 반응만 센다', () => {
  const sql = integrity.buildSql(integrity.columnsFor(['counter-drift']));
  // 조인이 빠지면 소프트 삭제된 글의 반응이 행 쪽에만 남아, 부하가 글을 지울 때마다
  // 결함이 아닌 불일치가 나온다.
  assert.match(sql, /posts_reactions r JOIN posts p ON r\.PST_id = p\.PST_id/);
  assert.match(sql, /p\.is_valid=1/);
});

// ---------------------------------------------------------------------------
// 표본 시각
// ---------------------------------------------------------------------------

test('S1 은 주입보다 앞서고 S2 는 제거보다 뒤다', () => {
  const s = integrity.sampleSchedule(PLAN);
  assert.deepEqual(s, [{ label: 'S1', atSec: 95 }, { label: 'S2', atSec: 165 }]);
});

test('pre 가 리드 타임보다 짧아도 음수 시각을 만들지 않는다', () => {
  const s = integrity.sampleSchedule({ phases: { preSec: 2, faultSec: 10, postSec: 10 } });
  assert.equal(s[0].atSec, 0);
});

test('동기 반영 프로브만 골랐으면 드레인을 기다리지 않는다', () => {
  assert.equal(integrity.drainWaitFor(PLAN), 0);
  assert.equal(invariants.needsDrain(['counter-drift']), false);
});

test('integrity 가 없는 계획은 이 기능이 통째로 꺼진다', () => {
  assert.deepEqual(integrity.probesOf({ phases: {} }), []);
  const sampler = new integrity.Sampler({ phases: { preSec: 1, faultSec: 1, postSec: 1 } }, {});
  assert.equal(sampler.enabled, false);
  assert.equal(sampler.take('S0'), null);
});

// ---------------------------------------------------------------------------
// 대조 — counter-drift
// ---------------------------------------------------------------------------

test('카운터와 행이 같이 움직이면 정합이다', () => {
  const s = [
    sample('S0', counts(100, 20, 100, 20)),
    sample('S1', counts(150, 30, 150, 30)),
    sample('S2', counts(150, 30, 150, 30)),
    sample('S3', counts(180, 35, 180, 35)),
  ];
  const [r] = invariants.reconcile(['counter-drift'], s);
  assert.equal(r.segments.find((x) => x.key === 'run').status, 'ok');
  assert.equal(r.segments.find((x) => x.key === 'fault').status, 'idle');
});

test('카운터만 움직이면 불일치를 구간까지 짚는다', () => {
  const s = [
    sample('S0', counts(100, 20, 100, 20)),
    sample('S1', counts(150, 30, 150, 30)),
    // 장애 중 행은 5건 늘었는데 카운터는 3건만 늘었다.
    sample('S2', counts(153, 30, 155, 30)),
    sample('S3', counts(153, 30, 155, 30)),
  ];
  const [r] = invariants.reconcile(['counter-drift'], s);
  const fault = r.segments.find((x) => x.key === 'fault');
  assert.equal(fault.status, 'mismatch');
  const like = fault.checks.find((c) => c.name === '좋아요');
  assert.equal(like.expected, 5);
  assert.equal(like.actual, 3);
  assert.equal(like.delta, -2);
  assert.equal(r.segments.find((x) => x.key === 'pre').status, 'ok');
});

test('좋아요와 싫어요를 따로 본다 — 합치면 서로 상쇄된다', () => {
  const s = [
    sample('S0', counts(100, 20, 100, 20)),
    sample('S1', counts(100, 20, 100, 20)),
    sample('S2', counts(100, 20, 100, 20)),
    // 좋아요가 싫어요로 잘못 반영된 모양. 합계(+0)로는 정상으로 보인다.
    sample('S3', counts(105, 25, 110, 20)),
  ];
  const [r] = invariants.reconcile(['counter-drift'], s);
  const run = r.segments.find((x) => x.key === 'run');
  assert.equal(run.status, 'mismatch');
  assert.deepEqual(run.checks.map((c) => c.delta), [-5, 5]);
});

test('표본을 못 뜬 구간은 확인 불가다 — 0 으로 세지 않는다', () => {
  const s = [
    sample('S0', counts(100, 20, 100, 20)),
    sample('S1', counts(100, 20, 100, 20)),
    sample('S2', null, { ok: false, values: null, error: 'docker exec 실패' }),
    sample('S3', counts(120, 25, 120, 25)),
  ];
  const [r] = invariants.reconcile(['counter-drift'], s);
  assert.equal(r.segments.find((x) => x.key === 'fault').status, 'unknown');
  assert.equal(r.segments.find((x) => x.key === 'post').status, 'unknown');
  assert.match(r.segments.find((x) => x.key === 'fault').reason, /S2/);
  // 전체 구간은 S0·S3 만 쓰므로 중간 표본이 실패해도 판정할 수 있다.
  assert.equal(r.segments.find((x) => x.key === 'run').status, 'ok');
});

test('표본이 아예 없으면 전 구간이 확인 불가다', () => {
  const [r] = invariants.reconcile(['counter-drift'], []);
  assert.ok(r.segments.every((x) => x.status === 'unknown'));
});

test('모르는 프로브 이름은 결과에서 조용히 빠진다', () => {
  assert.deepEqual(invariants.reconcile(['없는프로브'], []), []);
});

// ---------------------------------------------------------------------------
// 계획 검증
// ---------------------------------------------------------------------------

test('모르는 불변식 이름은 계획 검증에서 막는다', () => {
  const errs = plans.validatePlan({
    ...PLAN, question: 'q', load: { rate: 1 }, expect: ['e'],
    inject: [{ at: 'fault.start', tool: 'docker', action: 'stop', container: 'c' }],
    integrity: { probes: ['오타난이름'] },
  });
  assert.ok(errs.some((e) => /모르는 불변식/.test(e)));
});

test('integrity.probes 가 비면 막는다 — 빈 채로 두면 검사한다고 착각한다', () => {
  const errs = plans.validatePlan({
    ...PLAN, question: 'q', load: { rate: 1 }, expect: ['e'],
    inject: [{ at: 'fault.start', tool: 'docker', action: 'stop', container: 'c' }],
    integrity: { probes: [] },
  });
  assert.ok(errs.some((e) => /integrity\.probes/.test(e)));
});

test('t0 이 늦게 정해져도 S0 의 상대 시각을 채운다 — 음수가 곧 기준선 위치다', () => {
  const sampler = new integrity.Sampler(PLAN, {});
  const t0 = new Date();
  sampler.samples.push(sample('S0', counts(1, 1, 1, 1), { at: new Date(t0.getTime() - 3000).toISOString(), tSec: null }));
  sampler.arm(t0);
  sampler.stop();
  assert.equal(sampler.samples[0].tSec, -3);
});

// ---------------------------------------------------------------------------
// 대조 — viewcount-conservation
//
// 식: 유실 = (부하 쪽이 센 올랐어야 할 수) − (DB view_count 증가분).
// Redis 버퍼는 식에 안 들어간다. 끝에 비었는지 확인하는 용도다.
// ---------------------------------------------------------------------------

/** 조회수 프로브가 읽는 세 값. */
function views(dbViews, bufSum, bufKeys, dedupKeys = 0) {
  return { dbViews, bufSum, bufKeys, dedupKeys };
}

/** 부하 쪽 집계. */
function ctxOf(viewExpected, viewUnknown, over = {}) {
  return { k6: { viewExpected, viewUnknown, all: { vusMax: 50 } }, env: { datasetUsers: 1000 }, ...over };
}

const VIEW_OK = [sample('S0', views(1000, 0, 0)), sample('S3', views(1500, 0, 0))];

test('올랐어야 할 수만큼 DB 가 올랐으면 유실 없음', () => {
  const [r] = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctxOf(500, 0));
  const run = r.segments.find((x) => x.key === 'run');
  assert.equal(run.status, 'ok');
  assert.equal(run.checks[0].delta, 0);
});

test('덜 올랐으면 그 차이가 곧 유실이다', () => {
  const [r] = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctxOf(703, 79));
  const c = r.segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.status, 'loss');
  assert.equal(c.expected, 703);
  assert.equal(c.actual, 500);
  assert.equal(c.delta, -203);
  assert.match(c.note, /203건 유실/);
  // 타임아웃된 요청은 서버가 올렸는지 알 수 없다 — 그 폭을 함께 적는다.
  assert.match(c.note, /불확실 79건/);
});

test('버퍼가 안 비었으면 숫자를 내지 않는다 — 아직 안 간 것과 사라진 것을 구분 못 한다', () => {
  const s = [sample('S0', views(1000, 0, 0)), sample('S3', views(1200, 40, 7))];
  const [r] = invariants.reconcile(['viewcount-conservation'], s, ctxOf(500, 0));
  const c = r.segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.status, 'unknown');
  assert.match(c.note, /40건.*남아 있다/);
});

test('부하 쪽 카운터가 없는 옛 실행은 확인 불가로 남긴다', () => {
  const [r] = invariants.reconcile(['viewcount-conservation'], VIEW_OK, {});
  const c = r.segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.status, 'unknown');
  assert.match(c.note, /카운터가 없다/);
});

test('조회수는 전체 구간만 판정한다 — 부하 카운터가 실행 전체의 합이라 쪼갤 수 없다', () => {
  const [r] = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctxOf(500, 0));
  assert.deepEqual(r.segments.map((s) => s.key), ['run']);
});

test('조회수 프로브는 드레인 대기를 요구한다 — 버퍼가 비어야 판정할 수 있기 때문', () => {
  const plan = { phases: { preSec: 10, faultSec: 10, postSec: 10 }, integrity: { probes: ['viewcount-conservation'] } };
  assert.equal(invariants.needsDrain(['viewcount-conservation']), true);
  assert.equal(integrity.drainWaitFor(plan), integrity.DEFAULTS.drainWaitSec);
  assert.equal(integrity.drainWaitFor({ ...plan, integrity: { ...plan.integrity, drainWaitSec: 70 } }), 70);
});

// ---------------------------------------------------------------------------
// 저장소별 채취
// ---------------------------------------------------------------------------

test('Redis 항목은 패턴마다 한 번만 훑는다', () => {
  const groups = integrity.redisGroups(integrity.columnsFor(['viewcount-conservation']));
  assert.deepEqual([...groups.keys()], ['post:views:*', 'viewed:*']);
  assert.deepEqual(groups.get('post:views:*').map((c) => c.pick), ['sum', 'keys']);
});

test('SQL 에는 DB 항목만 들어간다 — Redis 항목이 섞이면 질의가 깨진다', () => {
  const sql = integrity.buildSql(integrity.columnsFor(['viewcount-conservation']));
  assert.equal((sql.match(/SELECT/g) || []).length, 1);
  assert.doesNotMatch(sql, /post:views/);
});

test('한 저장소만 죽으면 그 저장소를 쓰는 불변식만 확인 불가가 된다', () => {
  // Redis 를 죽인 실험. DB 값은 멀쩡하고 Redis 값만 빠졌다.
  const withAll = (v) => ({ ...counts(100 + v, 20, 100 + v, 20), dbViews: 1000, bufSum: 0, bufKeys: 0, dedupKeys: 0 });
  const s = [
    sample('S0', withAll(0)),
    sample('S1', { sumLike: 100, sumDislike: 20, rowsLike: 100, rowsDislike: 20, dbViews: 1000 }),
    sample('S2', withAll(0)),
    sample('S3', withAll(5)),
  ];
  const [drift, view] = invariants.reconcile(['counter-drift', 'viewcount-conservation'], s, ctxOf(0, 0));
  // 반응 카운터는 S1 에도 값이 있으므로 pre 구간을 판정할 수 있다.
  assert.equal(drift.segments.find((x) => x.key === 'pre').status, 'idle');
  // 조회수는 S0·S3 만 쓰므로 S1 이 반쪽이어도 판정된다.
  assert.equal(view.segments.find((x) => x.key === 'run').status, 'idle');
});

test('유실도 콘솔이 잡아야 할 신호다 — 불일치만 보면 조회수 유실이 정합으로 나온다', () => {
  const [r] = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctxOf(703, 0));
  assert.equal(r.segments.filter((x) => x.status === 'mismatch').length, 0);
  assert.equal(r.segments.filter((x) => x.status === 'loss').length, 1);
});

test('시작 시 중복 마커가 남아 있으면 상한이라고 밝힌다', () => {
  // --flush-redis 없이 돌린 경우. 서버는 그만큼 중복으로 접는데 부하 쪽은 새 조회로 센다.
  const s = [sample('S0', views(1000, 0, 0, 420)), sample('S3', views(1500, 0, 0, 900))];
  const c = invariants.reconcile(['viewcount-conservation'], s, ctxOf(700, 0))[0]
    .segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.status, 'loss');
  assert.equal(c.exact, false);
  assert.match(c.note, /상한/);
  assert.match(c.note, /viewed:\*.*420/);
});

test('VU 가 사용자 수를 넘으면 상한이라고 밝힌다', () => {
  // 두 VU 가 같은 계정을 쓰면 서버는 한 사용자로 보고 중복을 접는다.
  const ctx = ctxOf(700, 0, { k6: { viewExpected: 700, viewUnknown: 0, all: { vusMax: 1400 } } });
  const c = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctx)[0]
    .segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.exact, false);
  assert.match(c.note, /1,400.*1,000/);
});

test('조건이 깨끗하면 숫자를 확정으로 표시한다', () => {
  const c = invariants.reconcile(['viewcount-conservation'], VIEW_OK, ctxOf(700, 0))[0]
    .segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.exact, true);
  assert.doesNotMatch(c.note, /상한/);
});

test('경고용 항목이 없는 옛 실행도 유실 수치는 낸다 — 모른다는 사실만 덧붙인다', () => {
  // dedupKeys 가 생기기 전에 저장된 표본.
  const old = [
    sample('S0', { dbViews: 1000, bufSum: 0, bufKeys: 0 }),
    sample('S3', { dbViews: 1500, bufSum: 0, bufKeys: 0 }),
  ];
  const c = invariants.reconcile(['viewcount-conservation'], old, ctxOf(597, 0))[0]
    .segments.find((x) => x.key === 'run').checks[0];
  assert.equal(c.status, 'loss');
  assert.equal(c.delta, -97);
  assert.equal(c.exact, false);
  assert.match(c.note, /남아 있었는지 모른다/);
});
