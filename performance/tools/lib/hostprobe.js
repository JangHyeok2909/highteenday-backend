'use strict';
/**
 * hostprobe — 측정하는 동안 **Windows 호스트**를 기록한다.
 *
 * 왜 필요한가 — 여기가 유일하게 관측되지 않던 층이다
 * ---------------------------------------------------
 * 이 스택의 "호스트" 지표(node-exporter)가 보는 것은 Windows 가 아니라 **WSL2 VM** 이다.
 * 앱·MySQL·Redis 는 그 안에 있으므로 정확히 측정되지만, VM 바깥에서 벌어지는 일은 이
 * 측정 시스템이 볼 방법이 아예 없었다.
 *
 * 그래서 "자원은 전부 평평했다"는 판단에 구멍이 있었다. 그 판단의 근거가 전부 VM 안쪽
 * 지표라서, VM 바깥에 대해서는 아무것도 말하지 못한다. 특히 **`host.stealPct = 0` 은
 * 외부 경합이 없다는 증거가 아니다** — Hyper-V 는 KVM 처럼 steal time 을 게스트에
 * 보고하지 않기 때문에, Windows 쪽이 CPU 를 가져가도 게스트에서는 0 으로 보인다.
 *
 * 2026-08-20 개편 — T-37 이 만든 잘못된 결론을 막기 위해
 * ------------------------------------------------------
 * 이 프로브의 요약값을 measure 구간 p95 와 상관분석했다가 **틀린 인과 결론을 냈다가
 * 철회했다**. 원인이 네 가지였고 전부 여기서 고친다.
 *
 *   ① 창 불일치  — 요약이 warmup+measure+rampdown 전체 평균이었는데 p95 는 measure 만이다.
 *                  → 이제 **원시 표본을 보존**하고 `sliceByPhase()` 로 구간별 요약을 만든다.
 *   ② 자기 오염  — loadbench(2코어 40초)가 이 창 안에서 돈다.
 *                  → 구간 분리로 warmup 에 격리된다. 분석은 measure 만 쓴다.
 *   ③ `_Total`만 — 이기종 CPU(P 6 + E 8)에서 전체 집계는 유휴 코어까지 섞는다. **WSL 이
 *                  실제로 돈 논리 프로세서를 알 수 없다.** → 코어별 계열을 함께 수집한다.
 *   ④ 원시 소실  — 요약만 남기고 임시 파일을 지워 사후 재질의가 불가능했다. → 보존한다.
 *
 * **`% Processor Performance` 를 물리 클럭으로 읽지 말 것.** 실측으로 확인됐다 — 최소
 * 프로세서 상태를 5%→100% 로 올렸는데 이 카운터는 오히려 114.8%→102.5% 로 내려갔고,
 * Windows 전체 CPU(44%→27%)와 같은 방향으로 움직였다. 이 값은 **시스템 활동 수준의
 * 대리 지표**에 가깝다(E-49).
 *
 * 구현 메모 — 왜 워커 프로세스를 따로 두는가
 * -------------------------------------------
 * `typeperf` 는 Windows 기본 도구라 설치가 필요 없다. 문제는 **누가 그 출력을 받느냐**였고,
 * 처음 두 시도가 모두 실패했다.
 *
 *   1) 이 모듈이 직접 stdout 을 듣는다 → **표본 0개.** `perf-run.js` 가 k6 를
 *      `spawnSync` 로 돌리는데, 그게 이벤트 루프를 통째로 막아 27분 내내 data 콜백이
 *      한 번도 실행되지 않는다.
 *   2) typeperf 에게 `-o 파일` 로 쓰게 한다 → **7바이트 빈 파일.** 버퍼를 들고 있다가
 *      정상 종료 때 비우는데, 우리는 k6 가 끝나면 죽이므로 버퍼가 통째로 사라진다.
 *
 * 그래서 `hostprobe-worker.js` 가 typeperf 를 소유한다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * 1초 — 예전에는 5초(Prometheus 스크레이프 간격)였다. 그런데 5초짜리 고정 작업 벤치와
 * 겹쳐 보면 표본이 1~2개뿐이라 아무것도 말할 수 없었다(T-37). 구간별로 잘라 쓰려면
 * 구간당 표본 수가 충분해야 하므로 1초로 줄인다. 600초 실행이면 600행이다.
 */
