/**
 * 반응(좋아요/싫어요) 부하 스크립트 — 게시글/댓글 reaction.
 *
 * 검증 포인트:
 *  - Post는 likeCount를 비정규화 컬럼으로 갱신 → 같은 인기글에 반응이 몰리면
 *    동일 row UPDATE 경합(row lock wait) 발생. Zipf 샘플링으로 의도적으로 재현한다.
 *  - Lock wait은 metrics/README의 innodb_row_lock_time으로 관찰
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
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

/**
 * 댓글 반응. 게시글 반응과 마찬가지로 비정규화 카운터(likeCount)를 UPDATE 하므로,
 * 인기 댓글에 반응이 몰릴 때 게시글 쪽과 같은 단일 row 경합이 생기는지 확인하는 경로다.
 */
export function reactToComment(commentId, type = 'LIKE') {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/comments/${commentId}/reaction?type=${type}`, null,
      tags('reaction', 'write', 'comment_reaction'),
    );
    // 목록에서 받은 실제 댓글 id 로만 호출된다 — 4xx 가 나올 경로가 없다.
    check(res, { 'comment reaction 200': (r) => r.status === 200 });
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

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 120),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('reactions', STANDALONE_PLAN);
