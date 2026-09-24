/**
 * 게시글 작성 — 생성. 중복을 막는 제약이 없어 같은 요청이 두 번 도착하면 글이 두 개 생긴다
 * (PostService.java:95 `createPost()`).
 *
 * 전제: 재시도는 바이트가 같은 요청이어야 한다. 본문을 send 밖에서 한 번 만든다.
 */
import http from 'k6/http';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { randomBoard } from '../../../scripts/lib/data.js';
import { attempt, jsonOpts } from './attempt.js';

export const key = 'post_create';
export const kind = 'create';

export function run() {
  const body = JSON.stringify({
    boardId: randomBoard().id,
    title: `멱등 실험 글 ${Date.now() % 100000}`,
    content: '재시도 중복 생성을 확인하는 본문입니다. '.repeat(3),
    // RequestPostDto 는 Lombok 이 setAnonymous 를 만들어 Jackson 이 "anonymous" 로 바인딩한다.
    // 필드명 그대로 isAnonymous 를 보내면 400 이다(scripts/posts.js 실측 주석).
    anonymous: false,
  });
  const url = `${BASE_URL}/api/posts`;
  attempt(key, () => http.post(url, body, jsonOpts('post', 'write', 'post_create')));
  return true;
}
