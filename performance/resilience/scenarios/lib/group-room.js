/**
 * 단체 채팅방 생성 — 생성. 같은 멤버로 두 번 도착하면 방이 두 개 생긴다
 * (ChatService.java:88 `createGroupRoom()`). 1:1 방은 `pairKey` UNIQUE 제약이 있어 멱등이지만
 * 단체방에는 그런 제약이 없다.
 *
 * 전제: 초대 대상이 전부 친구여야 방이 만들어진다(ChatController). 친구 목록에서 한 명을
 * 고르고, 친구가 없으면 건너뛴다. 재시도는 바이트가 같은 요청이어야 하므로 본문을 send 밖에서
 * 한 번 만든다.
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { friendList } from '../../../scripts/friends.js';
import { attempt, jsonOpts } from './attempt.js';

export const key = 'group_room';
export const kind = 'create';

/** 친구 목록 응답(`[{userId, nickname, ...}]`)에서 id 하나. 없으면 null. */
function pickFriendId() {
  const res = friendList();
  if (!res || res.status !== 200) return null;
  try {
    const list = JSON.parse(res.body);
    if (!Array.isArray(list) || list.length === 0) return null;
    const f = list[Math.floor(Math.random() * list.length)];
    return Number.isFinite(f && f.userId) ? f.userId : null;
  } catch (e) {
    return null;
  }
}

export function run() {
  const friendId = pickFriendId();
  if (friendId == null) return false;
  const body = JSON.stringify({ name: `멱등방${Date.now() % 100000}`, memberIds: [friendId] });
  const url = `${BASE_URL}/api/chat/rooms/group`;
  attempt(key, () => http.post(url, body, jsonOpts('chat', 'write', 'group_room_create')));
  return true;
}
