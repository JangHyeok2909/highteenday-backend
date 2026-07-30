/**
 * 댓글 부하 스크립트 — 목록 / 작성 / 대댓글 / 수정 / 삭제.
 *
 * 검증 포인트:
 *  - GET /api/posts/{id}/comments : 댓글+작성자 로딩 시 N+1 여부 (p6spy로 쿼리 수 관찰)
 *  - 대댓글(parentId) 트리 조립 비용
 *  - 댓글 작성 → Post.commentCount 비정규화 카운터 갱신 경합
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, hotPost } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export function listComments(postId) {
  const res = http.get(
    `${BASE_URL}/api/posts/${postId}/comments`,
    tags('comment', 'read', 'comment_list'),
  );
  check(res, { 'comment list 200': (r) => r.status === 200 });
  return res;
}

export function createComment(postId, parentId = null) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/posts/${postId}/comments`,
      JSON.stringify({
        parentId,
        content: `부하테스트 댓글 ${Date.now() % 100000}`,
        // RequestCommentDto도 동일 — Lombok setAnonymous(...) 때문에 JSON 키는 "anonymous".
        anonymous: Math.random() < 0.6,
        url: null,
      }),
      Object.assign({}, JSON_HEADERS, tags('comment', 'write', 'comment_create')),
    );
    check(res, { 'comment create 2xx': (r) => r.status >= 200 && r.status < 300 });
    return res;
  });
}

export function updateComment(postId, commentId) {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/posts/${postId}/comments/${commentId}`,
      JSON.stringify({ content: '수정된 댓글' }),
      Object.assign({}, JSON_HEADERS, tags('comment', 'write', 'comment_update')),
    );
    check(res, { 'comment update not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export function deleteComment(postId, commentId) {
  return withAuth(() => {
    const res = http.del(
      `${BASE_URL}/api/posts/${postId}/comments/${commentId}`, null,
      tags('comment', 'write', 'comment_delete'),
    );
    check(res, { 'comment delete not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || '2m',
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  ensureSession(myUser());
  const post = hotPost(); // 인기글에 댓글이 몰리는 실제 패턴

  listComments(post.id);
  sleep(thinkTime());

  if (Math.random() < 0.35) {
    const created = createComment(post.id);
    sleep(thinkTime());
    // 20% 확률로 자기 댓글에 대댓글 → 수정 → 삭제 사이클
    if (Math.random() < 0.2) {
      // CommentController.createComment도 201 + 빈 바디 + Location 헤더만 준다.
      const location = created.headers['Location'] || created.headers['location'];
      const id = location ? Number(location.split('/').filter(Boolean).pop()) : null;
      if (id) {
        createComment(post.id, id);
        sleep(0.5);
        updateComment(post.id, id);
        sleep(0.5);
        deleteComment(post.id, id);
      }
    }
  }
}

export const handleSummary = makeHandleSummary('comments');
