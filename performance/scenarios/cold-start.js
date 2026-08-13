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
 * 유지     : 10분
 * 비율     : PROFILE_READ_HEAVY — 캐시 대상 경로에 집중
 * 종료조건 : 시간 만료
 *
 * 측정 구간 설계가 다른 일반 회귀 시나리오와 다르다 — 왜:
 *   콜드 상태 자체가 측정 대상이므로, 일반 시나리오처럼 앞부분을 warmup으로 잘라내
 *   판정에서 빼면 안 된다(그게 이 시나리오의 존재 이유를 없앤다). warmupSec:0으로
 *   선언해 전체 구간(30초 ramp 포함)이 phase:measure로 태깅되고, 그대로 게이트에 쓰인다.
 */
import { PHASED_THRESHOLDS, setActivePhasePlan } from '../scripts/lib/config.js';
import { buildPhasePlan, toSeconds } from '../scripts/lib/phases.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_READ_HEAVY } from './lib/workload.js';

const VUS = Number(__ENV.VUS || 100);

const PLAN = buildPhasePlan({
  mode: 'cold-start',
  warmupSec: 0,
  measureSec: toSeconds(__ENV.HOLD, 600) + 30, // 30초 ramp까지 전부 측정 대상
  rampdownSec: 0,
});
setActivePhasePlan(PLAN);

export const options = {
  scenarios: {
    cold_start: {
      executor: 'ramping-vus',
      // startVusFor()는 여기서 쓰지 않는다 — 그 헬퍼는 "warmup 없으면 처음부터 목표
      // VU로 시작"을 가정하지만, cold-start는 warmupSec:0이면서도 30초 ramp 자체가
      // 측정 대상(재기동 직후 VU 투입 재현)이라 0에서 시작해야 한다.
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: `${toSeconds(__ENV.HOLD, 600)}s`, target: VUS },
      ],
    },
  },
  // 콜드 상태 측정이 목적이므로 SLO는 기록만 하고 중단하지 않는다
  thresholds: Object.assign({}, PHASED_THRESHOLDS),
};

export default function () {
  mixedIteration(PROFILE_READ_HEAVY);
}

export const handleSummary = makeHandleSummary('cold-start', PLAN);
