#!/usr/bin/env node
'use strict';
/**
 * idle-bench-logger — 부하와 **무관하게** 환경 속도가 움직이는지 재는 시계열.
 *
 * 왜 필요한가
 * -----------
 * 지금까지 CPU 대조 벤치는 전부 **부하 실행에 붙여서** 찍었다. 그래서 값이 흔들려도 그게
 * 시간 탓인지 부하 탓인지 가르지 못했다. 부하 없이 일정 간격으로 찍으면 "부하와 무관하게
 * 시간만 흘러도 환경이 느려지는가"에 독립적으로 답하는 계열이 처음 생긴다.
 *
 * 이게 지금 최우선인 이유는 실험 6(perf-session-drift.md 8-b절)이 밝힌 것 때문이다.
 * 성능 레벨이 **시간당 규모로 양방향** 움직인다(하루 안에 10,979 → 16,269 → 10,685ms).
 * 단조 열화가 아니므로 "무엇이 누적되는가"가 아니라 "언제 어느 방향으로 전환하는가"를
 * 먼저 관측해야 한다. 그러려면 깊은 계측이 아니라 **촘촘한 시간 해상도**가 필요하다.
 *
 * 각 표본이 스스로 부하 여부를 기록한다
 * --------------------------------------
 * `perf-run` 의 실행 잠금 파일을 확인해 `underLoad` 를 남긴다. 그래서 로거를 계속 돌려
 * 두어도 나중에 유휴 표본만 걸러낼 수 있다. 잠금이 살아 있는 PID 를 가리키면 부하 중,
 * 없거나 죽은 PID 면 유휴로 본다.
 *
 * 측정을 방해하지 않는가
 * ----------------------
 * 3축 1회에 약 13초, 기본 간격 600초이므로 듀티는 2.2% 다. 벤치는 CPU 상한 2코어 컨테이너
 * 이고 호스트는 논리 20개이므로 호스트 용량 기준으로는 0.2% 수준이다. 부하 실행과 겹친
 * 표본은 `underLoad: true` 로 남으므로 분석에서 제외하거나 따로 볼 수 있다.
 *
 * 사용법
 *   node tools/idle-bench-logger.js                 # 600초 간격으로 계속
 *   node tools/idle-bench-logger.js --interval 300  # 간격 변경
 *   node tools/idle-bench-logger.js --once          # 한 번만 찍고 종료
 *
 * 출력: reports/idle-cpu-bench.jsonl (한 줄에 한 표본)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cpuBench = require('./cpu-bench');
const { processIsAlive } = require('./lib/run-lock');

const PERF_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(PERF_ROOT, 'reports', 'idle-cpu-bench.jsonl');

/** perf-run 잠금이 살아 있으면 부하 중이다. 잠금 이름은 저장소별로 접미사가 붙는다. */
function underLoad() {
  try {
    const dir = os.tmpdir();
    for (const name of fs.readdirSync(dir)) {
      if (!/^highteenday-perf-run-.*\.lock$/.test(name)) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        if (rec && rec.pid && processIsAlive(rec.pid)) return true;
      } catch (e) { /* 읽을 수 없는 잠금은 없는 것으로 본다 */ }
    }
  } catch (e) { /* tmpdir 을 못 읽으면 판정 불가 — 아래에서 null 로 남긴다 */
    return null;
  }
  return false;
}

/**
 * Windows 호스트의 CPU 사용률과 실동작 주파수를 한 번 읽는다.
 *
 * 왜 벤치와 **동시에** 기록해야 하는가 — 역인과를 배제하기 위해서다. 실행 기록의
 * "주파수가 높을 때 p95 가 좋았다"는 상관은 반대로도 읽힌다(앱이 빠르면 VM 이 CPU 를 더
 * 써서 터보가 걸린다). 그런데 이 벤치는 **고정 작업량**이라 스스로 부하를 늘리지 않는다.
 * 따라서 "벤치 속도가 그 순간의 주파수를 따라간다"가 보이면 인과 방향이 확정된다(E-49).
 */
