/**
 * SCN-14 Breakpoint Test — 도달률 기반 용량 측정 (stress의 정밀판).
 *
 * 목적     : VU가 아니라 "요청 도달률(arrival rate)"을 선형 증가시켜
 *            시스템이 처리율을 더 못 올리는 지점(=실제 최대 TPS)을 찾는다.
 *            ramping-arrival-rate는 응답이 느려져도 요청 주입을 유지하므로
 *            coordinated omission 없이 한계를 측정할 수 있다.
 * 패턴     : 10 → 300 iter/s 선형 증가 (20분)
 * 종료조건 : 오류율 15% 초과 시 즉시 중단. dropped_iterations 증가 시점 = 포화점.
 * 산출물   : 최대 지속 가능 TPS → regression/baseline.json 의 capacity 기준값
 */
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { buildPhasePlan, toSeconds } from '../scripts/lib/phases.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

// 한계 탐색이 목적이라 warmup/measure 구분이 없다. arrival-rate 시나리오는 vusMax가
// 관측값이라 비교 조건으로 못 쓴다는 게 이미 comparability.js의 설계 원칙이므로
// (conditions.js 참고), phase 태깅도 켜지 않는다(gatePhase:null, 진단 전용).
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(__ENV.RAMP, 1200),
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: Number(__ENV.MAX_VUS || 2000),
      stages: [
        { duration: __ENV.RAMP || '20m', target: Number(__ENV.TARGET_RATE || 300) },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.15', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('breakpoint', PLAN);
