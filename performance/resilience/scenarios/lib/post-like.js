/**
 * 게시글 좋아요 — 목표 상태 설정(PUT). 재시도는 같은 상태를 다시 설정할 뿐이라 뒤집히지 않는다.
 *
 * `ReactionService.set()` 은 현재 상태를 읽지 않고 반응 행을 LIKE 로 맞춘다. 판정식(의도 − 유효
 * 행 증가분)은 토글 때와 같고, 재시도가 있어도 0 이 나와야 한다.
 *
 * 전제: 꺼져 있는 글만, 이 VU 가 처음 건드리는 글만 의도에 넣는다. 상세 응답의 `liked` 로
 * 확인한다(PostDto.isLiked 를 Jackson 이 `liked` 로 직렬화한다).
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomPost } from '../../../scripts/lib/data.js';
import { readPost } from '../../../scripts/posts.js';
import { attempt, jsonOpts, boolField } from './attempt.js';

export const key = 'post_like';
export const kind = 'toggle';

/** 이 VU 가 이미 건드린 글. 뒤집힌 것을 다시 켜면 의도 2 · 증가분 1 이라 없는 결함이 생긴다. */
const attempted = {};

export function run() {
  const post = randomPost();
  if (attempted[post.id]) return false;
  attempted[post.id] = true;
  if (boolField(readPost(post.id), 'liked') !== false) return false;
  const url = `${BASE_URL}/api/posts/${post.id}/reaction`;
  const body = JSON.stringify({ kind: 'LIKE' });
  attempt(key, () => http.put(url, body, jsonOpts('reaction', 'write', 'post_reaction')));
  return true;
}
