/**
 * SCN-02 Peak Hour — 등교 직전(07:30~08:30) 피크.
 *
 * 목적     : 급식/시간표/알림이 몰리는 아침 피크에서 SLO 유지 검증
 * 사용자   : 500 VU
 * Ramp-up  : 3분 0→500 (등교 시간의 가파른 유입 재현)
 * 유지     : 15분  |  Ramp-down: 3분
 * Think    : 1~4초
 * 비율     : PROFILE_PEAK (morning 18 / notification 15 / chat 18 ...)
 * 예상 TPS : ≈ 120~150 RPS
 * 종료조건 : 시간 만료. 오류율 2% 초과 시 조기 중단(abortOnFail)
 */
import { PHASED_THRESHOLDS, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, stagesFor, startVusFor, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_PEAK } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 500);

const PLAN = buildPhasePlan({
  mode: 'steady-state',
  warmupSec: toSeconds(__ENV.WARMUP, 180),
  measureSec: toSeconds(__ENV.HOLD, 900),
  rampdownSec: 180,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    peak_hour: {
      executor: 'ramping-vus',
      startVUs: startVusFor(PLAN, VUS),
      stages: stagesFor(PLAN, VUS),
      gracefulRampDown: '30s',
    },
  },
  thresholds: Object.assign({}, PHASED_THRESHOLDS, {
    http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: '2m' }],
    'http_req_duration{name:meal_today}': ['p(95)<200'],
    'http_req_duration{name:timetable_today}': ['p(95)<250'],
    'http_req_duration{name:notif_unread_count}': ['p(95)<100'],
  }),
};

export default function () {
  mixedIteration(PROFILE_PEAK);
}

export const handleSummary = makeHandleSummary('peak-hour', PLAN);
