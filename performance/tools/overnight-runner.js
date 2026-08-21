#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cpuBench = require('./cpu-bench');
const { acquireRunLock } = require('./lib/run-lock');

const PERF_ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(PERF_ROOT, 'reports');
const OVERNIGHT = path.join(REPORTS, 'overnight');
const INDEX = path.join(REPORTS, 'index.json');
const STATE = path.join(OVERNIGHT, 'runner-state.json');
const STOP = path.join(OVERNIGHT, 'STOP');
const IDLE = path.join(REPORTS, 'idle-cpu-bench.jsonl');
const RUNNER_LOCK = path.join(require('os').tmpdir(), 'highteenday-overnight-runner.lock');

const smokeCommon = ['--dataset', 'smoke', '--loadgen', 'docker', '--no-gate',
  '--note', '스모크 배관 확인 — 밤새 목록 재개', '--quiet'];

function perfTask(id, scenario, args, options = {}) {
  return {
    id,
    scenario,
    expectedRuns: 1,
    acceptMeasuredExit: true,
    command: 'perf-run.js',
    args: [`scenarios/${scenario}.js`, ...args],
    ...options,
  };
}

function repeatTask(id, runs, args) {
  return {
    id,
    scenario: 'normal-day',
    expectedRuns: runs,
    command: 'repeatability.js',
    args: ['scenarios/normal-day.js', '--runs', String(runs), ...args],
  };
}

const TASKS = [
  perfTask('1-smoke-notification-heavy', 'notification-heavy',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-registration-day', 'registration-day',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-write-heavy', 'write-heavy',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-cache-warm', 'cache-warm',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-cold-start', 'cold-start',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-soak', 'soak',
    ['--vus', '5', '--warmup', '30', '--hold', '1m', ...smokeCommon]),
  perfTask('1-smoke-deep-paging', 'deep-paging',
    ['--vus', '5', '--duration', '1m', ...smokeCommon]),
  perfTask('1-smoke-chaos', 'chaos',
    ['--vus', '5', '--duration', '1m', ...smokeCommon]),
  perfTask('1-smoke-failover', 'failover',
    ['--vus', '5', '--duration', '1m', ...smokeCommon]),
  perfTask('1-smoke-breakpoint', 'breakpoint',
    [...smokeCommon, '-e', 'RAMP=2m', '-e', 'MAX_VUS=50', '-e', 'TARGET_RATE=20']),
  perfTask('1-smoke-spike', 'spike', [...smokeCommon, '-e', 'SPIKE_VUS=20']),
  perfTask('1-smoke-stress', 'stress', smokeCommon),

  repeatTask('2-normal-day-5m-x10', 10,
    ['--warmup', '180', '--hold', '5m', '--dataset', 'medium', '--env', 'perf',
      '--loadgen', 'docker', '--reset', 'restart',
      '--note', 'E-46 우선순위 7 — 예열인가 드리프트인가(연속 10회)']),
  repeatTask('3-normal-day-20m-x5', 5,
    ['--dataset', 'medium', '--env', 'perf', '--loadgen', 'docker', '--reset', 'restart',
      '--note', 'E-46 실험2 — 재부팅 후 20분 창 세트 (remote-write 첫 세트)']),
  perfTask('4-soak-2h', 'soak', ['--dataset', 'medium', '--loadgen', 'docker']),
  repeatTask('5-size-A1-medium', 5,
    ['--warmup', '180', '--hold', '5m', '--dataset', 'medium', '--env', 'perf',
      '--loadgen', 'docker', '--reset', 'restart', '--note', '크기 대조 A1 medium']),
  repeatTask('5-size-B-large', 5,
    ['--warmup', '180', '--hold', '5m', '--dataset', 'large', '--env', 'perf',
      '--loadgen', 'docker', '--reset', 'restart', '--note', '크기 대조 B large']),
  repeatTask('5-size-A2-medium', 5,
    ['--warmup', '180', '--hold', '5m', '--dataset', 'medium', '--env', 'perf',
      '--loadgen', 'docker', '--reset', 'restart', '--note', '크기 대조 A2 medium']),
  repeatTask('6-normal-day-flush-x5', 5,
    ['--warmup', '180', '--hold', '5m', '--dataset', 'medium', '--env', 'perf-flush',
      '--loadgen', 'docker', '--reset', 'flush',
      '--note', 'CV 분해 — 앱 재시작 없이 Redis만 비움(JIT 웜업 성분 제거)']),
];

