/**
 * SCN-10 Cache Warm — 캐시가 데워진 정상 상태 측정 (cold-start의 대조군).
 *
 * 목적     : 동일 부하·동일 프로파일로 cold-start와 1:1 비교해
 *            캐시 계층의 기여도를 수치화한다.
 *
 * 사전조건:
 *   1. 워밍업 페이즈가 먼저 5분 실행되어 캐시를 채운다 (본 파일에 내장)
 *   2. 측정 페이즈는 워밍업 종료 후 시작 — 결과 분석 시 measurement 시나리오 태그만 사용
 *
 * 사용자   : 워밍업 50 VU 5분 → 측정 100 VU 10분 (cold-start와 동일 강도)
 * 비율     : PROFILE_READ_HEAVY
 * 종료조건 : 시간 만료
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_READ_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      tags: { phase: 'warmup' },
    },
    measurement: {
      executor: 'ramping-vus',
      startTime: '5m',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Number(__ENV.VUS || 100) },
        { duration: __ENV.HOLD || '10m', target: Number(__ENV.VUS || 100) },
      ],
      tags: { phase: 'measurement' },
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 웜 캐시라면 읽기 P95는 콜드 대비 큰 폭으로 낮아야 한다
    'http_req_duration{phase:measurement,op:read}': ['p(95)<200'],
  }),
};

export default function () {
  mixedIteration(PROFILE_READ_HEAVY);
}

export const handleSummary = makeHandleSummary('cache-warm');