const INTERVAL_SEC = Number(process.env.PERF_HOSTPROBE_INTERVAL || 1);

/**
 * `_Total` 집계 카운터. 과거 실행과 비교 가능해야 하므로 키와 의미를 그대로 유지한다.
 */
const COUNTERS = [
  {
    key: 'cpuPct',
    path: '\\Processor Information(_Total)\\% Processor Time',
    label: 'Windows 전체 CPU',
    desc: 'Windows 가 본 전체 CPU 사용률. VM 이 쓰는 몫과 그 밖의 프로세스가 합쳐진 값.',
  },
  {
    key: 'freqPct',
    path: '\\Processor Information(_Total)\\% Processor Performance',
    label: 'CPU 정규화 성능(전체 집계)',
    desc: '공칭 대비 프로세서 성능. **물리 클럭이 아니다** — 유휴 코어까지 포함한 시스템 전체 집계이고, 실측에서 활동 수준을 따라 움직였다(E-49). 클럭 근거로 쓰지 말 것.',
  },
  {
    key: 'queueLen',
    path: '\\System\\Processor Queue Length',
    label: '실행 대기 스레드',
    desc: 'CPU 를 기다리는 스레드 수. 지속적으로 코어 수를 넘으면 호스트가 밀린 것이다.',
  },
  {
    key: 'availMB',
    path: '\\Memory\\Available MBytes',
    label: 'Windows 가용 메모리(MB)',
    desc: '남은 물리 메모리. 줄어들면 VM 메모리가 압축·페이징될 수 있다.',
  },
  {
    // VmmemWSL 은 WSL2 VM 전체를 대표하는 호스트 프로세스다. 컨테이너 내부 회계로는
    // 보이지 않는 **호스트 측 가상화 비용**이 여기 잡힌다. 컨테이너 CPU 합과 이 값이
    // 크게 벌어지면 가상화 오버헤드를 의심할 근거가 된다.
    key: 'vmmemPct',
    path: '\\Process(vmmem*)\\% Processor Time',
    label: 'VmmemWSL 프로세스 CPU',
    desc: 'WSL2 VM 을 대표하는 호스트 프로세스의 CPU. 컨테이너 내부 합과 벌어지면 호스트 측 가상화 비용이다.',
    wildcard: true,
  },
];

/**
 * 코어별 계열. 요약에는 파생값만 싣고 원시 표본은 사이드카에 보존한다.
 * 이기종 CPU 에서 "어느 코어가 일했는가"를 사후에 볼 수 있어야 한다.
 */
const PERCORE = [
  { key: 'coreCpu', path: '\\Processor Information(*)\\% Processor Time' },
  { key: 'corePerf', path: '\\Processor Information(*)\\% Processor Performance' },
];

const ALL_PATHS = [...COUNTERS.map((c) => c.path), ...PERCORE.map((c) => c.path)];

const stats = (nums) => {
  const a = nums.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const sum = a.reduce((s, v) => s + v, 0);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return {
    avg: +(sum / a.length).toFixed(2),
    min: +a[0].toFixed(2),
    max: +a[a.length - 1].toFixed(2),
    p95: +q(0.95).toFixed(2),
    samples: a.length,
  };
};

