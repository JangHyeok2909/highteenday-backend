#!/usr/bin/env node
'use strict';
/**
 * loadbench 의 실행 워커 — 별도 프로세스여야만 하는 이유는 hostprobe 와 같다.
 *
 * `perf-run.js` 는 k6 를 `spawnSync` 로 돌리고, 그게 Node 의 이벤트 루프를 통째로 막는다.
 * 그래서 부모 프로세스 안에서 `setTimeout` 으로 "warmup 중간에 벤치를 돌린다"를 예약해도
 * 그 타이머는 k6 가 끝난 뒤에야 깨어난다 — 그 시점은 이미 측정이 끝난 뒤라 의미가 없다.
 *
 * 이 워커는 자기 이벤트 루프가 비어 있으므로 예약된 시각에 정확히 깨어난다. 결과는
 * 즉시 파일로 쓰고 종료한다. 부모가 그 파일을 k6 종료 후에 읽는다.
 *
 * 사용: node loadbench-worker.js <출력 JSON 경로> <지연초> [반복횟수]
 */

const fs = require('fs');
const cpuBench = require('../cpu-bench');

const [outFile, delaySecArg, repeatArg] = process.argv.slice(2);
if (!outFile || !delaySecArg) {
  console.error('사용법: loadbench-worker.js <out.json> <delaySec> [repeat]');
  process.exit(2);
}

const delayMs = Number(delaySecArg) * 1000;
const repeat = Number(repeatArg) || 1;

setTimeout(() => {
  const startedAt = new Date().toISOString();
  let result;
  try {
    result = cpuBench.bench({ repeat });
  } catch (e) {
    result = { axes: {}, ratios: {}, errors: [{ axis: 'all', error: e.message }] };
  }
  try {
    fs.writeFileSync(outFile, JSON.stringify({
      startedAt,
      endedAt: new Date().toISOString(),
      delaySec: Number(delaySecArg),
      repeat,
      ...result,
    }));
  } catch (_) { /* 파일을 못 쓰면 부모가 "미완료"로 기록한다 */ }
  process.exit(0);
}, delayMs);
