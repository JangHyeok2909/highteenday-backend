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

/**
 * 친구 신청. 닉네임이 아니라 대상 사용자 id 로 보낸다 — 닉네임은 유니크 제약이 없고
 * 변경도 가능해서 API 가 id 기반으로 바뀌었다(RequestFriendDto.targetUserId).
 */
export function requestFriend(targetUserId) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/friends/request`,
      JSON.stringify({ targetUserId }),
      Object.assign({}, JSON_HEADERS, tags('friend', 'write', 'friend_request')),
    );
    // 호출부가 relation=NONE 인 상대만 고르므로 200 이 정상이다. 4xx 가 나면 그건
    // 허용할 상황이 아니라 관계 판정이 어긋났다는 신호다.
    check(res, { 'friend request 200': (r) => r.status === 200 });
    return res;
  });
}

/**
 * 검색 결과에서 아직 아무 사이도 아닌 사람을 고른다.
 *
 * 응답(UserSearchResultDto)의 relation 이 이미 FRIEND / REQUEST_SENT / REQUEST_RECEIVED 면
 * 신청은 400 으로 조기 반환되어, 재려던 친구 관계 INSERT 와 알림 팬아웃에 도달하지 못한 채
 * 지연만 기록된다. 실제 클라이언트도 이 값으로 버튼을 막으므로 동작이 현실과 일치한다.
 */
export function pickRequestable(res) {
  try {
    const list = JSON.parse(res.body);
    const open = (Array.isArray(list) ? list : []).filter((u) => u.relation === 'NONE');
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  } catch (_) {
    return null;
  }
}

export function respondFriend(reqId, status = 'ACCEPTED') {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/friends/respond`,
      JSON.stringify({ id: reqId, status }),
      Object.assign({}, JSON_HEADERS, tags('friend', 'write', 'friend_respond')),
    );
    // 방금 받아온 목록의 신청에 응답하므로 200 이 정상이다. 400 이 난다면 다른 VU 가
    // 먼저 처리한 경쟁 상태이고, 그건 숨길 게 아니라 드러나야 할 관측 결과다.
    check(res, { 'friend respond 200': (r) => r.status === 200 });
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
    // 검색 → 관계 확인 → 신청. 실제 클라이언트의 순서 그대로다.
    const peer = randomPeer(me);
    if (peer) {
      const found = searchFriend(peer.nickname);
      sleep(thinkTime());
      const target = pickRequestable(found);
      // 이미 친구거나 신청이 오간 상대면 보내지 않는다 — 어차피 400 이 될 요청을
      // 섞으면 재려던 쓰기 경로 대신 에러 경로의 지연을 기록하게 된다.
      if (target) {
        requestFriend(target.userId);
        sleep(thinkTime());
      }
    }
  }

  // 받은 신청이 있으면 수락 — 알림 발행 경로 포함.
  // 응답은 FriendInfoDto 라 신청 식별자가 requestId 다. 예전 코드의 reqs[0].id 는
  // undefined 여서 JSON 에서 통째로 빠졌고, 서버는 id 없는 요청을 400 으로 끊었다.
  const received = receivedRequests();
  try {
    const reqs = JSON.parse(received.body);
    if (Array.isArray(reqs) && reqs.length > 0 && Math.random() < 0.5) {
      respondFriend(reqs[0].requestId, 'ACCEPTED');
    }
  } catch (_) {}
  sleep(thinkTime());
}

export const handleSummary = makeHandleSummary('friends');