function start() {
  if (process.platform !== 'win32') {
    return { enabled: false, reason: `Windows 가 아님(${process.platform}) — 호스트 프로브 생략` };
  }

  const file = path.join(os.tmpdir(), `perf-hostprobe-${process.pid}-${Date.now()}.jsonl`);
  let child;
  try {
    child = spawn(
      process.execPath,
      [path.join(__dirname, 'hostprobe-worker.js'), file, String(INTERVAL_SEC), ...ALL_PATHS],
      // stdio 를 버린다. 부모가 spawnSync 로 막혀 있는 동안 워커가 파이프를 채우면
      // 워커 쪽이 write 에서 멈춰 수집이 통째로 정지한다.
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch (e) {
    return { enabled: false, reason: `프로브 워커 실행 실패: ${e.message}` };
  }

  const handle = { enabled: true, child, file, startedAt: new Date().toISOString(), spawnError: null, marks: [] };
  child.on('error', (e) => { handle.spawnError = e.message; });
  return handle;
}

/**
 * 창 안에서 우리가 의도적으로 만든 부하 구간을 표시한다.
 *
 * 왜 필요한가 — loadbench 는 2코어를 40초 태운다. 이 구간을 구분하지 않으면 "환경이
 * 바빴다"와 "우리가 바쁘게 만들었다"가 섞인다. 실제로 그 혼동이 잘못된 결론을 만들었다.
 */
function mark(handle, name, fromIso, toIso) {
  if (!handle || !handle.enabled) return;
  handle.marks.push({ name, from: fromIso, to: toIso });
}

/** 원시 표본을 읽는다. 헤더 행과 값 행이 섞여 있다. */
function readRaw(file) {
  const rows = [];
  let header = null;
  let workerError = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (e) { continue; }
    if (rec.error) { workerError = rec.error; continue; }
    if (rec.header) { header = rec.header; continue; }
    if (rec.iso && Array.isArray(rec.v)) rows.push(rec);
  }
  return { header, rows, workerError };
}

/**
 * 헤더 문자열에서 우리 키로 매핑한다. typeperf 헤더는
 * `\\MACHINE\Processor Information(_Total)\% Processor Time` 형태다.
 */
/**
 * 헤더 없이 **요청 순서**로만 매핑한다.
 *
 * typeperf 는 요청한 순서대로 칼럼을 내므로 고정 카운터(COUNTERS)는 항상 앞쪽 같은
 * 자리에 있다. 흔들리는 것은 뒤쪽 와일드카드 확장뿐이다. 헤더와 행의 칼럼 수가 어긋나면
 * 코어별 매핑만 포기하고 고정 카운터는 그대로 쓴다 — **전부 버리는 것보다 낫다.**
 */
function positionalIndex() {
  const idx = { percore: { coreCpu: [], corePerf: [] }, positional: true };
  COUNTERS.forEach((c, i) => { idx[c.key] = i; });
  return idx;
}

/**
 * 헤더와 행 길이를 보고 매핑 방식을 정한다. 길이가 맞으면 헤더 기반(코어별 포함),
 * 어긋나면 위치 기반(고정 카운터만).
 */
function resolveIndex(header, rowLen) {
  if (header && header.length === rowLen) return indexColumns(header);
  return positionalIndex();
}

function indexColumns(header) {
  const idx = { percore: { coreCpu: [], corePerf: [] } };
  header.forEach((h, i) => {
    const lower = h.toLowerCase();
    const inst = (h.match(/\(([^)]*)\)/) || [])[1] || '';
    if (lower.includes('% processor time') && lower.includes('processor information')) {
      if (inst === '_Total') idx.cpuPct = i;
      else idx.percore.coreCpu.push({ i, inst });
    } else if (lower.includes('% processor performance')) {
      if (inst === '_Total') idx.freqPct = i;
      else idx.percore.corePerf.push({ i, inst });
    } else if (lower.includes('processor queue length')) idx.queueLen = i;
    else if (lower.includes('available mbytes')) idx.availMB = i;
    else if (lower.includes('\\process(') && lower.includes('% processor time')) idx.vmmemPct = i;
  });
  return idx;
}

/** 표본 배열에서 요약을 만든다. */
function summarize(rows, idx) {
  const out = {};
  for (const c of COUNTERS) {
    const i = idx[c.key];
    if (i == null) { out[c.key] = { label: c.label, desc: c.desc, samples: 0 }; continue; }
    out[c.key] = { label: c.label, desc: c.desc, ...(stats(rows.map((r) => r.v[i])) || {}) };
  }
  // 코어별 파생 — "몇 개의 코어가 실제로 일했는가". 이기종 배치를 직접 보진 못해도
  // 활성 코어 수의 변화는 볼 수 있다.
  const cpuCols = idx.percore.coreCpu;
  if (cpuCols.length) {
    const busyCounts = rows.map((r) => cpuCols.filter((c) => (r.v[c.i] || 0) >= 50).length);
    out.coresBusy = { label: '50% 이상 사용 중인 논리 코어 수', ...(stats(busyCounts) || {}) };
    const perCoreAvg = cpuCols.map((c) => ({
      inst: c.inst,
      avg: +(rows.reduce((s, r) => s + (r.v[c.i] || 0), 0) / Math.max(rows.length, 1)).toFixed(2),
    })).sort((a, b) => b.avg - a.avg);
    out.topCores = perCoreAvg.slice(0, 6);
  }
  return out;
}

