'use strict';

const fs = require('fs');
const path = require('path');
const { UsageError } = require('./errors');

const DEFAULT_DIR = 'perf-engine';
const DIR_ENV = 'PERF_ENGINE_DIR';
const CONFIG_FILE = 'config.json';
const SCHEMA_VERSION = 1;

/** 검증 대상이 아닌 최상위 키. */
const META_KEYS = new Set(['$schema', 'schemaVersion']);

/**
 * 설정 항목. 값의 우선순위는 CLI > 환경변수 > config 파일 > 기본값이다.
 * 항목을 추가하면 config 검증과 출처 추적이 함께 적용된다.
 */
const FIELDS = [
  { key: 'k6.bin', env: 'PERF_ENGINE_K6_BIN', default: 'k6', type: 'string' },
];

const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/**
 * 작업 디렉터리의 절대 경로. config 파일이 이 디렉터리 안에 있으므로 config로는 정할 수 없고,
 * CLI > 환경변수 > 기본값 순서로만 정한다.
 */
function resolveDir({ cliDir, env = process.env, cwd = process.cwd() } = {}) {
  const raw = cliDir || env[DIR_ENV] || DEFAULT_DIR;
  return path.resolve(cwd, raw);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function checkType(field, value, where) {
  if (field.type === 'string' && (typeof value !== 'string' || value.trim() === '')) {
    throw new UsageError(`${where}: ${field.key} 는 비어 있지 않은 문자열이어야 합니다`);
  }
}

/**
 * config 객체를 검사한다. 모르는 키는 오타일 가능성이 높으므로 무시하지 않고 거부한다.
 * @throws {UsageError}
 */
function validateConfig(config, where) {
  if (!isPlainObject(config)) {
    throw new UsageError(`${where}: 최상위가 JSON 객체여야 합니다`);
  }
  if (config.schemaVersion !== undefined && config.schemaVersion !== SCHEMA_VERSION) {
    throw new UsageError(
      `${where}: schemaVersion ${JSON.stringify(config.schemaVersion)} 은 지원하지 않습니다 (지원: ${SCHEMA_VERSION})`,
    );
  }

  const body = {};
  for (const [k, v] of Object.entries(config)) if (!META_KEYS.has(k)) body[k] = v;

  const allowed = FIELDS.map((f) => f.key).join(', ');
  for (const [key, value] of Object.entries(flatten(body))) {
    const field = FIELD_BY_KEY.get(key);
    if (field) {
      checkType(field, value, where);
      continue;
    }
    if (FIELDS.some((f) => f.key.startsWith(`${key}.`))) {
      throw new UsageError(`${where}: ${key} 는 객체여야 합니다`);
    }
    throw new UsageError(`${where}: 알 수 없는 설정 키 ${key} (허용: ${allowed})`);
  }
}

/**
 * 작업 디렉터리의 config.json을 읽는다. 파일이 없으면 config는 null이다.
 * @returns {{file: string, config: object|null}}
 * @throws {UsageError} 읽을 수 없거나, JSON이 아니거나, 검증에 실패할 때
 */
function loadConfigFile(dir) {
  const file = path.join(dir, CONFIG_FILE);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { file, config: null };
    if (e.code === 'ENOTDIR') throw new UsageError(`${dir}: 디렉터리가 아니라 파일입니다`);
    throw new UsageError(`${file}: 읽을 수 없습니다 (${e.code})`);
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    throw new UsageError(`${file}: JSON 형식이 아닙니다 (${e.message})`);
  }
  validateConfig(config, file);
  return { file, config };
}

/**
 * 항목별 값과 출처를 돌려준다. 보고서는 출처가 'default'인 항목을 "기본값(미설정)"으로
 * 표시하므로, 사용자가 넣지 않은 값의 출처를 다른 것으로 바꾸면 안 된다.
 * @returns {Object<string, {value: *, source: 'cli'|'env'|'config'|'default'}>}
 */
function resolveSettings({ cli = {}, env = process.env, config = null } = {}) {
  const fromFile = config ? flatten(config) : {};
  const out = {};
  for (const f of FIELDS) {
    if (cli[f.key] !== undefined) {
      out[f.key] = { value: cli[f.key], source: 'cli' };
    } else if (f.env && env[f.env] !== undefined && env[f.env] !== '') {
      checkType(f, env[f.env], `환경변수 ${f.env}`);
      out[f.key] = { value: env[f.env], source: 'env' };
    } else if (fromFile[f.key] !== undefined) {
      out[f.key] = { value: fromFile[f.key], source: 'config' };
    } else {
      out[f.key] = { value: f.default, source: 'default' };
    }
  }
  return out;
}

module.exports = {
  CONFIG_FILE,
  DEFAULT_DIR,
  DIR_ENV,
  FIELDS,
  SCHEMA_VERSION,
  loadConfigFile,
  resolveDir,
  resolveSettings,
  validateConfig,
};
