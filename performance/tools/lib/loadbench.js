'use strict';
/**
 * loadbench — **부하가 도는 동안** 환경이 얼마나 빠른지를 잰다.
 *
 * 왜 필요한가 — 기존 지표가 전부 처리량으로 붕괴한다
 * ---------------------------------------------------
 * 앱 컨테이너는 CPU 상한(2코어)에 완전히 붙어 돈다. 그래서 measure 300초짜리 실행의
 * 앱 CPU 소비량은 항상 600 CPU초로 **고정**이다. 그 결과 `efficiency.appCpuMsPerReq`
 * 같은 "요청당 자원" 지표는 정의상 `600,000 ÷ 요청 수`가 되어, 처리량을 다른 단위로
 * 다시 쓴 값일 뿐 새 정보를 주지 않는다(실측 오차 0.5~1.9%).
 *
 * `efficiency.queriesPerReq` 도 같은 함정에 있다. 총 MySQL 문 수를 요청 수로 회귀하면
 * 부하와 무관한 고정분이 기준 실행 전체의 약 44% 다(스케줄러 등 배경 작업). 처리량이
 * 떨어지면 이 지표는 기계적으로 오른다.
 *
 * 즉 **분자(자원 소비)는 상한에 묶여 고정이고 분모(요청 수)만 변하므로**, 요청당 지표를
 * 아무리 조합해도 "왜 처리량이 떨어졌는가"에 답할 수 없다. 순환이다.
 *
 * 이 모듈이 그 순환을 깬다
 * ------------------------
 * cpu-bench 는 **알려진 고정량의 일**(캐시 안에서 도는 해시 등)을 시키고 걸린 시간을 잰다.
 * 분자가 "일의 양"으로 고정되므로 처리량과 순환하지 않는다. 부하가 도는 동안 이 값을
 * 찍으면 다음이 갈린다.
 *
 *   벤치도 같은 비율로 느려짐 → 원인은 컨테이너 밖 공유 층(클럭·캐시·메모리)
 *   벤치는 평소값인데 앱만 느림 → 원인은 컨테이너 또는 JVM 안
 *
 * 이 판별이 필요한 이유는 이 환경에서 하드웨어 성능 카운터를 쓸 수 없기 때문이다.
 * WSL2 게스트의 `/sys/bus/event_source/devices/` 에는 software·tracepoint 계열만 있고
 * `cpu`(코어 PMU)가 없다. msr 도 `tsc`·`smi`·`pperf` 뿐이라 aperf/mperf 로 실효 주파수를
 * 읽을 수도 없고, power(RAPL) 이벤트는 비어 있다. 즉 IPC·캐시 미스·실효 클럭을 직접
 * 재는 경로가 전부 막혀 있고, 고정 작업량 벤치가 유일하게 남은 계측 수단이다.
 *
 * 왜 warmup 구간에 넣는가
 * -----------------------
 * 벤치 자체가 2코어를 태우므로 measure 창 안에서 돌리면 그 실행을 오염시킨다 —
 * 환경을 확인하려다 환경을 바꾸는 셈이다. warmup 은 **부하는 이미 걸려 있는데 통계에는
 * 잡히지 않는 구간**이라 두 조건을 동시에 만족한다. 시점은 warmup 의 1/3 지점으로 잡아,
 * 벤치가 끝난 뒤 measure 시작까지 충분히 가라앉을 시간을 남긴다.
 *
 * 시점을 계산할 수 없으면 **재지 않는다.** measure 창을 침범하느니 값이 없는 편이 낫다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * 반복 횟수. 1회면 표본이 4,883~7,736ms 로 튀어(실측) 근거로 쓸 수 없다.
 * 3회 중앙값이면 회차 간 0.6% 수준까지 좁혀진다.
 */
const REPEAT = Number(process.env.PERF_BENCH_REPEAT || 3);

/** 3축 × 3회에 약 40초. warmup 이 이보다 충분히 길어야 measure 를 침범하지 않는다. */
const APPROX_DURATION_SEC = 40;

/** warmup 이 이보다 짧으면 시점을 자동으로 정하지 않는다 (침범 위험). */
const MIN_WARMUP_SEC = 120;

/**
 * warmup 길이에서 벤치 시작 시점을 정한다.
 * @returns {number|null} 시작까지 기다릴 초. 정할 수 없으면 null.
 */
function deriveDelaySec(warmupSec) {
  if (!Number.isFinite(warmupSec) || warmupSec < MIN_WARMUP_SEC) return null;
  return Math.floor(warmupSec / 3);
}

