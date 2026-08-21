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
import {
  buildPhasePlan, stagesFor, startVusFor, ratesFor, startRateFor, toSeconds,
} from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 200);

/**
 * `-e RATE=<초당 iteration>` 을 주면 **open model** 로 돈다.
 *
 * 기본값은 여전히 closed model(`ramping-vus`)이다. 저장된 기준선 계열을 유지하기 위해서다 —
 * executor 를 바꾸면 `loadProfile` 이 달라져 `seriesHash` 가 갈리고 과거 실행과의 비교가
 * 끊긴다. 그래서 전환을 **명시적 옵트인**으로 둔다.
 *
 * 언제 open model 을 써야 하는가 — **판정에 쓸 값을 잴 때**다. closed model 에서는 VU 가
 * 고정이라 응답시간이 `R = N / X` 로 기계적으로 정해지고(실측 상관 0.962), 시스템이
 * 느려지면 도착률까지 함께 줄어 "같은 부하"라는 전제가 깨진다. 도착률을 고정하면 p95 가
 * 처리량의 그림자에서 벗어나 독립적인 정보를 갖는다.
 *
 * 근거: localDocs/perf-session-drift.md 8-d.2·8-d.5, perf-findings-tools.md T-36
 */
const RATE = __ENV.RATE ? Number(__ENV.RATE) : null;
const OPEN_MODEL = Number.isFinite(RATE) && RATE > 0;

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
    normal_day: OPEN_MODEL
      ? {
        executor: 'ramping-arrival-rate',
        startRate: startRateFor(PLAN, RATE),
        timeUnit: '1s',
        // 도착률을 지키려면 VU 가 모자라지 않아야 한다. 모자라면 k6 가 도착률을 못 맞추고
        // 다시 closed model 처럼 행동한다 — 그러면 전환한 의미가 없다. 넉넉히 잡고,
        // 실제로 모자랐는지는 `dropped_iterations` 로 확인한다.
        preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
        maxVUs: Number(__ENV.MAX_VUS || 600),
        stages: ratesFor(PLAN, RATE),
      }
      : {
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
