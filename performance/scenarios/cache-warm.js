/**
 * SCN-10 Cache Warm — 캐시가 데워진 정상 상태 측정 (cold-start의 대조군).
 *
 * 목적     : 동일 부하·동일 프로파일로 cold-start와 1:1 비교해
 *            캐시 계층의 기여도를 수치화한다.
 *
 * 사전조건:
 *   1. 워밍업 페이즈가 먼저 5분 실행되어 캐시를 채운다 (본 파일에 내장)
 *   2. 측정 페이즈는 워밍업 종료 후 시작 — k6.phases.measure만 판정에 쓰인다(S-17)
 *
 * 사용자   : 워밍업 VUS/2 VU (기본 50) 5분 → 측정 VUS VU (기본 100) 10분
 *            측정 강도는 cold-start와 동일하게 맞춘다. VUS를 바꾸면 두 구간이 함께 스케일된다.
 * 비율     : PROFILE_READ_HEAVY
 * 종료조건 : 시간 만료
 *
 * phase 태깅 방식이 다른 시나리오와 다르다 — 왜:
 *   여기는 이미 k6 네이티브 scenarios.<name>.tags로 warmup/measure를 완전히 분리된 두
 *   executor로 나눠 두었다. 이 정적 태그는 checks·iterations를 포함한 모든 메트릭에
 *   자동으로 붙으므로, config.js의 동적 currentPhase()(요청 시점 경과 시간 계산)를
 *   덧붙이면 오히려 두 메커니즘이 충돌한다(setActivePhasePlan 미호출).
 *   phasePlan은 기록·비교 목적으로만 선언하고, 실제 태깅은 k6 executor tags가 전담한다.
 *
 * S-17: 예전에는 이 두 executor의 데이터가 하나의 overall로 섞였다. 이제
 *   summary.js가 phase 태그로 k6.phases.warmup / k6.phases.measure를 분리 추출하므로
 *   "캐시 데우는 구간"과 "측정 구간"이 리포트에서 완전히 갈라진다.
 */
import { PHASED_THRESHOLDS, measureOnly } from '../scripts/lib/config.js';
import { buildPhasePlan, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_READ_HEAVY } from './lib/workload.js';

const MEASURE_RAMP_SEC = 30;
const VUS = Number(__ENV.VUS || 100);
const WARMUP_SEC = toSeconds(__ENV.WARMUP, 300);
const MEASURE_HOLD_SEC = toSeconds(__ENV.HOLD, 600);

/**
 * 워밍업 부하는 측정 부하의 절반 — VUS에 비례해야 한다.
 *
 * 예전에는 `vus: 50` 리터럴이었다. 기본값(VUS=100)에서는 헤더에 적힌 "워밍업 50 VU →
 * 측정 100 VU"와 맞지만, VUS를 낮춰 가볍게 돌리면 워밍업만 50으로 남아 측정보다 몇 배
 * 센 부하가 된다(실측: VUS=5로 돌렸더니 워밍업 50 VU가 앱을 포화시켰고, 그 직후 시작한
 * measure 구간이 p95 32초·오류율 25%로 나왔다). 캐시가 데워진 **정상 상태**를 재는 것이
 * 이 시나리오의 목적이므로, 워밍업이 앱을 무너뜨리면 측정값의 의미가 사라진다.
 * 짝인 cold-start는 VUS 하나로 전체가 스케일되므로 1:1 비교의 대칭성도 깨진다.
 *
 * 비율(1/2)은 기존 기본 동작을 그대로 보존하려고 고른 값이다 — VUS=100이면 그대로 50이라
 * 과거 실행과 loadProfile 지문이 달라지지 않는다. 워밍업 강도만 따로 조절하려면
 * WARMUP_VUS로 덮어쓴다.
 */
const WARMUP_VUS = Number(__ENV.WARMUP_VUS || Math.max(1, Math.round(VUS / 2)));

const PLAN = buildPhasePlan({
  mode: 'cache-warm',
  warmupSec: WARMUP_SEC,
  measureSec: MEASURE_RAMP_SEC + MEASURE_HOLD_SEC,
  rampdownSec: 0,
});

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      vus: WARMUP_VUS,
      duration: `${WARMUP_SEC}s`,
      tags: { phase: 'warmup' },
    },
    measurement: {
      executor: 'ramping-vus',
      startTime: `${WARMUP_SEC}s`,
      startVUs: 0,
      stages: [
        { duration: `${MEASURE_RAMP_SEC}s`, target: VUS },
        { duration: `${MEASURE_HOLD_SEC}s`, target: VUS },
      ],
      tags: { phase: 'measure' },
    },
  },
  thresholds: Object.assign({}, PHASED_THRESHOLDS, measureOnly({
    // 웜 캐시라면 읽기 P95는 콜드 대비 큰 폭으로 낮아야 한다 — measure phase 게이트를
    // PHASED_THRESHOLDS의 기본 op:read 기준보다 더 엄격하게 덮어쓴다.
    // (warmup executor가 캐시를 채우는 5분 구간은 애초에 판정 대상이 아니다.)
    'http_req_duration{op:read}': ['p(95)<200'],
  })),
};

export default function () {
  mixedIteration(PROFILE_READ_HEAVY);
}

export const handleSummary = makeHandleSummary('cache-warm', PLAN);
