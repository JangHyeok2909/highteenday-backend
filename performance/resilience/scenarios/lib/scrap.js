/**
 * 스크랩 — 토글. `ScrapService.java:58` 이 `alreadyScraped` 가 참이면 `cancelScrap()`,
 * 거짓이면 `upsertActive()` 로 가므로 게시글 좋아요와 같은 모양으로 뒤집힌다.
 *
 * 전제: 상세 응답의 `scrapped` 가 false 인 글만, 이 VU 가 처음 건드리는 글만 의도에 넣는다.
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomPost } from '../../../scripts/lib/data.js';
import { readPost } from '../../../scripts/posts.js';
import { attempt, opts, boolField } from './attempt.js';

export const key = 'scrap';
export const kind = 'toggle';

// post-like.js 와 따로 둔다. 같은 글을 좋아요하고 스크랩하는 것은 서로 다른 테이블이라
// 간섭이 없는데, 한 집합을 쓰면 한쪽이 건드린 글을 다른 쪽이 못 고른다.
const attempted = {};

export function run() {
  const post = randomPost();
  if (attempted[post.id]) return false;
  attempted[post.id] = true;
  if (boolField(readPost(post.id), 'scrapped') !== false) return false;
  const url = `${BASE_URL}/api/posts/${post.id}/scraps`;
  attempt(key, () => http.post(url, null, opts('scrap', 'write', 'scrap_toggle')));
  return true;
}
