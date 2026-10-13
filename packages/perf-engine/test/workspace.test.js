'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const workspace = require('../src/workspace');
const settings = require('../src/settings');
const { UsageError } = require('../src/errors');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-engine-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

test('ensureWorkspace가 중첩 경로까지 만들고 캐시를 git에서 뺀다', () => {
  const dir = path.join(tmp, 'a', 'b');
  workspace.ensureWorkspace(dir);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.cache/\n');
});

test('ensureWorkspace는 이미 있는 .gitignore를 덮어쓰지 않는다', () => {
  fs.writeFileSync(path.join(tmp, '.gitignore'), 'mine\n');
  workspace.ensureWorkspace(tmp);
  assert.equal(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8'), 'mine\n');
});

test('ensureWorkspace는 경로에 파일이 있으면 거부', () => {
  const file = path.join(tmp, 'file');
  fs.writeFileSync(file, '');
  assert.throws(() => workspace.ensureWorkspace(file), UsageError);
});

test('initWorkspace는 기본값을 파일에 적지 않는다', () => {
  const dir = path.join(tmp, 'ws');
  const { created, file } = workspace.initWorkspace(dir);
  assert.equal(created, true);

  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(config, { schemaVersion: 1 });
  // 파일에 기본값이 적혀 있으면 출처가 config로 바뀌어 "기본값(미설정)" 표시가 사라진다.
  assert.equal(settings.resolveSettings({ env: {}, config })['k6.bin'].source, 'default');
});

test('initWorkspace는 기존 config.json을 덮어쓰지 않는다', () => {
  fs.writeFileSync(path.join(tmp, 'config.json'), '{ "k6": { "bin": "/opt/k6" } }');
  const { created } = workspace.initWorkspace(tmp);
  assert.equal(created, false);
  assert.equal(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8'), '{ "k6": { "bin": "/opt/k6" } }');
});
