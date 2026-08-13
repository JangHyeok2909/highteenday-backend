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
import { PHASED_THRESHOLDS, abortDelayAfterMeasure, measureOnly, setActivePhasePlan } from '../scripts/lib/config.js';
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
  // 오류율 상한을 공통 SLO(1%)보다 느슨한 2%로 덮어쓰되, measure 구간에만 적용한다 —
  // measureOnly()가 `http_req_failed{phase:measure}` 키를 만들어 PHASED_THRESHOLDS의
  // 같은 키를 대체하므로, measure 구간에 걸리는 오류율 게이트는 이 2% 하나뿐이다.
  // 조기 중단 평가는 measure 시작 + 2분부터(원래 의도한 관측 시간 2분을 그대로 유지).
  thresholds: Object.assign({}, PHASED_THRESHOLDS, measureOnly({
    http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: abortDelayAfterMeasure(PLAN, 120) }],
    'http_req_duration{name:meal_today}': ['p(95)<200'],
    'http_req_duration{name:timetable_today}': ['p(95)<250'],
    'http_req_duration{name:notif_unread_count}': ['p(95)<100'],
  })),
};

export default function () {
  mixedIteration(PROFILE_PEAK);
}

export const handleSummary = makeHandleSummary('peak-hour', PLAN);
