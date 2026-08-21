#!/usr/bin/env node
/**
 * cpu-bench — 측정 환경이 "그때와 같은 속도인가"를 5초 만에 확인하는 대조 실험.
 *
 * 왜 필요한가
 * -----------
 * 부하 테스트가 느려졌을 때 원인은 크게 둘이다. **앱이 요청당 일을 더 하게 됐거나,
 * 아래 층이 느려졌거나.** 27분짜리 부하 테스트는 이 둘을 가르지 못한다 — p95 가 나빠졌다는
 * 사실만 알려줄 뿐이다. 그래서 앱과 무관한 순수 계산을 같은 CPU 제한으로 재서, "환경 자체가
 * 느려졌는가"를 독립적으로 답한다.
 *
 * 왜 세 축인가 — 단일 스레드 하나로는 부족했다
 * ---------------------------------------------
 * 원래는 `single` 하나뿐이었고, 그것으로 "CPU 는 느려지지 않았다"고 결론지었다.
 * 나중에 그 결론의 **범위가 좁다**는 것이 드러났다. `single` 은 스레드 하나가 캐시에 들어가는
 * 작업을 도는 것이라 **코어 하나의 클럭당 연산 처리량**만 잰다. 그런데 실제 측정 대상(앱
 * 319 스레드, 요청당 컨텍스트 스위치 1,900회, MySQL)은 스케줄링과 시스템 콜 비용에 훨씬
 * 크게 노출돼 있다. 그 층이 나빠지면 앱은 25% 느려지는데 `single` 은 꿈쩍도 하지 않는다.
 *
 *   single    스레드 1개, 캐시 안에서 도는 해시     → 코어 클럭 속도
 *   parallel  16 스레드를 2코어에 몰아넣음          → 스케줄러·코어 배치 품질
 *   ctxswitch 작은 블록 파이프 왕복(시스템 콜 폭탄) → 컨텍스트 스위치·시스템 콜 비용
 *
 * **읽는 법은 절대값이 아니라 축 사이의 어긋남이다.**
 *   셋 다 느려졌다        → CPU 클럭 자체(열 스로틀링, 주파수 스케일링, 호스트 경합)
 *   single 만 정상        → 스케줄링/시스템 콜 층. 앱은 느려지는데 클럭은 멀쩡한 경우
 *   ctxswitch 만 느림     → 커널 경로(완화 패치, 가상화 오버헤드) 의심
 *
 * 측정 방식을 바꾸지 않은 이유
 * ----------------------------
 * `single` 의 명령과 CPU 제한은 예전 그대로 두었다. 컨테이너 기동 시간(~0.5초)이 포함돼
 * 있어 순수 계산 시간은 아니지만, **과거에 남긴 값과 비교할 수 있어야** 하므로 정확도보다
 * 연속성을 택했다. 새 두 축도 같은 방식(각자 컨테이너, 바깥에서 계측)으로 맞춰 셋의
 * 오버헤드 조건을 동일하게 했다.
 *
 * 사용법
 *   node tools/cpu-bench.js                 # 3축 1회
 *   node tools/cpu-bench.js --repeat 3      # 3회 반복 후 중앙값
 *   node tools/cpu-bench.js --json          # 기계 판독용 (perf-run.js 가 이 형식을 쓴다)
 *   node tools/cpu-bench.js --only single   # 한 축만
 */
'use strict';

const { spawnSync } = require('child_process');

const IMAGE = process.env.PERF_BENCH_IMAGE || 'alpine';
/** 앱 컨테이너와 같은 상한. 조건을 맞추지 않으면 비교 자체가 성립하지 않는다. */
const CPUS = process.env.PERF_BENCH_CPUS || '2';

/**
 * 세 축의 정의.
 *
 * `work` 는 컨테이너 안에서 도는 셸 한 줄이다. Node 가 배열 인자로 넘기므로 호스트 셸의
 * 따옴표·앰퍼샌드 해석을 거치지 않는다 — `&` 를 셸에 맡겼다가 백그라운드 실행이 통째로
 * 무시되는 것을 실제로 겪었다(병렬 벤치가 5,984ms → 541ms 로 "빨라진" 것처럼 보였다).
 */
