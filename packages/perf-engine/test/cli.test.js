'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { main } = require('../src/cli');
const { EXIT } = require('../src/errors');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-engine-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function sink() {
  const chunks = [];
  return { write: (s) => { chunks.push(s); }, text: () => chunks.join('') };
}

function runCli(argv, env = {}) {
  const out = sink();
  const err = sink();
  const code = main(argv, { env, cwd: tmp, out, err });
  return { code, out: out.text(), err: err.text() };
}

const workspaceDir = () => path.join(tmp, 'perf-engine');

describe('인자', () => {
  test('--help는 0', () => {
    const r = runCli(['--help']);
    assert.equal(r.code, EXIT.OK);
    assert.match(r.out, /사용법/);
  });

  test('--version은 package.json의 버전', () => {
    assert.equal(runCli(['--version']).out, `${require('../package.json').version}\n`);
  });

  test('명령이 없으면 2', () => {
    assert.equal(runCli([]).code, EXIT.USAGE);
  });

  test('모르는 명령은 2', () => {
    const r = runCli(['start']);
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.err, /알 수 없는 명령: start/);
  });

  test('모르는 옵션은 2', () => {
    assert.equal(runCli(['run', 'a.js', '--vus', '10']).code, EXIT.USAGE);
  });

  test('--dir 뒤에 경로가 없으면 2', () => {
    assert.equal(runCli(['init', '--dir']).code, EXIT.USAGE);
  });
});

describe('init', () => {
  test('작업 디렉터리와 config.json을 만든다', () => {
    const r = runCli(['init']);
    assert.equal(r.code, EXIT.OK);
    assert.ok(fs.existsSync(path.join(workspaceDir(), 'config.json')));
  });

  test('두 번째 init은 0이고 config.json을 그대로 둔다', () => {
    runCli(['init']);
    const file = path.join(workspaceDir(), 'config.json');
    fs.writeFileSync(file, '{ "k6": { "bin": "/opt/k6" } }');
    const r = runCli(['init']);
    assert.equal(r.code, EXIT.OK);
    assert.equal(fs.readFileSync(file, 'utf8'), '{ "k6": { "bin": "/opt/k6" } }');
  });

  test('--dir이 가리키는 곳에 만든다', () => {
    runCli(['init', '--dir', 'custom']);
    assert.ok(fs.existsSync(path.join(tmp, 'custom', 'config.json')));
  });

  test('인자를 받지 않는다', () => {
    assert.equal(runCli(['init', 'extra']).code, EXIT.USAGE);
  });
});

describe('run의 입력 검증', () => {
  test('스크립트가 없으면 2이고 디렉터리를 만들지 않는다', () => {
    assert.equal(runCli(['run']).code, EXIT.USAGE);
    assert.equal(fs.existsSync(workspaceDir()), false);
  });

  test('없는 스크립트는 2이고 디렉터리를 만들지 않는다', () => {
    const r = runCli(['run', 'missing.js']);
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.err, /missing\.js/);
    assert.equal(fs.existsSync(workspaceDir()), false);
  });

  test('스크립트 자리에 디렉터리를 주면 2', () => {
    fs.mkdirSync(path.join(tmp, 'dir.js'));
    assert.equal(runCli(['run', 'dir.js']).code, EXIT.USAGE);
  });

  test('스크립트를 둘 이상 주면 2', () => {
    fs.writeFileSync(path.join(tmp, 'a.js'), '');
    fs.writeFileSync(path.join(tmp, 'b.js'), '');
    assert.equal(runCli(['run', 'a.js', 'b.js']).code, EXIT.USAGE);
  });

  test('config가 잘못되면 2이고 부하 단계로 가지 않는다', () => {
    fs.writeFileSync(path.join(tmp, 'a.js'), '');
    fs.mkdirSync(workspaceDir());
    fs.writeFileSync(path.join(workspaceDir(), 'config.json'), '{ "k6": { "binary": "k6" } }');
    const r = runCli(['run', 'a.js']);
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.err, /k6\.binary/);
  });
});

test('bin이 main의 종료 코드를 프로세스 종료 코드로 넘긴다', () => {
  const bin = path.join(__dirname, '..', 'bin', 'perf-engine.js');
  const ok = spawnSync(process.execPath, [bin, '--version'], { cwd: tmp, encoding: 'utf8' });
  assert.equal(ok.status, EXIT.OK);
  const bad = spawnSync(process.execPath, [bin, 'start'], { cwd: tmp, encoding: 'utf8' });
  assert.equal(bad.status, EXIT.USAGE);
});
