/**
 * SCN-13 Soak Test (Endurance) — 중간 강도 장시간 유지.
 *
 * 목적     : 단시간 테스트로는 안 보이는 누수형 문제를 드러낸다.
 *            - 메모리 누수 (힙 사용량 우상향, Old Gen 증가 추세)
 *            - 커넥션 누수 (HikariCP active 우상향)
 *            - WebSocket 세션 누적 (끊긴 세션 미정리)
 *            - 스케줄러 적체 (ViewCount/HotScore flush 지연 누적)
 *            - 토큰 만료 → refresh 경로의 장기 동작 (journeyTokenRefresh 포함)
 * 사용자   : 최대 용량의 60% 수준 (stress 결과 기반, 기본 150 VU)
 * 유지     : 2시간 이상 (CI에서는 HOLD=30m으로 축소 실행)
 * 비율     : PROFILE_NORMAL
 * 종료조건 : 시간 만료. 오류율 2% 초과 시 중단.
 * 판정     : Grafana에서 힙/커넥션/세션 그래프의 "기울기"가 0인지 확인 —
 *            우상향 추세가 보이면 누수. P95의 시간에 따른 표류(drift)도 함께 본다.
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from './lib/workload.js';

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: Number(__ENV.VUS || 150) },
        { duration: __ENV.HOLD || '2h', target: Number(__ENV.VUS || 150) },
        { duration: '5m', target: 0 },
      ],
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: '10m' }],
  }),
};

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export const handleSummary = makeHandleSummary('soak');