/**
 * 구간별로 잘라 요약한다. **분석에는 measure 구간만 써야 한다**(T-37).
 * @param {Array} rows 원시 표본
 * @param {Object} plan run.phasePlan (measureStartOffsetSec / measureEndOffsetSec)
 * @param {string} k6StartedAt k6 실행 시작 ISO
 */
function sliceByPhase(rows, plan, k6StartedAt) {
  if (!plan || !k6StartedAt || !rows || !rows.length) return null;
  const t0 = new Date(k6StartedAt).getTime();
  const ms = (r) => new Date(r.iso).getTime() - t0;
  const ws = (plan.measureStartOffsetSec || 0) * 1000;
  const we = (plan.measureEndOffsetSec || 0) * 1000;
  const bucket = (from, to) => rows.filter((r) => ms(r) >= from && ms(r) < to);
  return {
    warmup: bucket(-Infinity, ws),
    measure: bucket(ws, we),
    rampdown: bucket(we, Infinity),
  };
}

/**
 * 샘플링을 멈추고 요약을 돌려준다.
 * @returns {{available:boolean, reason?:string, intervalSec:number, samples:number, counters:Object, raw:Array}}
 */
function stop(handle) {
  if (!handle || !handle.enabled) {
    return { available: false, reason: (handle && handle.reason) || '프로브가 시작되지 않음' };
  }
  try { handle.child.kill(); } catch (e) { /* 이미 죽었으면 무시 */ }

  if (handle.spawnError) {
    return { available: false, reason: `프로브 워커 실행 실패: ${handle.spawnError}` };
  }

  let parsed;
  try {
    parsed = readRaw(handle.file);
  } catch (e) {
    return { available: false, reason: `프로브 출력 읽기 실패: ${e.message}` };
  } finally {
    // **원시 파일은 여기서 지우지 않는다**(T-37 ④). 호출자가 실행 디렉터리로 옮긴다.
  }

  const { header, rows, workerError } = parsed;
  if (!rows.length) {
    try { fs.unlinkSync(handle.file); } catch (e) { /* 무시 */ }
    return {
      available: false,
      reason: workerError
        ? `typeperf 실행 실패: ${workerError}`
        : 'typeperf 표본이 수집되지 않음 (카운터 이름·권한 확인)',
    };
  }

  const idx = resolveIndex(header, rows[0].v.length);
  return {
    available: true,
    intervalSec: INTERVAL_SEC,
    startedAt: handle.startedAt,
    endedAt: new Date().toISOString(),
    samples: rows.length,
    marks: handle.marks,
    counters: summarize(rows, idx),
    // 원시 표본은 사이드카로 보존한다. 사후에 measure 구간만 다시 자를 수 있어야 한다.
    rawFile: handle.file,
    header,
    rows,
  };
}

/** 콘솔 한 줄 요약. 값이 없으면 사유를 보여준다 — 조용히 비는 것보다 낫다. */
function describe(summary) {
  if (!summary || !summary.available) {
    return `호스트 프로브: 없음 (${(summary && summary.reason) || '미실행'})`;
  }
  const c = summary.counters;
  const f = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
  return `호스트(Windows) ${summary.samples}표본 · CPU ${f(c.cpuPct.avg)}% (max ${f(c.cpuPct.max)}) · ` +
    `정규화성능 ${f(c.freqPct.avg)}% · vmmem ${f(c.vmmemPct && c.vmmemPct.avg)}% · ` +
    `바쁜코어 ${f(c.coresBusy && c.coresBusy.avg, 1)}개 · 가용메모리 ${f(c.availMB.min, 0)}MB`;
}

module.exports = {
  start, stop, mark, describe, sliceByPhase, summarize, indexColumns, resolveIndex, positionalIndex, readRaw,
  COUNTERS, PERCORE, INTERVAL_SEC,
};
