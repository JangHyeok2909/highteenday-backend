'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireRunLock, processIsAlive } = require('../lib/run-lock');

function tempLock(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-run-lock-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'run.lock');
}

test('live perf-run lock rejects a concurrent run', (t) => {
  const lockPath = tempLock(t);
  const first = acquireRunLock(lockPath);
  t.after(() => first.release());
  assert.throws(() => acquireRunLock(lockPath), /다른 perf-run이 실행 중/);
});

test('released perf-run lock can be acquired again', (t) => {
  const lockPath = tempLock(t);
  const first = acquireRunLock(lockPath);
  first.release();
  const second = acquireRunLock(lockPath);
  second.release();
  assert.equal(fs.existsSync(lockPath), false);
});

test('stale perf-run lock is replaced', (t) => {
  const lockPath = tempLock(t);
  fs.writeFileSync(lockPath, JSON.stringify({ pid: Number.MAX_SAFE_INTEGER, token: 'stale' }));
  const current = acquireRunLock(lockPath);
  current.release();
  assert.equal(fs.existsSync(lockPath), false);
});

test('current process is detected as alive', () => {
  assert.equal(processIsAlive(process.pid), true);
});
