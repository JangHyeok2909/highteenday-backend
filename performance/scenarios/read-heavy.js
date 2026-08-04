/**
 * SCN-03 Read Heavy — 읽기 편중 워크로드.
 *
 * 목적     : 캐시 계층(Redis 게시글 목록/보드/HOT) 효율 측정의 기준 시나리오.
 *            cache-warm / cold-start와 짝을 이뤄 히트율 vs P95를 상관 분석한다.
 * 사용자   : 300 VU  |  Ramp-up 3분 → 유지 15분 → down 2분
 * Think    : 1~4초
 * 비율     : PROFILE_READ_HEAVY (browse 62 / search 7 / notification 10)
 * 예상 TPS : ≈ 90~110 RPS (95% 이상 GET)
 * 종료조건 : 시간 만료
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_READ_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Number(__ENV.VUS || 300) },
        { duration: __ENV.HOLD || '15m', target: Number(__ENV.VUS || 300) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 읽기 전용이므로 전체 P95도 읽기 SLO로 조인다
    http_req_duration: ['p(95)<300'],
  }),
};

export default function () {
  mixedIteration(PROFILE_READ_HEAVY);
}

export const handleSummary = makeHandleSummary('read-heavy');
