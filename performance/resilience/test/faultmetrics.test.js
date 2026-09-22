'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectDbTime } = require('../lib/faultmetrics');

/**
 * PromClient 대역. `series(query, at)` 만 쓰므로 그것만 흉내낸다.
 *
 * 질의를 파싱하지 않고 `_sum` / `_count` 중 어느 지표를 물었는지와 구간 길이로만 가른다 —
 * 테스트가 검증하려는 것은 PromQL 문자열이 아니라 그 결과로 하는 **계산**이다.
 */
function fakeProm(byPhase) {
  const bySec = {};
  for (const [, v] of Object.entries(byPhase)) bySec[v.durationSec] = v.uris;
  return {
    async series(query, at) {
      const m = query.match(/\[(\d+)s\]/);
      const uris = bySec[Number(m[1])];
      const wantSum = query.includes('_sum');
      return Object.entries(uris).map(([uri, [count, msPerReq]]) => ({
        labels: { uri },
        value: wantSum ? count * msPerReq / 1000 : count,
      }));
    },
  };
}

/**
 * 2026-09-14 redis-crash 실행에서 실제로 일어난 일을 줄인 형태로 재현한다.
 *
 * 두 엔드포인트 모두 fault 에서 느려졌는데(cheap 2→4ms, search 74→77ms), 요청당 DB 시간이
 * 74ms 인 search 의 비중이 20% 에서 2% 로 줄어 단순 평균은 오히려 내려간다.
 */
const MIX_SHIFT = {
  pre: { durationSec: 300, uris: { '/cheap': [800, 2], '/search': [200, 74] } },
  fault: { durationSec: 60, uris: { '/cheap': [980, 4], '/search': [20, 77] } },
};

test('collectDbTime: 단순 평균은 요청 구성이 바뀌면 부호가 뒤집힌다', async () => {
  const out = await collectDbTime(fakeProm(MIX_SHIFT), {
    pre: { durationSec: 300, to: new Date() },
    fault: { durationSec: 60, to: new Date() },
  });

  // pre  = (800×2 + 200×74) / 1000 = (1600 + 14800) / 1000 = 16.4ms
  assert.equal(out.pre.rawMsPerReq.toFixed(2), '16.40');
  // fault = (980×4 + 20×77) / 1000 = (3920 + 1540) / 1000 = 5.46ms
  assert.equal(out.fault.rawMsPerReq.toFixed(2), '5.46');
  assert.ok(out.fault.rawMsPerReq < out.pre.rawMsPerReq,
    '엔드포인트가 둘 다 느려졌는데도 단순 평균은 내려간다 — 이 표본이 그 상황이다');
});

test('collectDbTime: pre 구성으로 표준화하면 실제로 느려진 몫이 남는다', async () => {
  const out = await collectDbTime(fakeProm(MIX_SHIFT), {
    pre: { durationSec: 300, to: new Date() },
    fault: { durationSec: 60, to: new Date() },
  });

  // pre 비중 = cheap 0.8 / search 0.2. 그 비중에 fault 의 엔드포인트별 시간을 적용하면
  // 0.8×4 + 0.2×77 = 3.2 + 15.4 = 18.6ms
  assert.equal(out.fault.standardizedMsPerReq.toFixed(2), '18.60');
  assert.ok(out.fault.standardizedMsPerReq > out.pre.standardizedMsPerReq,
    '구성을 고정하면 두 엔드포인트가 느려진 사실이 그대로 남아야 한다');
  // pre 를 pre 구성으로 표준화하면 pre 자신이므로 단순 평균과 같다.
  assert.equal(out.pre.standardizedMsPerReq.toFixed(2), out.pre.rawMsPerReq.toFixed(2));
});

test('collectDbTime: 그 구간에 없는 엔드포인트는 0 이 아니라 가중치에서 뺀다', async () => {
  const out = await collectDbTime(fakeProm({
    pre: { durationSec: 300, uris: { '/a': [500, 10], '/gone': [500, 40] } },
    fault: { durationSec: 60, uris: { '/a': [100, 12] } },
  }), {
    pre: { durationSec: 300, to: new Date() },
    fault: { durationSec: 60, to: new Date() },
  });

  // /gone 의 fault 시간은 모른다. 0 으로 채우면 0.5×12 + 0.5×0 = 6ms 로 내려가,
  // 실제로 느려진 /a 가 빨라진 것처럼 보인다. 빼고 남은 비중 0.5 로 정규화해 12ms 가 된다.
  assert.equal(out.fault.standardizedMsPerReq.toFixed(2), '12.00');
  assert.equal(out.fault.mixWeightCovered.toFixed(2), '0.50',
    '표준화가 pre 구성의 몇 %를 덮었는지 남겨야 값의 신뢰도를 판단할 수 있다');
});

test('collectDbTime: 표본이 1건 미만인 엔드포인트는 평균에서 뺀다', async () => {
  const out = await collectDbTime(fakeProm({
    pre: { durationSec: 300, uris: { '/a': [100, 5], '/noise': [0.3, 900] } },
  }), { pre: { durationSec: 300, to: new Date() } });

  // increase() 의 구간 경계 보간이 만든 0.3건짜리 행을 세면 평균이 5ms 에서 7.7ms 로 튄다.
  assert.equal(out.pre.rawMsPerReq.toFixed(2), '5.00');
  assert.equal(out.pre.requests, 100);
});
