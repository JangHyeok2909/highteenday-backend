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
import { PHASED_THRESHOLDS, measureOnly, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, stagesFor, startVusFor, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_EXAM_WEEK } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 150);

const PLAN = buildPhasePlan({
  mode: 'steady-state',
  warmupSec: toSeconds(__ENV.WARMUP, 300),
  measureSec: toSeconds(__ENV.HOLD, 2400),
  rampdownSec: 300,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    exam_week: {
      executor: 'ramping-vus',
      startVUs: startVusFor(PLAN, VUS),
      stages: stagesFor(PLAN, VUS),
    },
  },
  thresholds: Object.assign({}, PHASED_THRESHOLDS, measureOnly({
    'http_req_duration{name:post_search}': ['p(95)<600', 'p(99)<2000'],
  })),
};

export default function () {
  mixedIteration(PROFILE_EXAM_WEEK);
}

export const handleSummary = makeHandleSummary('exam-week', PLAN);
