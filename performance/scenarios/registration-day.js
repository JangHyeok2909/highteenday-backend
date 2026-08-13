/**
 * SCN-08 Registration Day — 신학기 가입 러시.
 *
 * 목적     : BCrypt 로그인 폭주 + 학교 검색 + 친구 신청이 겹치는 신학기 첫 주 재현.
 *            로그인은 CPU-bound라 다른 요청의 지연까지 끌어올리는지(간섭 효과) 관찰.
 * 사용자   : 300 VU  |  Ramp-up 2분(가파름) → 유지 10분 → down 2분
 * 비율     : PROFILE_REGISTRATION (relogin 20 / social 30)
 * 예상 TPS : ≈ 60~80 RPS (그중 로그인 ≈ 15%)
 * 종료조건 : 시간 만료. 로그인 P95 2초 초과 시 조기 중단
 */
import { PHASED_THRESHOLDS, abortDelayAfterMeasure, measureOnly, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, stagesFor, startVusFor, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_REGISTRATION } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 300);

const PLAN = buildPhasePlan({
  mode: 'steady-state',
  warmupSec: toSeconds(__ENV.WARMUP, 120),
  measureSec: toSeconds(__ENV.HOLD, 600),
  rampdownSec: 120,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    registration_day: {
      executor: 'ramping-vus',
      startVUs: startVusFor(PLAN, VUS),
      stages: stagesFor(PLAN, VUS),
    },
  },
  // 로그인 지연 조기 중단은 measure 시작 + 2분부터 본다. 이 시나리오의 warmup은 로그인
  // 폭주 구간 자체라 예전 기준(테스트 시작 + 2분)이면 램프업 한복판에서 평가돼,
  // 재려던 정상 상태에 도달하기도 전에 실행이 죽을 수 있었다.
  thresholds: Object.assign({}, PHASED_THRESHOLDS, measureOnly({
    'http_req_duration{name:login}': [
      'p(95)<800',
      { threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: abortDelayAfterMeasure(PLAN, 120) },
    ],
    'http_req_duration{name:school_search}': ['p(95)<400'],
  })),
};

export default function () {
  mixedIteration(PROFILE_REGISTRATION);
}

export const handleSummary = makeHandleSummary('registration-day', PLAN);
