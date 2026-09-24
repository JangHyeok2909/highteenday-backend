/**
 * 댓글 작성 — 생성. 중복을 막는 제약이 없어 같은 요청이 두 번 도착하면 댓글이 두 개 생긴다
 * (CommentService.java:55 `createComment()`).
 *
 * 전제: 재시도는 바이트가 같은 요청이어야 한다. 본문을 send 밖에서 한 번 만든다.
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomPost } from '../../../scripts/lib/data.js';
import { attempt, jsonOpts } from './attempt.js';

export const key = 'comment_create';
export const kind = 'create';

export function run() {
  const body = JSON.stringify({
    parentId: null,
    content: `멱등 실험 댓글 ${Date.now() % 100000}`,
    anonymous: false,
    url: null,
  });
  const url = `${BASE_URL}/api/posts/${randomPost().id}/comments`;
  attempt(key, () => http.post(url, body, jsonOpts('comment', 'write', 'comment_create')));
  return true;
}
