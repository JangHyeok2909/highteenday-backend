/**
 * SCN-05 Chat Heavy — 실시간 채팅 편중 워크로드.
 *
 * 목적     : SimpleBroker(인메모리) 한계 탐색 — 동시 WebSocket 세션 수 증가에 따른
 *            힙/스레드/브로드캐스트 지연(chat_ws_rtt) 변화를 측정한다.
 *            메시지 저장(DB INSERT)과 브로드캐스트가 결합된 경로의 처리량 상한 확인.
 * 사용자   : 400 VU (그중 WS 세션 ≈ 40% = 동시 160 세션)
 * Ramp-up  : 4분 → 유지 15분 → down 2분
 * Think    : 타이핑 간격 2~6초 (chat-ws.js 내부)
 * 비율     : PROFILE_CHAT_HEAVY (chatWs 40 / chatRest 25)
 * 예상 TPS : REST ≈ 40 RPS + WS 메시지 ≈ 30~50 msg/s
 * 종료조건 : 시간 만료. ws RTT P95 1s 초과 시 조기 중단
 */
import { DEFAULT_THRESHOLDS } from '../scripts/lib/config.js';
import { makeHandleSummary } from '../scripts/lib/summary.js';
import { mixedIteration, PROFILE_CHAT_HEAVY } from './lib/workload.js';

export const options = {
  scenarios: {
    chat_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '4m', target: Number(__ENV.VUS || 400) },
        { duration: __ENV.HOLD || '15m', target: Number(__ENV.VUS || 400) },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '60s', // WS 세션 정상 종료 시간 확보
    },
  },
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    chat_ws_rtt: [
      'p(95)<500',
      { threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '3m' },
    ],
    chat_ws_errors: ['count<50'],
  }),
};

export default function () {
  mixedIteration(PROFILE_CHAT_HEAVY);
}

export const handleSummary = makeHandleSummary('chat-heavy');
