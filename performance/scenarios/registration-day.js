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
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_REGISTRATION } from './lib/workload.js';

export const options = {
  scenarios: {
    registration_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Number(__ENV.VUS || 300) },
        { duration: __ENV.HOLD || '10m', target: Number(__ENV.VUS || 300) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{name:login}': [
      'p(95)<800',
      { threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '2m' },
    ],
    'http_req_duration{name:school_search}': ['p(95)<400'],
  }),
};

export default function () {
  mixedIteration(PROFILE_REGISTRATION);
}

export const handleSummary = makeHandleSummary('registration-day');