function hostCounters() {
  if (process.platform !== 'win32') return null;
  const paths = [
    '\\Processor Information(_Total)\\% Processor Time',
    '\\Processor Information(_Total)\\% Processor Performance',
  ];
  const ps = `(Get-Counter '${paths.join("','")}').CounterSamples | ForEach-Object { $_.CookedValue }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 20000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  const v = r.stdout.trim().split(/\r?\n/).map(Number).filter(Number.isFinite);
  if (v.length < 2) return null;
  return { cpuPct: +v[0].toFixed(2), freqPct: +v[1].toFixed(2) };
}

function sample() {
  const load = underLoad();
  // 앞뒤로 두 번 읽는다. 벤치 시작 전 값은 **유휴 클럭**이고, 벤치가 2코어를 13초 태운
  // 직후 값은 **부하 중 클럭**에 가깝다. 하나만 찍으면 "벤치가 돌 때 클럭이 얼마였나"를
  // 알 수 없어 역인과 판정에 쓸 수 없다 — 실제로 처음엔 시작 전 값만 찍었다가
  // 저클럭(84.9%)에서 벤치가 더 빠르게 나오는 모순을 봤다.
  const hostBefore = hostCounters();
  const startedAt = new Date().toISOString();
  let result;
  try {
    result = cpuBench.bench({ repeat: 1 });
  } catch (e) {
    result = { axes: {}, ratios: {}, errors: [{ axis: 'all', error: e.message }] };
  }
  const hostAfter = hostCounters();
  const host = hostAfter || hostBefore;
  const rec = {
    at: startedAt,
    endedAt: new Date().toISOString(),
    // 벤치가 도는 13초 사이에 부하가 시작될 수 있으므로 앞뒤로 두 번 본다.
    // 둘 중 하나라도 부하면 그 표본은 유휴가 아니다.
    underLoad: load === null || underLoad() === null ? null : (load || underLoad()),
    hostCpuBefore: hostBefore ? hostBefore.cpuPct : null,
    hostFreqBefore: hostBefore ? hostBefore.freqPct : null,
    hostCpuAfter: hostAfter ? hostAfter.cpuPct : null,
    hostFreqAfter: hostAfter ? hostAfter.freqPct : null,
    hostCpuPct: host ? host.cpuPct : null,
    hostFreqPct: host ? host.freqPct : null,
    single: result.axes.single ? result.axes.single.ms : null,
    parallel: result.axes.parallel ? result.axes.parallel.ms : null,
    ctxswitch: result.axes.ctxswitch ? result.axes.ctxswitch.ms : null,
    ratios: result.ratios,
    errors: result.errors.length ? result.errors : undefined,
  };
  try {
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  } catch (e) {
    // 한 줄 못 써도 로거를 멈추지 않는다 — 다음 표본이 더 중요하다.
    console.error(`기록 실패: ${e.message}`);
  }
  return rec;
}

function parseArgs(argv) {
  const o = { intervalSec: Number(process.env.PERF_IDLE_BENCH_INTERVAL || 600), once: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--interval') o.intervalSec = Number(argv[++i]);
    else if (argv[i] === '--once') o.once = true;
  }
  if (!Number.isFinite(o.intervalSec) || o.intervalSec < 30) {
    console.error('--interval 은 30 이상의 초 단위 숫자여야 합니다.');
    process.exit(2);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log(`유휴 벤치 로거 시작 — 간격 ${o.intervalSec}초 · 출력 ${OUT}`);

  const tick = () => {
    const r = sample();
    console.log(`${r.at} single=${r.single}ms parallel=${r.parallel}ms ctxswitch=${r.ctxswitch}ms underLoad=${r.underLoad} freq(전/후)=${r.hostFreqBefore}/${r.hostFreqAfter}% cpu(전/후)=${r.hostCpuBefore}/${r.hostCpuAfter}%`);
    if (o.once) process.exit(0);
  };

  tick();
  setInterval(tick, o.intervalSec * 1000);
}

module.exports = { sample, underLoad };

if (require.main === module) main();
