/**
 * 시나리오 04: 댓글 배틀 (Comment Battle)
 *
 * 목적: 댓글 카운트 Race Condition 재현
 *   CommentService:63 — post.updateCommentCount(post.getCommentCount()+1)
 *   read-then-write 패턴 → 동시 트랜잭션에서 lost update 발생
 * Executor: constant-vus (100 VU, 2분)
 * 트래픽: 100% 댓글 작성, 단일 postId
 * 검증: 최종 commentCount vs 실제 댓글 수 비교
 * 예상 장애: commentCount < 실제 댓글 수 (lost update)
 *
 * 실행:
 *   k6 run k6/scenarios/04-comment-battle.js
 *   K6_BATTLE_POST_ID=42 k6 run k6/scenarios/04-comment-battle.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { commentBattleThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { urgentThink } from '../utils/think-time.js';
import { writeComment } from '../flows/write-comment.js';
import { commentDrift } from '../utils/metrics.js';

const BATTLE_POST_ID = parseInt(__ENV.K6_BATTLE_POST_ID || '1', 10);
const VUS = parseInt(__ENV.K6_BATTLE_VUS || '100', 10);
const DURATION = __ENV.K6_BATTLE_DURATION || '2m';

export const options = {
  scenarios: {
    comment_battle: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: commentBattleThresholds,
};

export function setup() {
  // 테스트 시작 전 현재 commentCount 기록
  const preRes = http.get(`${BASE_URL}/api/posts/${BATTLE_POST_ID}`);
  let initialCommentCount = 0;
  try {
    const body = JSON.parse(preRes.body);
    initialCommentCount = body.commentCount || 0;
  } catch {}

  return {
    baseUrl: BASE_URL,
    battlePostId: BATTLE_POST_ID,
    initialCommentCount,
  };
}

export default function (data) {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'comment_battle', postId: String(data.battlePostId) };

  writeComment(token, data.battlePostId, {
    content: `배틀 댓글 VU${__VU} iter${__ITER} ${Date.now()}`,
  }, tags);

  urgentThink();
}

export function teardown(data) {
  // 최종 post의 commentCount 조회
  const postRes = http.get(`${data.baseUrl}/api/posts/${data.battlePostId}`);

  let finalCommentCount = -1;
  try {
    const body = JSON.parse(postRes.body);
    finalCommentCount = body.commentCount || 0;
  } catch (e) {
    console.error(`Failed to parse post response: ${e}`);
    return;
  }

  const commentsRes = http.get(`${data.baseUrl}/api/posts/${data.battlePostId}/comments`);
  let actualCount = -1;
  try {
    const comments = JSON.parse(commentsRes.body);
    actualCount = Array.isArray(comments) ? comments.length : -1;
  } catch {}

  const newComments = finalCommentCount - data.initialCommentCount;

  console.log('\n==============================');
  console.log('COMMENT BATTLE CONSISTENCY CHECK');
  console.log('==============================');
  console.log(`Initial commentCount: ${data.initialCommentCount}`);
  console.log(`Final commentCount (denormalized): ${finalCommentCount}`);
  console.log(`New comments (from denorm): ${newComments}`);
  console.log(`Actual comment count (from API): ${actualCount}`);

  if (actualCount !== -1 && finalCommentCount !== actualCount) {
    const drift = actualCount - finalCommentCount;
    console.error(`!! COMMENT COUNT DRIFT: ${drift} (actual=${actualCount}, denormalized=${finalCommentCount})`);
    console.error('Root cause: read-then-write race in CommentService.createComment()');
    commentDrift.add(Math.abs(drift));
  } else {
    console.log('No drift detected (or unable to verify)');
  }
}
