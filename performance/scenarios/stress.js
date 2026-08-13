/**
 * SCN-12 Stress Test — 계단식 증가로 시스템 한계점 탐색.
 *
 * 목적     : "몇 VU / 몇 RPS에서 무엇이 먼저 무너지는가"를 찾는다.
 *            무너지는 순서(예: 커넥션 풀 → Tomcat 스레드 → OOM)가 곧 병목 우선순위다.
 * 패턴     : 100 → 200 → 400 → 600 → 800 → 1000 VU, 단계당 3분 유지
 * 비율     : PROFILE_NORMAL (현실 비율 그대로 양만 증가)
 * 종료조건 : 오류율 10% 초과 또는 P95 5초 초과 시 즉시 중단 —
 *            중단 시점의 VU/RPS가 시스템의 실측 한계 용량이다.
 * 산출물   : 한계점 수치 → regression/baseline의 capacity 항목으로 기록
 */
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { buildPhasePlan } from '../scripts/lib/phases.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

// 한계 탐색이 목적이라 warmup/measure/rampdown 구분이 없다 — 계단식 부하 전체가
// 관찰 대상이다. phase 태깅은 켜지 않는다(setActivePhasePlan 미호출) — 기존 자체
// abortOnFail threshold가 이미 판정 주체이고, gatePhase:null이라 Node 회귀 게이트는
// 이 시나리오를 건너뛴다(원래도 게이트 대상이 아니었다). plan은 comparability에서
// 다른 모드의 실행과 섞이지 않도록 기록용으로만 선언한다.
const PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: 1620, // 13단계 합 (2+3+1+3+1+3+1+3+1+3+1+3+2분)
  rampdownSec: 0,
  gatePhase: null,
});

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 400 },
        { duration: '3m', target: 400 },
        { duration: '1m', target: 600 },
        { duration: '3m', target: 600 },
        { duration: '1m', target: 800 },
        { duration: '3m', target: 800 },
        { duration: '1m', target: 1000 },
        { duration: '3m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '1m' }],
    http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: true, delayAbortEval: '1m' }],
  },
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('stress', PLAN);
