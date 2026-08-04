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
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { WS_URL, thinkTime } from './lib/config.js';
import { ensureSession, cookieHeader } from './lib/session.js';
import { myUser } from './lib/data.js';
import { pickMyRoom } from './chat-rest.js';
import { makeHandleSummary } from './lib/summary.js';

export const wsRtt = new Trend('chat_ws_rtt', true);        // 전송→브로드캐스트 수신 왕복
export const wsMessages = new Counter('chat_ws_messages_sent');
export const wsErrors = new Counter('chat_ws_errors');

const NUL = '\u0000'; // STOMP 프레임 종결(NULL) 문자

// ---------- STOMP 프레임 유틸 ----------

function frame(command, headers, body = '') {
  const h = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n');
  return `${command}\n${h}\n\n${body}${NUL}`;
}

export function stompConnect() {
  return frame('CONNECT', { 'accept-version': '1.2', 'heart-beat': '10000,10000' });
}

export function stompSubscribe(id, destination) {
  return frame('SUBSCRIBE', { id, destination });
}

/**
 * STOMP 의 content-length 는 본문의 **바이트 수**다.
 *
 * String.length 를 그대로 쓰면 UTF-16 코드 유닛 수라 한글 한 글자가 1로 세어지는데,
 * 실제 UTF-8 인코딩은 3바이트다. 짧게 신고하면 브로커가 그만큼만 읽고 종결자(NUL)를
 * 기대하는 자리에서 글자 중간 바이트를 만나 프레임이 깨진다. 서버는 ERROR 프레임을
 * 보내고 소켓을 1002(protocol error)로 닫는다.
 *
 * 이 스크립트의 본문에는 한글이 들어 있어서 전송 첫 건마다 세션이 죽었다. 핸드셰이크와
 * CONNECT 는 성공하고 HTTP 오류율도 0%라 정상으로 보였지만, chat_ws_rtt 는 한 건도
 * 기록되지 않았고 DB 에 메시지가 하나도 쌓이지 않았다.
 */
function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i += 1; } // 서로게이트 쌍 = 코드포인트 하나
    else n += 3;
  }
  return n;
}

export function stompSend(destination, payload) {
  const body = JSON.stringify(payload);
  return frame('SEND', {
    destination,
    'content-type': 'application/json',
    'content-length': String(utf8Length(body)),
  }, body);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
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
          const clientMsgId = uuid();
          pending.set(clientMsgId, Date.now());
          socket.send(stompSend('/app/chat/send', {
            roomId,
            content: `부하테스트 메시지 ${clientMsgId.slice(0, 8)}`,
            imageUrl: null,
            clientMsgId,
          }));
          wsMessages.add(1);
        }, (2 + Math.random() * 4) * 1000); // 2~6초 간격 타이핑
      } else if (msg.startsWith('MESSAGE')) {
        // 내 clientMsgId가 브로드캐스트로 돌아오면 RTT 기록
        for (const [id, sentAt] of pending) {
          if (msg.includes(id)) {
            wsRtt.add(Date.now() - sentAt);
            pending.delete(id);
            break;
          }
        }
      } else if (msg.startsWith('ERROR')) {
        wsErrors.add(1);
      }
    });

    socket.on('error', () => wsErrors.add(1));
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

export const handleSummary = makeHandleSummary('chat-ws');
