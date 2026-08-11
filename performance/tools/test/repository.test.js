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

function entry(id, startedAt, over = {}) {
  const conditions = {
    scenario: 'normal-day',
    environment: 'perf',
    dataset: 'large',
    loadProfile: LOAD(200),
    scriptVersion: 'abc123',
    ...over,
  };
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
  return { run: { id: 'cur', startedAt, scenario: 'normal-day', environment: 'perf', dataset: 'large', loadProfile: LOAD(200), scriptVersion: 'abc123' } };
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
  assert.ok(res.rejected[0].mismatches.some((m) => m.key === 'dataset' && m.materiality === 'blocking'));
});

test('findBaseline: 조건이 기록되지 않은 과거 실행은 기준선이 될 수 없다', () => {
  const indexFile = indexWith([{ id: 'legacy', startedAt: '2026-08-01T00:00:00Z', scenario: 'normal-day', thresholdsPassed: true }]);
  const res = repo.findBaseline(current(), { indexFile });
  assert.equal(res.baseline, null);
  assert.equal(res.rejected[0].mismatches[0].reason, 'unrecorded');
});

test('findBaseline: threshold 미달 실행은 기준선에서 제외된다', () => {
  const bad = { ...entry('bad', '2026-08-03T00:00:00Z'), thresholdsPassed: false };
  const indexFile = indexWith([entry('good', '2026-08-01T00:00:00Z'), bad]);
  assert.equal(repo.findBaseline(current(), { indexFile }).baseline.id, 'good');
});

test('findBaseline: 미래 실행은 기준선이 되지 않는다', () => {
  const indexFile = indexWith([entry('later', '2026-08-09T00:00:00Z')]);
  assert.equal(repo.findBaseline(current(), { indexFile }).baseline, null);
});

test('recentRuns: seriesHash 로 추세 계열을 가른다', () => {
  const big = entry('big', '2026-08-03T00:00:00Z');
  const small = entry('small', '2026-08-02T00:00:00Z', { dataset: 'small', loadProfile: LOAD(15) });
  const indexFile = indexWith([small, big]);
  const rows = repo.recentRuns({ scenario: 'normal-day', seriesHash: big.seriesHash, indexFile });
  assert.deepEqual(rows.map((r) => r.id), ['big']);
});
