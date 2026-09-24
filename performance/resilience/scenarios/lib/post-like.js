/**
 * 게시글 좋아요 — 토글. 재시도가 방금 켠 좋아요를 끈다.
 *
 * `PostReactionService.likeReact()` 가 현재 상태를 읽고 분기한다. 첫 요청이 커밋한 뒤
 * 재시도가 도착하면 `liked == true` 를 보고 `cancelState()` 로 간다. 응답은 두 번 다 200 이다.
 *
 * 전제: 꺼져 있는 글만, 이 VU 가 처음 건드리는 글만 의도에 넣는다. 상세 응답의 `liked` 로
 * 확인한다(PostDto.isLiked 를 Jackson 이 `liked` 로 직렬화한다).
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomPost } from '../../../scripts/lib/data.js';
import { readPost } from '../../../scripts/posts.js';
import { attempt, opts, boolField } from './attempt.js';

export const key = 'post_like';
export const kind = 'toggle';

/** 이 VU 가 이미 건드린 글. 뒤집힌 것을 다시 켜면 의도 2 · 증가분 1 이라 없는 결함이 생긴다. */
const attempted = {};

export function run() {
  const post = randomPost();
  if (attempted[post.id]) return false;
  attempted[post.id] = true;
  if (boolField(readPost(post.id), 'liked') !== false) return false;
  const url = `${BASE_URL}/api/posts/${post.id}/reaction?type=LIKE`;
  attempt(key, () => http.post(url, null, opts('reaction', 'write', 'post_reaction')));
  return true;
}
