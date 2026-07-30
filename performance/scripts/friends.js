/**
 * 친구 부하 스크립트 — 목록 / 검색 / 신청 / 응답.
 *
 * 검증 포인트:
 *  - /friends/search 는 닉네임 기반 조회 — 인덱스 유무에 따른 편차
 *  - 친구 신청/응답은 알림 이벤트를 발행 — 이벤트 리스너 비용이 요청 지연에
 *    포함되는지(동기) 분리되는지(비동기) 관찰
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, randomPeer } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export function friendList() {
  return withAuth(() => {
    const res = http.get(`${BASE_URL}/api/friends/list`, tags('friend', 'read', 'friend_list'));
    check(res, { 'friend list 200': (r) => r.status === 200 });
    return res;
  });
}

export function receivedRequests() {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/friends/requests/received`,
      tags('friend', 'read', 'friend_req_received'),
    );
    check(res, { 'received reqs 200': (r) => r.status === 200 });
    return res;
  });
}

export function searchFriend(nickname) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/friends/search`,
      JSON.stringify({ nickname }),
      Object.assign({}, JSON_HEADERS, tags('friend', 'read', 'friend_search')),
    );
    check(res, { 'friend search 200': (r) => r.status === 200 });
    return res;
  });
}

export function requestFriend(nickname) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/friends/request`,
      JSON.stringify({ nickname }),
      Object.assign({}, JSON_HEADERS, tags('friend', 'write', 'friend_request')),
    );
    // 이미 친구/중복 신청은 4xx — 5xx만 실패로 본다
    check(res, { 'friend request not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export function respondFriend(reqId, status = 'ACCEPTED') {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/friends/respond`,
      JSON.stringify({ id: reqId, status }),
      Object.assign({}, JSON_HEADERS, tags('friend', 'write', 'friend_respond')),
    );
    check(res, { 'friend respond not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  const me = ensureSession(myUser());
  friendList();
  sleep(thinkTime());

  if (Math.random() < 0.3) {
    const peer = randomPeer(me);
    searchFriend(peer.nickname);
    sleep(thinkTime());
    requestFriend(peer.nickname);
    sleep(thinkTime());
  }

  // 받은 신청이 있으면 수락 — 알림 발행 경로 포함
  const received = receivedRequests();
  try {
    const reqs = JSON.parse(received.body);
    if (Array.isArray(reqs) && reqs.length > 0 && Math.random() < 0.5) {
      respondFriend(reqs[0].id, 'ACCEPTED');
    }
  } catch (_) {}
  sleep(thinkTime());
}

export const handleSummary = makeHandleSummary('friends');
