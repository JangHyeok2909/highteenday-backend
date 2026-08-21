'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const WORKSPACE_KEY = crypto
  .createHash('sha256')
  .update(path.resolve(__dirname, '..', '..'))
  .digest('hex')
  .slice(0, 12);
const DEFAULT_LOCK_PATH = path.join(os.tmpdir(), `highteenday-perf-run-${WORKSPACE_KEY}.lock`);

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function acquireRunLock(lockPath = DEFAULT_LOCK_PATH) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = crypto.randomBytes(12).toString('hex');
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify({
          pid: process.pid,
          token,
          startedAt: new Date().toISOString(),
          command: process.argv.join(' '),
        }));
      } finally {
        fs.closeSync(fd);
      }

      return {
        path: lockPath,
        release() {
          const current = readLock(lockPath);
          if (current && current.token === token) {
            try { fs.unlinkSync(lockPath); } catch (e) {
              if (e.code !== 'ENOENT') throw e;
            }
          }
        },
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const existing = readLock(lockPath);
      if (existing && processIsAlive(existing.pid)) {
        throw new Error(
          `다른 perf-run이 실행 중입니다 (PID ${existing.pid}, 시작 ${existing.startedAt || '알 수 없음'}). ` +
          '같은 성능 스택에서 동시 측정할 수 없습니다.',
        );
      }
      try { fs.unlinkSync(lockPath); } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
    }
  }
  throw new Error('성능 실행 잠금을 획득하지 못했습니다.');
}

module.exports = { acquireRunLock, processIsAlive, DEFAULT_LOCK_PATH };
