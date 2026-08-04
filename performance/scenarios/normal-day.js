/**
 * SCN-01 Normal Day — 평일 일과 시간의 평균 트래픽.
 *
 * 목적     : 일상 부하에서의 기준선(baseline) 확보. 모든 Before/After 비교의 기준.
 * 사용자   : 200 VU (동시 접속 사용자)
 * Ramp-up  : 5분에 걸쳐 0→200 (JIT 워밍업 + 커넥션 풀 안정화)
 * 유지     : 20분  |  Ramp-down: 2분
 * Think    : 1~4초 균등분포
 * 비율     : 읽기 중심 PROFILE_NORMAL (browse 40 / engage 15 / notification 10 ...)
 * 예상 TPS : 200 VU × 반복당 평균 6요청 / 평균 여정 25초 ≈ 45~55 RPS
 * 종료조건 : 시간 만료. 오류율 1% 초과 시 threshold 실패로 기록(abort는 안 함 — 기준선이므로 관찰 우선)
 *
 * 실행: k6 run scenarios/normal-day.js   (performance/ 루트에서)
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

export const options = {
  scenarios: {
    normal_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: Number(__ENV.VUS || 200) },
        { duration: __ENV.HOLD || '20m', target: Number(__ENV.VUS || 200) },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('normal-day');
