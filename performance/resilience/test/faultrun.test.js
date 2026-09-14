'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, k6Args, warmupArgs } = require('../fault-run');

/** `-e KEY=VALUE` 쌍에서 값을 꺼낸다. 없으면 undefined. */
function envOf(args, key) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '-e' && args[i + 1].startsWith(`${key}=`)) return args[i + 1].slice(key.length + 1);
  }
  return undefined;
}

const PLAN = {
  id: 'redis-crash',
  load: { rate: 4, preVus: 100, maxVus: 1000 },
  phases: { warmupSec: 180, preSec: 60, faultSec: 60, postSec: 180 },
  dataset: 'medium',
};

test('parseArgs: --warmup 을 숫자로 받는다', () => {
  assert.equal(parseArgs(['plan.json', '--warmup', '180']).warmup, 180);
  assert.equal(parseArgs(['plan.json']).warmup, null, '안 주면 계획 파일 값을 쓰도록 null 이어야 한다');
});

/**
 * findLatestSummary() 는 staging 에서 `fault-<계획 id>-*.k6.json` 중 **최신 파일**을 고른다.
 * 예열이 같은 이름·같은 위치에 요약을 쓰면 측정 요약 대신 예열 요약을 집어, 보고서가
 * 장애 없는 실행의 수치를 장애 실행으로 싣는다. 그 실패는 에러 없이 조용히 일어난다.
 */
test('예열 k6 는 측정 k6 와 요약 이름·출력 위치가 모두 다르다', () => {
  const measured = k6Args(PLAN, 'http://127.0.0.1:1234', 'resilience/reports/staging');
  const warm = warmupArgs(PLAN, 180, 'resilience/reports/staging/warmup');

  assert.notEqual(envOf(warm, 'FAULT_ID'), envOf(measured, 'FAULT_ID'));
  assert.equal(envOf(warm, 'FAULT_ID'), 'warmup-redis-crash');
  assert.notEqual(envOf(warm, 'RUNS_DIR'), envOf(measured, 'RUNS_DIR'));
});

test('예열 k6 는 주입 드라이버에 연결하지 않는다', () => {
  const warm = warmupArgs(PLAN, 180, 'x');
  assert.equal(envOf(warm, 'DRIVER_URL'), undefined,
    '예열에는 주입이 없고, t0 신호가 측정 실행의 시간 축을 흔들면 안 된다');
});

test('예열은 구간을 pre 하나로 몰고 부하 조건은 측정과 같게 둔다', () => {
  const measured = k6Args(PLAN, 'http://127.0.0.1:1234', 'x');
  const warm = warmupArgs(PLAN, 180, 'x');

  assert.equal(envOf(warm, 'PRE'), '180');
  assert.equal(envOf(warm, 'FAULT'), '0');
  assert.equal(envOf(warm, 'POST'), '0');

  // 캐시를 "측정 때와 같은 모양"으로 채워야 대조군이 성립한다. 도착률이나 데이터셋이
  // 다르면 예열이 만든 캐시가 측정 구간이 실제로 쓰는 캐시와 달라진다.
  for (const key of ['RATE', 'DATASET', 'PRE_VUS', 'MAX_VUS', 'BASE_URL']) {
    assert.equal(envOf(warm, key), envOf(measured, key), `${key} 가 측정 실행과 달라졌다`);
  }
});

test('예열은 응답 내용 검사를 켜지 않는다', () => {
  // 검사 결과가 측정 요약에 섞일 일은 없지만(별도 실행), 예열에 검사를 거는 것은 비용만
  // 든다. 예열은 판정 대상이 아니다.
  assert.equal(envOf(warmupArgs(PLAN, 180, 'x'), 'CONTENT_CHECKS'), undefined);
});
