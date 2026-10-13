'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const settings = require('../src/settings');
const { UsageError } = require('../src/errors');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-engine-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function writeConfig(text) {
  fs.writeFileSync(path.join(tmp, 'config.json'), text);
}

describe('resolveDir', () => {
  test('아무것도 없으면 cwd 아래 기본 디렉터리', () => {
    assert.equal(settings.resolveDir({ env: {}, cwd: '/p' }), path.resolve('/p', 'perf-engine'));
  });

  test('환경변수가 기본값보다 우선', () => {
    assert.equal(settings.resolveDir({ env: { PERF_ENGINE_DIR: 'x' }, cwd: '/p' }), path.resolve('/p', 'x'));
  });

  test('CLI가 환경변수보다 우선', () => {
    const dir = settings.resolveDir({ cliDir: 'y', env: { PERF_ENGINE_DIR: 'x' }, cwd: '/p' });
    assert.equal(dir, path.resolve('/p', 'y'));
  });
});

describe('loadConfigFile', () => {
  test('파일이 없으면 config는 null', () => {
    assert.equal(settings.loadConfigFile(tmp).config, null);
  });

  test('디렉터리가 없어도 config는 null', () => {
    assert.equal(settings.loadConfigFile(path.join(tmp, 'none')).config, null);
  });

  test('JSON이 아니면 파일 경로를 담아 거부', () => {
    writeConfig('{ "k6": ');
    assert.throws(() => settings.loadConfigFile(tmp), (e) => e instanceof UsageError && e.message.includes('config.json'));
  });

  test('최상위가 배열이면 거부', () => {
    writeConfig('[]');
    assert.throws(() => settings.loadConfigFile(tmp), UsageError);
  });

  test('모르는 최상위 키를 거부하고 키 이름을 알려 준다', () => {
    writeConfig('{ "k7": { "bin": "k6" } }');
    assert.throws(() => settings.loadConfigFile(tmp), /k7\.bin/);
  });

  test('모르는 하위 키를 거부', () => {
    writeConfig('{ "k6": { "binary": "k6" } }');
    assert.throws(() => settings.loadConfigFile(tmp), /k6\.binary/);
  });

  test('객체여야 할 자리에 값이 오면 거부', () => {
    writeConfig('{ "k6": "k6" }');
    assert.throws(() => settings.loadConfigFile(tmp), /k6 는 객체여야/);
  });

  test('타입이 틀리면 거부', () => {
    writeConfig('{ "k6": { "bin": 3 } }');
    assert.throws(() => settings.loadConfigFile(tmp), /k6\.bin/);
  });

  test('지원하지 않는 schemaVersion을 거부', () => {
    writeConfig('{ "schemaVersion": 2 }');
    assert.throws(() => settings.loadConfigFile(tmp), /schemaVersion/);
  });

  test('$schema와 schemaVersion은 설정 키로 취급하지 않는다', () => {
    writeConfig('{ "$schema": "./schema.json", "schemaVersion": 1 }');
    assert.deepEqual(settings.loadConfigFile(tmp).config, { $schema: './schema.json', schemaVersion: 1 });
  });

  test('경로가 파일이면 디렉터리가 아니라고 알려 준다', () => {
    const file = path.join(tmp, 'file');
    fs.writeFileSync(file, '');
    assert.throws(() => settings.loadConfigFile(file), /디렉터리가 아니라 파일/);
  });
});

describe('resolveSettings', () => {
  test('아무것도 없으면 기본값이고 출처는 default', () => {
    assert.deepEqual(settings.resolveSettings({ env: {} })['k6.bin'], { value: 'k6', source: 'default' });
  });

  test('config가 기본값보다 우선', () => {
    const r = settings.resolveSettings({ env: {}, config: { k6: { bin: '/opt/k6' } } });
    assert.deepEqual(r['k6.bin'], { value: '/opt/k6', source: 'config' });
  });

  test('환경변수가 config보다 우선', () => {
    const r = settings.resolveSettings({ env: { PERF_ENGINE_K6_BIN: '/env/k6' }, config: { k6: { bin: '/opt/k6' } } });
    assert.deepEqual(r['k6.bin'], { value: '/env/k6', source: 'env' });
  });

  test('빈 환경변수는 설정하지 않은 것으로 본다', () => {
    const r = settings.resolveSettings({ env: { PERF_ENGINE_K6_BIN: '' }, config: { k6: { bin: '/opt/k6' } } });
    assert.equal(r['k6.bin'].source, 'config');
  });

  test('CLI가 환경변수보다 우선', () => {
    const r = settings.resolveSettings({ cli: { 'k6.bin': '/cli/k6' }, env: { PERF_ENGINE_K6_BIN: '/env/k6' } });
    assert.deepEqual(r['k6.bin'], { value: '/cli/k6', source: 'cli' });
  });

  test('공백뿐인 환경변수 값은 거부', () => {
    assert.throws(() => settings.resolveSettings({ env: { PERF_ENGINE_K6_BIN: '  ' } }), /PERF_ENGINE_K6_BIN/);
  });
});