const LONG_TASK_INDEX = TASKS.findIndex((t) => t.id === '2-normal-day-5m-x10');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function now() {
  return new Date().toISOString();
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function loadIndex() {
  const parsed = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  if (!Array.isArray(parsed.runs)) throw new Error('reports/index.json에 runs 배열이 없습니다.');
  return parsed.runs;
}

function runIds() {
  return new Set(loadIndex().map((r) => r.id));
}

function loadRun(id) {
  return JSON.parse(fs.readFileSync(path.join(REPORTS, 'runs', id, 'run.json'), 'utf8'));
}

function validateRun(id, expectedScenario) {
  const rec = loadRun(id);
  if (rec.run?.scenario !== expectedScenario) {
    throw new Error(`${id}: 시나리오가 ${rec.run?.scenario} (예상 ${expectedScenario})`);
  }
  if (rec.measurementStatus === 'UNMEASURED') {
    throw new Error(`${id}: measurementStatus=UNMEASURED`);
  }
  const measure = rec.k6?.phases?.measure;
  if (!measure || !(measure.httpReqs > 0)) {
    throw new Error(`${id}: phases.measure 요청 표본이 없습니다.`);
  }
  const infraCount = Object.keys(rec.infra?.flat || {}).length;
  if (infraCount < 20) {
    throw new Error(`${id}: infra.flat 항목이 ${infraCount}개뿐입니다.`);
  }
  return {
    id,
    measurementStatus: rec.measurementStatus,
    verdict: rec.regression?.verdict || rec.verdict || null,
    measureHttpReqs: measure.httpReqs,
    infraCount,
    p95: measure.p95,
  };
}

function appendIdleBench(bench, purpose) {
  fs.appendFileSync(IDLE, JSON.stringify({ at: now(), purpose, bench }) + '\n');
}

async function waitForNormalEnvironment(state) {
  const min = 4950;
  const max = 5050;
  while (true) {
    if (fs.existsSync(STOP)) return false;
    console.log(`[${now()}] 장시간 측정 전 CPU 환경 게이트 실행`);
    const bench = cpuBench.bench({ repeat: 3 });
    appendIdleBench(bench, 'pre-long-run-gate');
    const single = bench.axes?.single?.ms;
    state.environmentGate = { at: now(), expectedSingleMs: [min, max], observedSingleMs: single };
    writeJsonAtomic(STATE, state);
    if (Number.isFinite(single) && single >= min && single <= max) {
      console.log(`[${now()}] CPU 환경 정상: single ${single}ms`);
      return true;
    }
    console.warn(`[${now()}] CPU 환경 비정상: single ${single ?? '결측'}ms (정상 ${min}~${max}ms). 10분 뒤 재확인.`);
    await sleep(10 * 60 * 1000);
  }
}

function runTask(task, state) {
  const before = runIds();
  const script = path.join(__dirname, task.command);
  console.log(`\n[${now()}] 시작 ${task.id}`);
  console.log(`  ${process.execPath} ${path.relative(PERF_ROOT, script)} ${task.args.join(' ')}`);
  const startedAt = now();
  const result = spawnSync(process.execPath, [script, ...task.args], {
    cwd: PERF_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const after = loadIndex();
  const added = after.filter((r) => !before.has(r.id)).map((r) => r.id);

  const taskResult = {
    id: task.id,
    startedAt,
    endedAt: now(),
    exitCode: result.status,
    signal: result.signal || null,
    runIds: added,
  };

  if (result.error) throw new Error(`${task.id}: 실행 실패 — ${result.error.message}`);
  if (added.length !== task.expectedRuns) {
    throw new Error(`${task.id}: 새 실행 ${added.length}개 (예상 ${task.expectedRuns}개), exit=${result.status}`);
  }
  taskResult.validation = added.map((id) => validateRun(id, task.scenario));
  if (result.status !== 0 && !task.acceptMeasuredExit) {
    throw new Error(`${task.id}: 종료 코드 ${result.status}`);
  }
  taskResult.status = result.status === 0 ? 'completed' : 'completed-measured-failure';
  state.completed.push(taskResult);
  state.current = null;
  writeJsonAtomic(STATE, state);
  console.log(`[${now()}] 완료 ${task.id} — exit ${result.status}, runs ${added.join(', ')}`);
}

async function idleMonitor(state) {
  state.phase = 'idle-monitoring';
  writeJsonAtomic(STATE, state);
  console.log(`[${now()}] 모든 유한 실행 완료. 10분 간격 유휴 CPU 벤치를 시작합니다.`);
  while (!fs.existsSync(STOP)) {
    const bench = cpuBench.bench({ repeat: 1 });
    appendIdleBench(bench, 'post-run-idle');
    state.lastIdleBenchAt = now();
    writeJsonAtomic(STATE, state);
    await sleep(10 * 60 * 1000);
  }
}

async function main() {
  fs.mkdirSync(OVERNIGHT, { recursive: true });
  let runnerLock;
  try {
    runnerLock = acquireRunLock(RUNNER_LOCK);
  } catch (e) {
    console.error(`밤새 실행기 시작 거부: ${e.message}`);
    process.exit(2);
  }
  process.once('exit', () => runnerLock.release());

  if (process.argv.includes('--list')) {
    for (const task of TASKS) console.log(task.id);
    return;
  }
  if (fs.existsSync(STOP)) {
    console.error(`중지 파일이 있습니다: ${STOP}`);
    process.exit(2);
  }

  const state = {
    schemaVersion: 1,
    pid: process.pid,
    node: process.version,
    startedAt: now(),
    phase: 'running',
    precompleted: [
      '1-smoke-read-heavy',
      '1-smoke-peak-hour',
      '1-smoke-exam-week',
      '1-smoke-chat-heavy',
    ],
    current: null,
    completed: [],
    failed: null,
  };
  writeJsonAtomic(STATE, state);
  console.log(`[${now()}] 밤새 실행기 시작 PID ${process.pid}, 남은 유한 작업 ${TASKS.length}개`);

  try {
    for (let i = 0; i < TASKS.length; i++) {
      if (fs.existsSync(STOP)) break;
      if (i === LONG_TASK_INDEX) {
        state.phase = 'waiting-environment-gate';
        writeJsonAtomic(STATE, state);
        if (!await waitForNormalEnvironment(state)) break;
        state.phase = 'running-long';
      }
      state.current = { id: TASKS[i].id, startedAt: now() };
      writeJsonAtomic(STATE, state);
      runTask(TASKS[i], state);
    }
    if (!fs.existsSync(STOP) && state.completed.length === TASKS.length) {
      await idleMonitor(state);
    }
    state.phase = 'stopped';
    state.stoppedAt = now();
    writeJsonAtomic(STATE, state);
  } catch (e) {
    state.phase = 'failed';
    state.failed = { at: now(), task: state.current?.id || null, message: e.stack || e.message };
    writeJsonAtomic(STATE, state);
    console.error(`\n[${now()}] 실행기 중단: ${e.stack || e.message}`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(2);
});
