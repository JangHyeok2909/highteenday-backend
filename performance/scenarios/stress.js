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
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

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

export const handleSummary = makeHandleSummary('stress');
