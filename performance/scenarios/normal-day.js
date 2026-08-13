/**
 * SCN-01 Normal Day — 평일 일과 시간의 평균 트래픽.
 *
 * 목적     : 일상 부하에서의 기준선(baseline) 확보. 모든 Before/After 비교의 기준.
 * 사용자   : 200 VU (동시 접속 사용자)
 * Ramp-up  : 5분에 걸쳐 0→200 (JIT 워밍업 + 커넥션 풀 안정화) — -e WARMUP=<sec>로 재정의 가능
 * 유지     : 20분(-e HOLD)  |  Ramp-down: 2분 (고정)
 * 측정 구간: warmup/measure/rampdown이 phase 태그로 구분된다(T-03/S-08). 회귀 게이트와
 *           k6 threshold 판정은 k6.phases.measure만 본다 — ramp 구간 데이터는 진단용.
 * Think    : 1~4초 균등분포
 * 비율     : 읽기 중심 PROFILE_NORMAL (browse 40 / engage 15 / notification 10 ...)
 * 예상 TPS : 200 VU × 반복당 평균 6요청 / 평균 여정 25초 ≈ 45~55 RPS
 * 종료조건 : 시간 만료. 오류율 1% 초과 시 threshold 실패로 기록(abort는 안 함 — 기준선이므로 관찰 우선)
 *
 * 실행: k6 run scenarios/normal-day.js   (performance/ 루트에서)
 */
import { PHASED_THRESHOLDS, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, stagesFor, startVusFor, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 200);

// warmup(ramp-up)은 이제 k6 실행 계획 자체를 결정한다(T-03/S-08) — --warmup은 더 이상
// collect.js의 Prometheus 조회 창만 미루는 게 아니라, 이 stage 자체의 길이를 바꾼다.
// 미지정 시 기존과 동일하게 5분/20분/2분을 유지한다.
const PLAN = buildPhasePlan({
  mode: 'steady-state',
  warmupSec: toSeconds(__ENV.WARMUP, 300),
  measureSec: toSeconds(__ENV.HOLD, 1200),
  rampdownSec: 120,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    normal_day: {
      executor: 'ramping-vus',
      startVUs: startVusFor(PLAN, VUS),
      stages: stagesFor(PLAN, VUS),
      gracefulRampDown: '30s',
    },
  },
  thresholds: PHASED_THRESHOLDS,
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('normal-day', PLAN);
