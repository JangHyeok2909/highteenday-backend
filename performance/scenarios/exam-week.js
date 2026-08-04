/**
 * SCN-07 Exam Week — 시험 기간 야간 트래픽.
 *
 * 목적     : 검색(LIKE 쿼리) 비중이 급증할 때 DB CPU와 slow query 발생 검증.
 *            시험 기간은 심야까지 롱테일로 이어지므로 낮은 VU로 길게 유지한다.
 * 사용자   : 150 VU  |  Ramp-up 5분 → 유지 40분 → down 5분
 * 비율     : PROFILE_EXAM_WEEK (search 15 — 평시의 4배)
 * 예상 TPS : ≈ 35~45 RPS
 * 종료조건 : 시간 만료
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_EXAM_WEEK } from './lib/workload.js';

export const options = {
  scenarios: {
    exam_week: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: Number(__ENV.VUS || 150) },
        { duration: __ENV.HOLD || '40m', target: Number(__ENV.VUS || 150) },
        { duration: '5m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{name:post_search}': ['p(95)<600', 'p(99)<2000'],
  }),
};

export default function () {
  mixedIteration(PROFILE_EXAM_WEEK);
}

export const handleSummary = makeHandleSummary('exam-week');
