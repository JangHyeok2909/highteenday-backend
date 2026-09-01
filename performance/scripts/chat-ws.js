/**
 * 채팅 WebSocket(STOMP) 부하 스크립트.
 *
 * SockJS 엔드포인트(/ws)의 raw WebSocket transport(/ws/websocket)에 직접 붙어
 * STOMP 1.2 프레임을 수동으로 주고받는다. 인증은 핸드셰이크 시 accessToken 쿠키.
 *
 * 검증 포인트:
 *  - 동시 세션 수 vs 힙/스레드 (SimpleBroker는 인메모리 — 세션당 구독 상태 유지)
 *  - 메시지 저장(DB) + 브로드캐스트 왕복 지연 (chat_ws_rtt 커스텀 메트릭)
 *  - clientMsgId 멱등 처리 비용
 *
 * 단독 실행:
 *   k6 run scripts/chat-ws.js -e VUS=100 -e DURATION=2m
 */
import ws from 'k6/ws';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { WS_URL, thinkTime, check, currentPhase } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, cookieHeader } from './lib/session.js';
import { myUser } from './lib/data.js';
import { pickMyRoom } from './chat-rest.js';
// STOMP 프레임 조립은 시더(datasets/seed.js)와 공유한다 — 복제하면 같은 버그가 양쪽에 생긴다.
import { stompConnect, stompSubscribe, stompSend, clientMsgId } from './lib/stomp.js';
import { makeHandleSummary } from './lib/summary.js';

export const wsRtt = new Trend('chat_ws_rtt', true);        // 전송→브로드캐스트 수신 왕복
export const wsMessages = new Counter('chat_ws_messages_sent');
export const wsErrors = new Counter('chat_ws_errors');

/**
 * WebSocket 커스텀 메트릭은 tags() 헬퍼(HTTP 전용)를 거치지 않는 별도 경로라 phase 태그가
 * 누락되기 쉽다 — Counter/Trend.add(value, tags)에 직접 실어 보낸다. phase가 활성화되지
 * 않은 컨텍스트(단독 실행 등)에서는 undefined를 반환해 태그 없이 기록된다.
 */
function phaseTag() {
  const phase = currentPhase();
  return phase ? { phase } : undefined;
}

// ---------- 세션 시나리오 ----------

/**
 * 하나의 채팅 세션: 접속 → 방 구독 → N개 메시지 전송(RTT 측정) → 종료.
 * sessionSeconds 동안 유지하며 사용자처럼 타이핑 간격을 둔다.
 */
export function chatSession(roomId, sessionSeconds = 30) {
  const pending = new Map(); // clientMsgId → 전송 시각

  const res = ws.connect(WS_URL, { headers: { Cookie: cookieHeader() } }, (socket) => {
    socket.on('open', () => socket.send(stompConnect()));

    socket.on('message', (msg) => {
      if (msg.startsWith('CONNECTED')) {
        socket.send(stompSubscribe('sub-0', `/topic/chat/room/${roomId}`));
        // 구독 직후부터 주기적으로 메시지 전송
        socket.setInterval(() => {
          // 지역 변수 이름을 페이로드 키(clientMsgId)와 겹치지 않게 둔다 — 겹치면
          // 임포트한 함수가 가려져 초기화 전 참조가 된다.
          const msgId = clientMsgId();
          pending.set(msgId, Date.now());
          socket.send(stompSend('/app/chat/send', {
            roomId,
            content: `부하테스트 메시지 ${msgId.slice(0, 8)}`,
            imageUrl: null,
            clientMsgId: msgId,
          }));
          wsMessages.add(1, phaseTag());
        }, (2 + Math.random() * 4) * 1000); // 2~6초 간격 타이핑
      } else if (msg.startsWith('MESSAGE')) {
        // 내 clientMsgId가 브로드캐스트로 돌아오면 RTT 기록
        for (const [id, sentAt] of pending) {
          if (msg.includes(id)) {
            wsRtt.add(Date.now() - sentAt, phaseTag());
            pending.delete(id);
            break;
          }
        }
      } else if (msg.startsWith('ERROR')) {
        wsErrors.add(1, phaseTag());
      }
    });

    socket.on('error', () => wsErrors.add(1, phaseTag()));
    socket.setTimeout(() => socket.close(), sessionSeconds * 1000);
  });

  check(res, { 'ws handshake 101': (r) => r && r.status === 101 });
}

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    chat_ws_rtt: ['p(95)<500', 'p(99)<1500'],
    chat_ws_errors: ['count<10'],
  },
};

export default function () {
  ensureSession(myUser());
  const roomId = pickMyRoom();
  if (!roomId) {
    // 시드 데이터에 채팅방이 없는 계정 — 다음 반복으로
    sleep(thinkTime());
    return;
  }
  chatSession(roomId, 20 + Math.random() * 20);
}

// 단독 실행(`k6 run scripts/chat-ws.js`)은 constant-vus라 warmup/rampdown 구분이 없다 —
// 진단 전용으로 선언하고 Node 회귀 게이트에는 올리지 않는다(setActivePhasePlan 미호출).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 120),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('chat-ws', STANDALONE_PLAN);
