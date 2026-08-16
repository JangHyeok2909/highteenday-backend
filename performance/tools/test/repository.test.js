'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repo = require('../lib/repository');

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-repo-')), name);
}

test('writeJson: temp+rename 원자적 쓰기 — .tmp 잔여물이 남지 않는다', () => {
  const file = tmpFile('out.json');
  repo.writeJson(file, { a: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('writeJson: 기존 파일을 덮어쓴다 (Windows rename 포함)', () => {
  const file = tmpFile('out.json');
  repo.writeJson(file, { v: 1 });
  repo.writeJson(file, { v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 2 });
});

test('loadIndex: 파일이 없으면(첫 실행) 빈 인덱스', () => {
  const idx = repo.loadIndex(tmpFile('missing.json'));
  assert.deepEqual(idx.runs, []);
});

test('loadIndex: 손상된 JSON 은 빈 이력으로 대체하지 않고 예외를 던진다 (T-15 회귀 테스트)', () => {
  const file = tmpFile('index.json');
  fs.writeFileSync(file, '{"runs": [ 트렁케이트된 파');
  assert.throws(() => repo.loadIndex(file), /rebuild/);
});

test('loadIndex: runs 배열이 없는 형식 오류도 예외', () => {
  const file = tmpFile('index.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1 }));
  assert.throws(() => repo.loadIndex(file), /rebuild/);
});

test('loadIndex: 정상 인덱스는 그대로 반환', () => {
  const file = tmpFile('index.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, runs: [{ id: 'a' }] }));
  assert.equal(repo.loadIndex(file).runs.length, 1);
});

// ---------------------------------------------------------------------------
// findBaseline (T-02) — "직전 실행"이 아니라 "비교 가능한 가장 최근 실행"
// ---------------------------------------------------------------------------
const cmp = require('../lib/comparability');

const LOAD = (target) => ({ s: { executor: 'ramping-vus', stages: [{ duration: '5m', target }] } });

// measurementProfile 조건의 축약형(conditionsOf().read()가 만드는 모양) — entry()의
// conditions는 flatten된 값을 직접 구성하므로 이 형태로 넣는다.
const MP_STEADY = { mode: 'steady-state', warmupSec: 300, measureSec: 1200, rampdownSec: 120, gatePhase: 'measure' };
// current()는 실제 run.phasePlan(전체 스키마)을 넣는다 — conditionsOf()가 이걸 읽어서
// MP_STEADY와 같은 축약형으로 변환하는 실제 경로를 그대로 타야 한다.
const PLAN_STEADY = { schemaVersion: 1, ...MP_STEADY, measureStartOffsetSec: 300, measureEndOffsetSec: 1500 };

function entry(id, startedAt, over = {}) {
  const conditions = {
    scenario: 'normal-day',
    environment: 'perf',
    dataset: 'large',
    loadProfile: LOAD(200),
    scriptVersion: 'abc123',
    measurementProfile: MP_STEADY,
    // 부하 발생기 실행 방식. current() 쪽은 run 레코드를 conditionsOf 로 변환하는데,
    // 그 read()가 미기록을 'local'로 채운다(컨테이너 옵션이 생기기 전에는 그것뿐이었다).
    // 픽스처도 같은 값을 들고 있어야 실제 인덱스 엔트리와 형태가 같아진다.
    loadgen: 'local',
    ...over,
  };
  // 인덱스 엔트리는 평탄화된 conditions 를 그대로 들고 있고, dataset 조건은
  // {profile, fingerprint} 객체다. 픽스처는 프로파일 이름만 짧게 쓰므로 여기서 편다 —
  // 안 그러면 current() 쪽(run 레코드를 conditionsOf 로 변환)과 형태가 달라 전부 불일치가 된다.
  if (typeof conditions.dataset === 'string') {
    conditions.dataset = { profile: conditions.dataset, fingerprint: null };
  }
  return {
    id, startedAt, scenario: 'normal-day', thresholdsPassed: true,
    conditions, seriesHash: cmp.seriesHash(conditions),
  };
}

function indexWith(runs) {
  const file = tmpFile('index.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, runs }));
  return file;
}

function current(startedAt = '2026-08-05T00:00:00Z') {
  return { run: { id: 'cur', startedAt, scenario: 'normal-day', environment: 'perf', dataset: 'large', loadProfile: LOAD(200), scriptVersion: 'abc123', phasePlan: PLAN_STEADY } };
}

test('findBaseline: 조건이 같은 가장 최근 실행을 고른다', () => {
  const indexFile = indexWith([entry('a', '2026-08-01T00:00:00Z'), entry('b', '2026-08-03T00:00:00Z')]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'b');
  assert.equal(res.comparability.level, 'exact');
});

test('findBaseline: 조건이 다른 직전 실행은 건너뛰고 더 오래된 동일 조건을 고른다', () => {
  const indexFile = indexWith([
    entry('same-old', '2026-08-01T00:00:00Z'),
    entry('different', '2026-08-03T00:00:00Z', { dataset: 'small', loadProfile: LOAD(15) }),
  ]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'same-old', '시간상 직전이 아니라 비교 가능한 것을 골라야 한다');
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].id, 'different');
});

test('findBaseline: 비교 가능한 후보가 없으면 null + 탈락 사유', () => {
  const indexFile = indexWith([entry('x', '2026-08-01T00:00:00Z', { dataset: 'small' })]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.rejected[0].reasonCode, 'conditions');
  assert.ok(res.rejected[0].mismatches.some((m) => m.key === 'dataset' && m.materiality === 'blocking'));
});

test('findBaseline: 측정 불가(UNMEASURED) 실행은 기준선이 될 수 없다 (T-08)', () => {
  // thresholdsPassed 만으로는 걸러지지 않는다 — k6는 표본이 0건인 서브메트릭의 threshold를
  // 통과 처리하므로, 아무것도 재지 못한 실행도 thresholdsPassed:true 로 남는다.
  const indexFile = indexWith([
    entry('measured', '2026-08-01T00:00:00Z'),
    { ...entry('unmeasured', '2026-08-03T00:00:00Z'), measurementStatus: 'UNMEASURED' },
  ]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'measured', '시간상 직전이어도 측정 불가 실행은 건너뛴다');
  const rej = res.rejected.find((x) => x.id === 'unmeasured');
  assert.equal(rej.reasonCode, 'unmeasured', '사전 필터로 지우지 말고 탈락 사유를 남겨야 한다 (S-10)');
  assert.ok(repo.describeRejection(rej).length > 0);
});

test('findBaseline: measurementStatus 가 없는 과거 엔트리는 소급 탈락시키지 않는다', () => {
  const indexFile = indexWith([entry('legacy-but-valid', '2026-08-01T00:00:00Z')]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'legacy-but-valid');
});

test('findBaseline: 조건이 기록되지 않은 과거 실행은 기준선이 될 수 없다', () => {
  const indexFile = indexWith([{ id: 'legacy', startedAt: '2026-08-01T00:00:00Z', scenario: 'normal-day', thresholdsPassed: true }]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.rejected[0].reasonCode, 'conditions');
  assert.equal(res.rejected[0].mismatches[0].reason, 'unrecorded');
});

// ---------------------------------------------------------------------------
// S-10 — 기준선 자격(측정 무결성 + 비교 가능성)과 성능 통과 여부(threshold)의 분리.
// "느렸다"는 나쁜 결과지 잘못된 측정이 아니다. 개선 전후를 비교하려면 느린 Before가
// 기준선이어야 한다.
// ---------------------------------------------------------------------------
test('findBaseline: threshold 미달이어도 정상 측정된 실행은 기준선이 될 수 있다 (S-10)', () => {
  const slowButValid = {
    ...entry('slow-before', '2026-08-03T00:00:00Z'),
    thresholdsPassed: false,
    measurementStatus: 'MEASURED',
  };
  const indexFile = indexWith([entry('older-pass', '2026-08-01T00:00:00Z'), slowButValid]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'slow-before',
    'threshold 실패는 기준선 자격 조건이 아니다 — 더 오래된 통과 실행이 아니라 최신 후보를 골라야 한다');
  assert.equal(res.rejected.length, 0);
});

test('findBaseline: PARTIAL 이라도 참고 지표만 빠졌으면 기준선이 될 수 있다 (S-10)', () => {
  const partial = {
    ...entry('partial', '2026-08-03T00:00:00Z'),
    measurementStatus: 'PARTIAL',
    windowIncomplete: false,
  };
  const indexFile = indexWith([entry('older', '2026-08-01T00:00:00Z'), partial]);
  assert.equal(repo.findBaseline(current(), { indexFile }).baseline.id, 'partial',
    'k6 지연·오류율이 온전하면 Redis 같은 참고 지표 결측은 대조군 자격을 깨지 않는다');
});

test('findBaseline: measure 구간을 다 못 채운 실행은 기준선에서 제외된다 (S-10)', () => {
  const cut = {
    ...entry('cut-short', '2026-08-03T00:00:00Z'),
    measurementStatus: 'PARTIAL',
    windowIncomplete: true,
  };
  const indexFile = indexWith([entry('complete', '2026-08-01T00:00:00Z'), cut]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline.id, 'complete');
  const rej = res.rejected.find((x) => x.id === 'cut-short');
  assert.equal(rej.reasonCode, 'window-incomplete');
  assert.equal(rej.details.windowIncomplete, true);
});

test('findBaseline: 후보가 전부 탈락해도 first-run 이 아니다 — hadPriorCandidates 로 구분 (S-10)', () => {
  const indexFile = indexWith([
    { ...entry('unmeasured', '2026-08-01T00:00:00Z'), measurementStatus: 'UNMEASURED' },
    entry('wrong-dataset', '2026-08-02T00:00:00Z', { dataset: 'small' }),
  ]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.hadPriorCandidates, true, '과거 후보는 분명히 있었다');
  assert.deepEqual(res.rejected.map((r) => r.reasonCode).sort(), ['conditions', 'unmeasured']);
});

test('findBaseline: 과거 실행이 정말 없으면 hadPriorCandidates=false', () => {
  const indexFile = indexWith([entry('other-scenario', '2026-08-01T00:00:00Z', {}) ].map((e) => ({ ...e, scenario: 'school' })));
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.hadPriorCandidates, false);
  assert.equal(res.rejected.length, 0);
});

test('findBaseline: 미래 실행은 기준선이 되지 않는다', () => {
  const indexFile = indexWith([entry('later', '2026-08-09T00:00:00Z')]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.hadPriorCandidates, false, '미래 실행은 후보로 세지도 않는다');
});

test('eligibilityOf: 성능 결과(thresholdsPassed·verdict)는 자격 판정에 영향을 주지 않는다 (S-10)', () => {
  assert.equal(repo.eligibilityOf({ thresholdsPassed: false, verdict: 'FAIL', measurementStatus: 'MEASURED' }).eligible, true);
  assert.equal(repo.eligibilityOf({ measurementStatus: 'UNMEASURED', thresholdsPassed: true }).eligible, false);
  assert.equal(repo.eligibilityOf({ measurementStatus: 'PARTIAL', windowIncomplete: true }).eligible, false);
  assert.equal(repo.eligibilityOf({ measurementStatus: 'PARTIAL', windowIncomplete: false }).eligible, true);
  assert.equal(repo.eligibilityOf({}).eligible, true, '과거 레코드(값 없음)는 소급 탈락시키지 않는다');
});

test('describeRejection: 세 가지 사유 모두 사람이 읽을 문장을 만든다 (빈 칸 금지)', () => {
  const texts = [
    repo.describeRejection({ reasonCode: 'unmeasured' }),
    repo.describeRejection({ reasonCode: 'window-incomplete' }),
    repo.describeRejection({ reasonCode: 'conditions', mismatches: [] }),
    repo.describeRejection({
      reasonCode: 'conditions',
      mismatches: [{ materiality: 'blocking', desc: '데이터셋: small → large' }],
    }),
  ];
  for (const t of texts) assert.ok(t && t.trim().length > 0);
  assert.match(texts[0], /필수 지표/);
  assert.match(texts[1], /measure 구간/);
  assert.match(texts[3], /small → large/);
});

test('recentRuns: seriesHash 로 추세 계열을 가른다', () => {
  const big = entry('big', '2026-08-03T00:00:00Z');
  const small = entry('small', '2026-08-02T00:00:00Z', { dataset: 'small', loadProfile: LOAD(15) });
  const indexFile = indexWith([small, big]);
  const rows = repo.recentRuns({ scenario: 'normal-day', seriesHash: big.seriesHash, indexFile });
  assert.deepEqual(rows.map((r) => r.id), ['big']);
});

// ---------------------------------------------------------------------------
// toIndexEntry — 기준선 자격을 인덱스만 보고 판정하려면 windowIncomplete 가 있어야 한다(S-10).
// ---------------------------------------------------------------------------
const recordFor = (over = {}) => ({
  run: { id: 'r1', number: 1, scenario: 'normal-day', startedAt: '2026-08-05T00:00:00Z' },
  k6: { all: { vusMax: 200 }, phases: { measure: { p95: 100 } }, thresholdsPassed: false },
  infra: { flat: {}, window: {} },
  regression: { verdict: 'PASS', measurementStatus: 'MEASURED' },
  ...over,
});

test('toIndexEntry: regression.windowIncomplete 를 boolean 으로 저장한다', () => {
  const e = repo.toIndexEntry(recordFor({
    regression: { verdict: 'PASS', measurementStatus: 'PARTIAL', windowIncomplete: true },
  }));
  assert.equal(e.windowIncomplete, true);
  assert.equal(e.measurementStatus, 'PARTIAL');
  assert.equal(e.thresholdsPassed, false, 'threshold 결과는 지우지 않는다 — 표시용으로 남는다');
});

test('toIndexEntry: regression 에 값이 없으면 infra.window.incomplete 로 폴백한다', () => {
  const e = repo.toIndexEntry(recordFor({
    infra: { flat: {}, window: { incomplete: true } },
    regression: { verdict: 'PASS' },
  }));
  assert.equal(e.windowIncomplete, true);
});

test('toIndexEntry: 양쪽 모두 없는 과거 레코드는 null (소급 탈락 금지)', () => {
  const e = repo.toIndexEntry(recordFor({ infra: {}, regression: {} }));
  assert.equal(e.windowIncomplete, null);
  assert.equal(repo.eligibilityOf(e).eligible, true);
});

test('toIndexEntry: 정상 실행은 명시적 false 가 저장된다', () => {
  const e = repo.toIndexEntry(recordFor({
    regression: { verdict: 'PASS', measurementStatus: 'MEASURED', windowIncomplete: false },
  }));
  assert.equal(e.windowIncomplete, false);
});
