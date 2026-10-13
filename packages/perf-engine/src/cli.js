'use strict';

const fs = require('fs');
const path = require('path');
const { EXIT, UsageError, RunError } = require('./errors');
const settings = require('./settings');
const workspace = require('./workspace');
const pkg = require('../package.json');

const USAGE = `사용법:
  perf-engine init [--dir <경로>]
  perf-engine run <k6 스크립트> [--dir <경로>]
  perf-engine --help | --version

--dir 를 주지 않으면 ${settings.DIR_ENV}, 그것도 없으면 ./${settings.DEFAULT_DIR} 를 작업 디렉터리로 쓴다.`;

function parseArgs(argv) {
  const opts = { command: null, positional: [], dir: null, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--version' || a === '-v') {
      opts.version = true;
    } else if (a === '--dir') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new UsageError('--dir 뒤에 경로가 없습니다');
      opts.dir = v;
    } else if (a.startsWith('-')) {
      throw new UsageError(`알 수 없는 옵션: ${a}`);
    } else if (opts.command === null) {
      opts.command = a;
    } else {
      opts.positional.push(a);
    }
  }
  return opts;
}

function init(dir, opts, out) {
  if (opts.positional.length > 0) throw new UsageError('init 은 인자를 받지 않습니다');
  const { created, file } = workspace.initWorkspace(dir);
  out.write(created ? `만들었습니다: ${file}\n` : `이미 있어 그대로 둡니다: ${file}\n`);
  return EXIT.OK;
}

function run(dir, opts, { env, cwd }) {
  const [script, ...rest] = opts.positional;
  if (!script) throw new UsageError('실행할 k6 스크립트를 지정하세요');
  if (rest.length > 0) throw new UsageError(`run 은 스크립트 하나만 받습니다: ${rest.join(' ')}`);

  const scriptPath = path.resolve(cwd, script);
  if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
    throw new UsageError(`스크립트를 찾을 수 없습니다: ${script}`);
  }

  // 입력 검증이 모두 끝난 뒤에 디렉터리를 만든다. 잘못된 입력으로 빈 디렉터리가 남지 않게 한다.
  const { config } = settings.loadConfigFile(dir);
  settings.resolveSettings({ env, config });
  workspace.ensureWorkspace(dir);

  // TODO(DESIGN.md 1번 바퀴): k6 실행과 run.json 작성으로 교체하면 이 예외를 지운다.
  throw new RunError('run 의 k6 실행 단계는 아직 구현되지 않았습니다');
}

/**
 * CLI 진입점. 예상한 오류는 메시지와 종료 코드로 바꾸고, 예상하지 못한 오류는 그대로 던진다.
 * @returns {number} 종료 코드
 */
function main(argv, { env = process.env, cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.version) {
      out.write(`${pkg.version}\n`);
      return EXIT.OK;
    }
    if (opts.help) {
      out.write(`${USAGE}\n`);
      return EXIT.OK;
    }
    if (opts.command === null) throw new UsageError('명령을 지정하세요');

    const dir = settings.resolveDir({ cliDir: opts.dir, env, cwd });
    switch (opts.command) {
      case 'init':
        return init(dir, opts, out);
      case 'run':
        return run(dir, opts, { env, cwd });
      default:
        throw new UsageError(`알 수 없는 명령: ${opts.command}`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      err.write(`${e.message}\n\n${USAGE}\n`);
      return e.exitCode;
    }
    if (e instanceof RunError) {
      err.write(`${e.message}\n`);
      return e.exitCode;
    }
    throw e;
  }
}

module.exports = { main, parseArgs };
