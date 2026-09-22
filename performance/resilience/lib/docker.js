/**
 * 컨테이너 층 주입 — docker CLI 직접 호출과 pumba.
 *
 * docker 직접: stop/start/pause/unpause/kill/restart. 실행기가 시각을 통제해야 하므로 동기로
 * 실행하고 결과를 돌려준다. `docker stop` 은 SIGTERM 뒤 10초 유예가 있어 시각이 밀린다 —
 * 그래서 crash 는 기본 `-t 1` 로 보낸다(Redis 는 즉시 종료된다).
 *
 * pumba: stress(CPU·메모리 압박)처럼 docker CLI 로는 못 만드는 것에 쓴다. pumba 는 자기가
 * `--duration` 동안 블로킹하므로 **비동기로** 띄우고 종료를 기다리지 않는다. 실행기가
 * 끝날 때 남아 있으면 죽인다.
 *
 * 사용 전 확인: `docker inspect <container>` 로 상태를 읽는 `state()`. 정리(cleanup) 경로가
 * "paused 면 unpause, exited 면 start" 를 이 값으로 정한다.
 */
'use strict';

const { spawnSync, spawn } = require('child_process');

const PUMBA_IMAGE = process.env.PUMBA_IMAGE || 'gaiaadm/pumba:0.10.1';
// Docker Desktop(Windows) 에서도 docker.sock 마운트는 이 경로로 동작한다.
const DOCKER_SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';

function docker(args, { allowFail = false } = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.error) throw new Error(`docker 실행 실패: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) {
    throw new Error(`docker ${args.join(' ')} → exit ${r.status}: ${(r.stderr || '').trim().slice(0, 300)}`);
  }
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

/** 'running' | 'paused' | 'exited' | 'missing' | 기타 docker 상태 문자열 */
function state(container) {
  const r = docker(['inspect', '--format', '{{.State.Status}}', container], { allowFail: true });
  if (r.status !== 0) return 'missing';
  return r.stdout;
}

/**
 * 컨테이너 환경변수 전체를 Map 으로 읽는다.
 *
 * 설정을 여러 개 읽을 때 `envOf` 를 반복 호출하면 그만큼 `docker inspect` 가 실행되고,
 * 그 사이에 컨테이너가 재생성되면 서로 다른 대상의 값이 섞인다. 한 번에 읽어 둔다.
 */
function envAll(container) {
  const out = new Map();
  const r = docker(['inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', container], { allowFail: true });
  if (r.status !== 0) return out;
  for (const line of r.stdout.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return out;
}

/** 컨테이너 환경변수 하나를 읽는다 — 앱이 프록시를 거치는지(DB_URL) 확인하는 용도. */
function envOf(container, key) {
  const v = envAll(container).get(key);
  return v == null ? null : v;
}

const ACTIONS = {
  stop: (c, step) => docker(['stop', '-t', String(step.graceSec != null ? step.graceSec : 1), c]),
  start: (c) => docker(['start', c]),
  pause: (c) => docker(['pause', c]),
  unpause: (c) => docker(['unpause', c]),
  kill: (c, step) => docker(['kill', '--signal', step.signal || 'KILL', c]),
  restart: (c, step) => docker(['restart', '-t', String(step.graceSec != null ? step.graceSec : 1), c]),
};

function act(step) {
  const fn = ACTIONS[step.action];
  if (!fn) throw new Error(`docker action 을 모른다: ${step.action} (지원: ${Object.keys(ACTIONS).join(', ')})`);
  if (!step.container) throw new Error(`docker step 에 container 가 없다: ${JSON.stringify(step)}`);
  const before = state(step.container);
  fn(step.container, step);
  return { before, after: state(step.container) };
}

/**
 * 컨테이너를 실행 중 상태로 되돌린다 — 정리 경로. 어떤 상태에서 시작하든 running 으로.
 * 반환: 취한 조치 (없으면 null).
 */
function ensureRunning(container) {
  const s = state(container);
  if (s === 'paused') { docker(['unpause', container]); return 'unpause'; }
  if (s === 'exited' || s === 'created') { docker(['start', container]); return 'start'; }
  return null;
}

/** pumba 를 비동기로 띄운다. 반환: child process (실행기가 종료 시 kill 한다). */
function pumba(args, log = () => {}) {
  const full = ['run', '--rm', '-v', `${DOCKER_SOCK}:/var/run/docker.sock`, PUMBA_IMAGE, ...args];
  const child = spawn('docker', full, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => log(`[pumba] ${String(d).trim()}`));
  child.stderr.on('data', (d) => log(`[pumba] ${String(d).trim()}`));
  child.on('error', (e) => log(`[pumba] 실행 실패: ${e.message}`));
  return child;
}

module.exports = { docker, state, envOf, envAll, act, ensureRunning, pumba, ACTIONS };