const AXES = [
  {
    id: 'single',
    label: '단일 스레드 (코어 클럭)',
    // ⚠ 이 명령은 바꾸지 않는다. 과거 기록(5,013ms)과 비교하는 유일한 연결고리다.
    work: 'dd if=/dev/zero bs=1M count=3000 2>/dev/null | md5sum > /dev/null',
    desc: '스레드 1개가 3GB 를 해시한다. 작업 데이터가 캐시에 들어가 메모리·스케줄링 영향이 거의 없다.',
  },
  {
    id: 'parallel',
    label: '다중 스레드 (스케줄링)',
    // 워커 8개 × (생산 dd + 소비 md5sum) = 실행 가능 스레드 16개를 2코어에 밀어 넣는다.
    // 총 해시량 3.2GB 로 single 과 비슷해, 차이가 나면 그건 일의 양이 아니라 배분 비용이다.
    work: 'i=0; while [ $i -lt 8 ]; do (dd if=/dev/zero bs=1M count=400 2>/dev/null | md5sum > /dev/null) & i=$((i+1)); done; wait',
    desc: '16 스레드를 2코어에 몰아넣는다. single 대비 비율이 스케줄러와 코어 배치의 품질이다.',
  },
  {
    id: 'ctxswitch',
    label: '컨텍스트 스위치 (시스템 콜)',
    // 64바이트씩 500만 번 — 계산은 거의 없고 read/write 시스템 콜과 파이프 왕복만 남는다.
    // 컨테이너 기동(~0.5초)이 묻히도록 충분히 크게 잡았다.
    work: 'dd if=/dev/zero bs=64 count=5000000 2>/dev/null | dd of=/dev/null bs=64 2>/dev/null',
    desc: '64바이트 블록으로 파이프를 1,000만 번 왕복한다. 계산이 아니라 커널 경로 비용을 잰다.',
  },
];

function runAxis(axis) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync('docker',
    ['run', '--rm', '--cpus', CPUS, IMAGE, 'sh', '-c', axis.work],
    { encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.error) return { ms: null, error: r.error.message };
  if (r.status !== 0) return { ms: null, error: `exit ${r.status}: ${(r.stderr || '').slice(0, 200)}` };
  return { ms: Math.round(ms) };
}

/** 중앙값 — 평균보다 낫다. 한 회차가 다른 프로세스에 밀리면 평균은 통째로 끌려간다. */
function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function parseArgs(argv) {
  const o = { repeat: 1, json: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repeat') o.repeat = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--only') o.only = argv[++i];
  }
  if (!Number.isFinite(o.repeat) || o.repeat < 1) {
    console.error('--repeat 은 1 이상의 숫자여야 합니다.');
    process.exit(2);
  }
  return o;
}

/**
 * 3축을 재서 요약을 돌려준다. perf-run.js 가 이 함수를 직접 부른다.
 * @returns {{cpus:string, image:string, axes:Object, ratios:Object, errors:Array}}
 */
function bench(opts = {}) {
  const repeat = opts.repeat || 1;
  const axes = {};
  const errors = [];

  for (const axis of AXES) {
    if (opts.only && opts.only !== axis.id) continue;
    const samples = [];
    for (let i = 0; i < repeat; i++) {
      const r = runAxis(axis);
      if (r.error) { errors.push({ axis: axis.id, error: r.error }); break; }
      samples.push(r.ms);
      if (opts.onProgress) opts.onProgress(axis, i + 1, repeat, r.ms);
    }
    if (samples.length) axes[axis.id] = { ms: median(samples), samples, label: axis.label };
  }

  // 축 사이의 비율이 진단값이다. 절대값은 머신이 바뀌면 의미가 없지만 비율은 남는다.
  const ratios = {};
  if (axes.single && axes.parallel) ratios.parallelPerSingle = +(axes.parallel.ms / axes.single.ms).toFixed(3);
  if (axes.single && axes.ctxswitch) ratios.ctxswitchPerSingle = +(axes.ctxswitch.ms / axes.single.ms).toFixed(3);

  return { cpus: CPUS, image: IMAGE, axes, ratios, errors };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.json) {
    console.log(`\n▶ CPU 대조 벤치 (CPU 상한 ${CPUS}코어, ${o.repeat}회${o.repeat > 1 ? ' 중앙값' : ''})`);
  }

  const result = bench({
    repeat: o.repeat,
    only: o.only,
    onProgress: o.json ? null : (axis, i, n, ms) => {
      process.stdout.write(`  ${axis.label.padEnd(28)} ${n > 1 ? `${i}/${n} ` : ''}${ms}ms\n`);
    },
  });

  if (o.json) { console.log(JSON.stringify(result, null, 1)); return; }

  console.log();
  for (const axis of AXES) {
    const a = result.axes[axis.id];
    if (!a) continue;
    console.log(`  ${axis.label.padEnd(28)} ${String(a.ms).padStart(6)}ms   ${axis.desc}`);
  }
  if (result.ratios.parallelPerSingle != null) {
    console.log(`\n  비율  parallel/single ${result.ratios.parallelPerSingle}` +
      `   ctxswitch/single ${result.ratios.ctxswitchPerSingle}`);
    console.log('  (절대값보다 이 비율을 이력과 비교한다 — 셋 다 느려지면 클럭, 비율만 틀어지면 커널·스케줄러)');
  }
  for (const e of result.errors) console.error(`  ⚠ ${e.axis}: ${e.error}`);
  console.log();
}

if (require.main === module) main();

module.exports = { bench, AXES };