/**
 * 벤치를 예약한다. 시점이 없으면 조용히 비활성 핸들을 준다 — 벤치가 없다고 측정을
 * 막을 이유는 없고, 그 사실은 stop() 이 사유로 돌려준다.
 */
function start(opts = {}) {
  const delaySec = opts.delaySec;
  const repeat = opts.repeat || REPEAT;

  if (!Number.isFinite(delaySec) || delaySec <= 0) {
    return {
      enabled: false,
      reason: `벤치 시점을 정할 수 없음 — warmup ${MIN_WARMUP_SEC}초 이상을 --warmup 으로 주거나 --loadbench-at <초> 로 직접 지정`,
    };
  }

  const file = path.join(os.tmpdir(), `perf-loadbench-${process.pid}-${Date.now()}.json`);
  let child;
  try {
    child = spawn(
      process.execPath,
      [path.join(__dirname, 'loadbench-worker.js'), file, String(delaySec), String(repeat)],
      // stdio 를 버린다. 부모가 spawnSync 로 막혀 있는 동안 워커가 파이프를 채우면
      // 워커 쪽이 write 에서 멈춘다 (hostprobe 와 같은 이유).
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch (e) {
    return { enabled: false, reason: `부하 중 벤치 워커 실행 실패: ${e.message}` };
  }

  const handle = { enabled: true, child, file, delaySec, repeat, spawnError: null };
  child.on('error', (e) => { handle.spawnError = e.message; });
  return handle;
}

/**
 * 결과를 회수한다. 워커가 아직 못 끝냈으면 미완료로 남긴다 — 없는 값을 만들어내지 않는다.
 * @returns {{available:boolean, reason?:string, delaySec?:number, axes?:Object, ratios?:Object}}
 */
function stop(handle) {
  if (!handle || !handle.enabled) {
    return { available: false, reason: (handle && handle.reason) || '벤치가 예약되지 않음' };
  }

  if (handle.spawnError) {
    try { handle.child.kill(); } catch (e) { /* 이미 죽었으면 무시 */ }
    return { available: false, reason: `부하 중 벤치 워커 실행 실패: ${handle.spawnError}` };
  }

  let raw = null;
  try {
    raw = fs.readFileSync(handle.file, 'utf8');
  } catch (e) {
    // 파일이 없다 = 워커가 아직 예약 시각에 도달하지 못했거나 벤치 도중이다.
    try { handle.child.kill(); } catch (_) { /* 무시 */ }
    return {
      available: false,
      reason: `부하 중 벤치 미완료 — 예약 ${handle.delaySec}초 + 약 ${APPROX_DURATION_SEC}초가 실행 길이 안에 들어가지 않음`,
    };
  }

  try { handle.child.kill(); } catch (e) { /* 정상 종료했으면 무시 */ }
  try { fs.unlinkSync(handle.file); } catch (e) { /* 임시 파일이라 남아도 무해 */ }

  let rec;
  try {
    rec = JSON.parse(raw);
  } catch (e) {
    return { available: false, reason: `부하 중 벤치 결과 파싱 실패: ${e.message}` };
  }

  if (!rec.axes || !Object.keys(rec.axes).length) {
    const first = (rec.errors || [])[0];
    return { available: false, reason: `부하 중 벤치 실패: ${(first && first.error) || '원인 미상'}` };
  }

  return { available: true, ...rec };
}

/**
 * 콘솔 한 줄 요약. 실행 전 벤치와 나란히 놓아야 의미가 생기므로 비교 대상을 함께 받는다.
 * @param {Object} summary stop() 결과
 * @param {Object} idle 실행 전 벤치(cpuBench.bench 결과). 없으면 절대값만 보여준다.
 */
function describe(summary, idle) {
  if (!summary || !summary.available) {
    return `부하 중 벤치: 없음 (${(summary && summary.reason) || '미실행'})`;
  }
  const a = summary.axes;
  const parts = [];
  for (const id of ['single', 'parallel', 'ctxswitch']) {
    if (!a[id]) continue;
    const idleMs = idle && idle.axes && idle.axes[id] ? idle.axes[id].ms : null;
    const delta = idleMs ? ` (유휴 대비 ${((a[id].ms / idleMs - 1) * 100).toFixed(1)}%)` : '';
    parts.push(`${id} ${a[id].ms}ms${delta}`);
  }
  return `부하 중 벤치(warmup +${summary.delaySec}초, ${summary.repeat}회 중앙값) · ${parts.join(' · ')}`;
}

module.exports = { start, stop, describe, deriveDelaySec, REPEAT, MIN_WARMUP_SEC, APPROX_DURATION_SEC };
