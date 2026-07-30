/**
 * 반응(좋아요/싫어요) 부하 스크립트 — 게시글/댓글 reaction.
 *
 * 검증 포인트:
 *  - Post는 likeCount를 비정규화 컬럼으로 갱신 → 같은 인기글에 반응이 몰리면
 *    동일 row UPDATE 경합(row lock wait) 발생. Zipf 샘플링으로 의도적으로 재현한다.
 *  - Lock wait은 metrics/README의 innodb_row_lock_time으로 관찰
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, hotPost } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export function reactToPost(postId, type = 'LIKE') {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/posts/${postId}/reaction?type=${type}`, null,
      tags('reaction', 'write', 'post_reaction'),
    );
    check(res, { 'post reaction 2xx': (r) => r.status >= 200 && r.status < 300 });
    return res;
  });
}

export function reactToComment(commentId, type = 'LIKE') {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/comments/${commentId}/reaction?type=${type}`, null,
      tags('reaction', 'write', 'comment_reaction'),
    );
    check(res, { 'comment reaction not 5xx': (r) => r.status < 500 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '2m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 단일 row 경합 실험이 목적이므로 낮은 지연 SLO를 별도 부여
    'http_req_duration{name:post_reaction}': ['p(95)<400', 'p(99)<1000'],
  }),
};

export default function () {
  ensureSession(myUser());
  // Zipf: 반응의 대부분이 소수 인기글에 집중 → 단일 row 경합 최대화
  const post = hotPost();
  reactToPost(post.id, Math.random() < 0.85 ? 'LIKE' : 'DISLIKE');
  sleep(thinkTime());
}

export const handleSummary = makeHandleSummary('reactions');
