/**
 * SCN-09 Cold Start — 캐시가 빈 상태에서의 첫 트래픽.
 *
 * 목적     : Redis FLUSH + 앱 재시작 직후를 가정. 캐시 미스 폭풍(thundering herd)과
 *            JIT 미컴파일 상태의 첫 몇 분을 측정한다. cache-warm과 짝 비교.
 *            → "콜드 P95 / 웜 P95" 비율이 캐시 계층의 실질 기여도다.
 *
 * 사전조건 (반드시 순서대로):
 *   1. redis-cli FLUSHALL
 *   2. 앱 재시작 (JIT/커넥션 풀도 초기화)
 *   3. 즉시 본 시나리오 실행
 *
 * 사용자   : 100 VU를 30초 안에 투입 (재기동 직후 대기 사용자 몰림 재현)
 * 유지     : 10분 — 전반 5분(콜드)과 후반 5분(자연 워밍업 후)을 나눠 분석
 * 비율     : PROFILE_READ_HEAVY — 캐시 대상 경로에 집중
 * 종료조건 : 시간 만료
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_READ_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    cold_start: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Number(__ENV.VUS || 100) },
        { duration: __ENV.HOLD || '10m', target: Number(__ENV.VUS || 100) },
      ],
    },
  },
  // 콜드 상태 측정이 목적이므로 SLO는 기록만 하고 중단하지 않는다
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS),
};

export default function () {
  mixedIteration(PROFILE_READ_HEAVY);
}

export const handleSummary = makeHandleSummary('cold-start');
