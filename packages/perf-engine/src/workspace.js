'use strict';

const fs = require('fs');
const path = require('path');
const { UsageError } = require('./errors');
const { CONFIG_FILE, SCHEMA_VERSION } = require('./settings');

const CACHE_DIR = '.cache';

/**
 * 작업 디렉터리를 만든다. 이미 있으면 그대로 둔다.
 *
 * `.cache/`(실행 목록 캐시)는 사용자가 runs/를 커밋하든 않든 git에서 빠져야 한다. 사용자의
 * .gitignore는 건드리지 않으므로 작업 디렉터리 안에 .gitignore를 두어 제외한다.
 * @throws {UsageError} 경로에 디렉터리가 아닌 파일이 있을 때
 */
function ensureWorkspace(dir) {
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
    throw new UsageError(`${dir}: 디렉터리가 아니라 파일입니다`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, `${CACHE_DIR}/\n`);
}

/**
 * 작업 디렉터리와 config.json을 만든다. 기존 config.json은 덮어쓰지 않는다.
 *
 * 기본값을 파일에 적지 않는다. 적으면 사용자가 고르지 않은 값도 출처가 'config'가 되어
 * 보고서의 "기본값(미설정)" 표시가 사라진다.
 * @returns {{created: boolean, file: string}}
 */
function initWorkspace(dir) {
  ensureWorkspace(dir);
  const file = path.join(dir, CONFIG_FILE);
  try {
    fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION }, null, 2)}\n`, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') return { created: false, file };
    throw e;
  }
  return { created: true, file };
}

module.exports = { CACHE_DIR, ensureWorkspace, initWorkspace };
