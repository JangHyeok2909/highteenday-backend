/**
 * 채팅 REST 부하 스크립트 — 방 목록 / 상세 / 메시지 커서 페이징 / 읽음 처리.
 *
 * 검증 포인트:
 *  - /rooms 목록: 방마다 마지막 메시지·미읽음 수 집계 → N+1 또는 무거운 집계 쿼리 후보
 *  - /messages 커서 페이징: cursor 유무에 따른 쿼리 플랜 차이
 *  - /read 처리: last_read_msg_id 갱신 + ChatReadEvent 브로드캐스트
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export function myRooms() {
  return withAuth(() => {
    const res = http.get(`${BASE_URL}/api/chat/rooms`, tags('chat', 'read', 'chat_rooms'));
    check(res, { 'chat rooms 200': (r) => r.status === 200 });
    return res;
  });
}

export function roomMessages(roomId, cursor = null, size = 50) {
  return withAuth(() => {
    const url = cursor
      ? `${BASE_URL}/api/chat/rooms/${roomId}/messages?cursor=${cursor}&size=${size}`
      : `${BASE_URL}/api/chat/rooms/${roomId}/messages?size=${size}`;
    const res = http.get(url, tags('chat', 'read', 'chat_messages'));
    // roomId는 pickMyRoom()이 내 방 목록에서 뽑아 주고 호출부에 널 가드가 있다 —
    // 4xx가 난다면 그건 허용할 상황이 아니라 조회 권한 판정 버그다.
    check(res, { 'chat messages 200': (r) => r.status === 200 });
    return res;
  });
}

export function markRead(roomId) {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/chat/rooms/${roomId}/read`, null,
      tags('chat', 'write', 'chat_mark_read'),
    );
    check(res, { 'chat read 200': (r) => r.status === 200 });
    return res;
  });
}

export function readStatus(roomId) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/chat/rooms/${roomId}/read-status`,
      tags('chat', 'read', 'chat_read_status'),
    );
    check(res, { 'read status 200': (r) => r.status === 200 });
    return res;
  });
}

/** 내 방 목록에서 임의의 방 ID 하나를 꺼낸다. 없으면 null. */
export function pickMyRoom() {
  const res = myRooms();
  try {
    const rooms = JSON.parse(res.body);
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms[Math.floor(Math.random() * rooms.length)].roomId ?? rooms[0].id;
    }
  } catch (_) {}
  return null;
}

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || '2m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    'http_req_duration{name:chat_rooms}': ['p(95)<400'],
  }),
};

export default function () {
  ensureSession(myUser());

  const roomId = pickMyRoom();
  sleep(thinkTime());
  if (roomId) {
    roomMessages(roomId);   // 최신 페이지
    sleep(thinkTime());
    markRead(roomId);
    sleep(0.5);
    readStatus(roomId);
    sleep(thinkTime());
  }
}

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 120),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('chat-rest', STANDALONE_PLAN);
