/**
 * STOMP 1.2 프레임 조립 — 부하 생성기와 시더가 **같은 코드**를 쓴다.
 *
 * 이 파일이 따로 있는 이유
 * ------------------------
 * 채팅 메시지를 만드는 경로가 둘이 된다. 부하 스크립트(`scripts/chat-ws.js`)는 k6 에서
 * 돌고, 시더(`datasets/seed.js`)는 Node 에서 돈다. 프레임 조립을 양쪽에 복제하면
 * **같은 버그가 양쪽에 동시에** 생긴다.
 *
 * 이 저장소는 그 사고를 이미 겪었다 — `scripts/lib/sampling.js` 가 분리된 이유가 정확히
 * 그것이다. Zipf 근사식이 부하 생성과 시드 생성 두 곳에 글자까지 똑같이 복제돼 있었고,
 * index 0 을 못 뽑는 버그(S-03)가 양쪽에 있었다. 한쪽만 고쳤으면 "가장 인기 있는 글에
 * 댓글이 0건"인 모순이 생길 참이었다. 규칙은 하나만 존재해야 한다.
 *
 * 그래서 여기에는 **k6 런타임 API를 하나도 쓰지 않는다.** `k6/ws` 도 `k6/execution` 도
 * import 하지 않는 순수 ESM 이라 Node 가 `await import()` 로 그대로 로드할 수 있다
 * (`sampling.js`·`thresholds.js`·`phases.js` 와 같은 성질). 소켓을 만들고 붙이는 일은
 * 각자 자기 런타임에서 한다 — 이 파일은 **보낼 문자열만** 만든다.
 */

/** STOMP 프레임 종결(NULL) 문자. */
export const NUL = '\u0000';

/** 헤더 맵과 본문으로 프레임 하나를 만든다. */
export function frame(command, headers, body = '') {
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
 * 부하 스크립트의 본문에는 한글이 들어 있어서 전송 첫 건마다 세션이 죽었다. 핸드셰이크와
 * CONNECT 는 성공하고 HTTP 오류율도 0%라 정상으로 보였지만, chat_ws_rtt 는 한 건도
 * 기록되지 않았고 DB 에 메시지가 하나도 쌓이지 않았다.
 *
 * `TextEncoder` 를 쓰지 않는 이유: k6 런타임에 없다. 두 런타임에서 같은 값이 나와야
 * 하므로 직접 센다.
 */
export function utf8Length(s) {
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

/**
 * 프레임 하나가 어떤 명령인지 본다.
 *
 * 호출부가 `msg.startsWith('CONNECTED')` 처럼 직접 판정하면, 서버가 보내는 ERROR 프레임을
 * 조용히 무시하게 된다. 무엇이 왔는지 이름으로 받아 두면 호출부가 그 사실을 셀 수 있다.
 */
export function frameCommand(raw) {
  const nl = String(raw).indexOf('\n');
  return nl < 0 ? String(raw).trim() : String(raw).slice(0, nl).trim();
}

/**
 * 메시지 멱등 키. 서버가 `(방, clientMsgId)` 유니크 제약으로 중복 저장을 막는다
 * (`uk_chat_messages_room_client`).
 *
 * `crypto.randomUUID` 를 쓰지 않는 이유는 utf8Length 와 같다 — k6 런타임에 없다.
 */
export function clientMsgId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
