/**
 * SCN-14 Breakpoint Test — 도달률 기반 용량 측정 (stress의 정밀판).
 *
 * 목적     : VU가 아니라 "요청 도달률(arrival rate)"을 계단식으로 올려, 도착률마다
 *            정상 상태에서의 응답시간·처리율·자원 사용률을 재고 세 지점을 찾는다.
 *              R_slo   전체 p95 가 SLO(500ms)를 넘는 첫 계단
 *              R_knee  도달률(실제 iterations/s ÷ 목표)이 98% 아래로 떨어지는 첫 계단
 *              병목    그 계단에서 한계에 닿은 자원
 *            ramping-arrival-rate는 응답이 느려져도 요청 주입을 유지하므로
 *            coordinated omission 없이 한계를 측정할 수 있다.
 * 패턴     : 계단 7개(60→300 iter/s). 각 계단은 전환 30초 + 유지 90초.
 * 종료조건 : 오류율 15% 초과 시 중단. 이건 안전 정지이지 용량 기준이 아니다 — 용량은
 *            R_slo 에서 이미 지났다.
 * 산출물   : 계단별 판정표 → regression/baseline.json 의 capacity 기준값
 *
 * 왜 선형 램프가 아니라 계단인가
 * ------------------------------
 * "이 도착률에서 p95 가 얼마"는 시스템이 정상 상태, 즉 들어오는 속도와 나가는 속도가 같아져
 * 시스템 안에 머무는 요청 수가 더 안 변하는 상태여야 성립한다. 선형 램프는 그 상태에 도달하지
 * 않는다. 시각 t 에 측정된 응답시간은 t 에 끝난 요청의 것이고, 그 요청은 반복 길이만큼 전에
 * 시작했다. 실측 반복 길이 10.39초에 10→300 을 1,200초에 올리면 도착률 변화가 초당
 * (300-10)/1200 = 0.242 iter/s 이므로 0.242 × 10.39 = 2.5 iter/s 만큼 어긋난다. 무릎
 * 근처에서는 반복 길이가 30초 이상으로 늘어 어긋남이 0.242 × 30 = 7.3 iter/s 로 커지고,
 * 큐가 새 도착률에 맞게 수렴하는 시간도 사용률이 100% 에 가까울수록 길어진다. 즉 정밀도가
 * 가장 필요한 곳에서 오차가 가장 크며, 방향은 항상 무릎을 실제보다 늦게 보이게 한다.
 *
 * 유지 90초의 근거: 반복 길이 10.39초의 8.7배라 앞 계단에서 넘어온 요청이 다 빠져나가고,
 * Prometheus 스크레이프 5초 간격이면 90/5 = 18개 표본이 남아 최대값이 한 점에 좌우되지 않는다.
 */
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { buildPhasePlan, toSeconds } from '../scripts/lib/phases.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

/** 계단 목록(iterations/s). 첫 실행은 넓게 훑고, 무릎 구간을 찾은 뒤 그 주변만 좁혀 다시 돈다. */
const STEPS = String(__ENV.STEPS || '60,100,140,180,220,260,300')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const STEP_RAMP_SEC = toSeconds(__ENV.STEP_RAMP, 30);
const STEP_HOLD_SEC = toSeconds(__ENV.STEP_HOLD, 90);
const TOTAL_SEC = STEPS.length * (STEP_RAMP_SEC + STEP_HOLD_SEC);

// 한계 탐색이 목적이라 warmup/measure 구분이 없다. arrival-rate 시나리오는 vusMax가
// 관측값이라 비교 조건으로 못 쓴다는 게 이미 comparability.js의 설계 원칙이므로
// (conditions.js 참고), phase 태깅도 켜지 않는다(gatePhase:null, 진단 전용).
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: TOTAL_SEC,
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      // 필요한 VU 는 `도착률 × 반복 길이` 다. 300 iter/s × 10.39초 = 3,117개이고 무릎 근처에서
      // 반복 길이가 늘면 더 커진다. 이 값이 모자라면 dropped_iterations 가 오르는데, 그건 앱이
      // 아니라 부하 발생기의 한계다 — vus_max 가 여기 닿은 계단의 관측은 버려야 한다.
      maxVUs: Number(__ENV.MAX_VUS || 4000),
      stages: STEPS.flatMap((target) => [
        { duration: `${STEP_RAMP_SEC}s`, target },
        { duration: `${STEP_HOLD_SEC}s`, target },
      ]),
    },
  },
  thresholds: {
    // 붕괴 이후를 계속 돌리면 세 가지가 망가진다. (1) VU 수요가 폭발해 maxVUs 에 닿는 순간부터
    // 계획 도착률이 실제와 달라져 x축이 거짓이 된다. (2) 이미 무너진 상태를 반복 관측하는 데
    // 시간을 쓴다. (3) 앱이 커넥션 고갈 상태로 남아 다음 실행의 기준 구간을 오염시킨다.
    // 0 이 아니라 0.15 인 것과 30초 유예는 순간 실패로 전체 실행을 죽이지 않기 위해서다.
    http_req_failed: [{ threshold: 'rate<0.15', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('breakpoint', PLAN);
