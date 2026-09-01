#!/usr/bin/env node
'use strict';
/**
 * querystats-worker — measure 창의 시작과 끝에 P_S digest 를 한 번씩 찍는다.
 *
 * 부모(`perf-run.js`)는 `spawnSync('k6')` 로 막혀 있어 부하가 도는 동안 아무것도 못 한다.
 * `loadbench-worker` 와 같은 이유로 프로세스를 분리한다.
 *
 * 사용법: querystats-worker.js <out.json> <startDelaySec> <windowSec>
 */

const fs = require('fs');
const querystats = require('./querystats');

const [outFile, startDelayArg, windowArg] = process.argv.slice(2);
if (!outFile || !startDelayArg || !windowArg) {
  console.error('사용법: querystats-worker.js <out.json> <startDelaySec> <windowSec>');
  process.exit(2);
}

const startDelayMs = Number(startDelayArg) * 1000;
const windowMs = Number(windowArg) * 1000;

function write(obj) {
  try {
    fs.writeFileSync(outFile, JSON.stringify(obj));
  } catch { /* 부모가 파일 부재로 판단한다 */ }
}

setTimeout(() => {
  let before;
  try {
    before = querystats.capture();
  } catch (e) {
    write({ error: `measure 시작 캡처 실패: ${e.message}` });
    return;
  }
  setTimeout(() => {
    let after;
    try {
      after = querystats.capture();
    } catch (e) {
      write({ error: `measure 종료 캡처 실패: ${e.message}` });
      return;
    }
    const d = querystats.diff(before, after);
    write({
      window: {
        startedAt: before.at,
        endedAt: after.at,
        // 계획한 창과 실제로 찍힌 간격은 타이머 지연만큼 다르다. 판정에 쓰는 값이므로
        // 계획값이 아니라 실측 간격을 남긴다.
        plannedSec: Number(windowArg),
        actualSec: +((new Date(after.at) - new Date(before.at)) / 1000).toFixed(1),
        // 초과로 뭉쳐진 문장이 이 구간에 있었으면 수치가 일부 유실된 것이다.
        overflowCalls: after.overflowCalls - before.overflowCalls,
      },
      summary: querystats.summarize(d),
    });
  }, windowMs);
}, startDelayMs);
