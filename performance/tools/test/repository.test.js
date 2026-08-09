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
