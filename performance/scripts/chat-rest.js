/**
 * 채팅 REST 부하 스크립트 — 방 목록 / 상세 / 메시지 커서 페이징 / 읽음 처리.
 *
 * 검증 포인트:
 *  - /rooms 목록: 방마다 마지막 메시지·미읽음 수 집계 → N+1 또는 무거운 집계 쿼리 후보
 *  - /messages 커서 페이징: cursor 유무에 따른 쿼리 플랜 차이
 *  - /read 처리: last_read_msg_id 갱신 + ChatReadEvent 브로드캐스트
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
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
    check(res, { 'chat messages not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export function markRead(roomId) {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/chat/rooms/${roomId}/read`, null,
      tags('chat', 'write', 'chat_mark_read'),
    );
    check(res, { 'chat read not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export function readStatus(roomId) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/chat/rooms/${roomId}/read-status`,
      tags('chat', 'read', 'chat_read_status'),
    );
    check(res, { 'read status not 5xx': (r) => r.status < 500 });
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

export const handleSummary = makeHandleSummary('chat-rest');
