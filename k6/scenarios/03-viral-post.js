/**
 * 시나리오 03: 바이럴 포스트 (Viral Post)
 *
 * 목적: 좋아요 카운터 Row Lock Contention + 댓글 카운트 Race Condition
 * Executor: constant-vus (200 VU, 3분)
 * 타겟: 단일 postId에 모든 트래픽 집중
 *   - 70% 조회, 15% 댓글 조회, 10% 좋아요, 5% 댓글 작성
 * 검증: teardown에서 consistency API로 drift 확인
 * 예상 장애: 좋아요/댓글 카운트 불일치, 높은 부하 시 deadlock 가능
 *
 * 실행:
 *   k6 run k6/scenarios/03-viral-post.js
 *   K6_VIRAL_POST_ID=42 k6 run k6/scenarios/03-viral-post.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { viralPostThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { actionPicker } from '../utils/distributions.js';
import { urgentThink } from '../utils/think-time.js';
import { readPostDetail, readComments } from '../flows/read-post.js';
import { reactToPost } from '../flows/engage-post.js';
import { writeComment } from '../flows/write-comment.js';
import { reactionDrift, commentDrift } from '../utils/metrics.js';

const VIRAL_POST_ID = parseInt(__ENV.K6_VIRAL_POST_ID || '1', 10);
const VUS = parseInt(__ENV.K6_VIRAL_VUS || '200', 10);
const DURATION = __ENV.K6_VIRAL_DURATION || '3m';

export const options = {
  scenarios: {
    viral: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: viralPostThresholds,
};

const pickAction = actionPicker({
  read_post: 70,
  read_comments: 15,
  reaction: 10,
  write_comment: 5,
});

export function setup() {
  return {
    baseUrl: BASE_URL,
    viralPostId: VIRAL_POST_ID,
  };
}

export default function (data) {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'viral', postId: String(data.viralPostId) };
  const action = pickAction();

  switch (action) {
    case 'read_post': {
      readPostDetail(token, data.viralPostId, tags);
      urgentThink();
      break;
    }
    case 'read_comments': {
      readComments(token, data.viralPostId, tags);
      urgentThink();
      break;
    }
    case 'reaction': {
      const type = Math.random() < 0.85 ? 'LIKE' : 'DISLIKE';
      reactToPost(token, data.viralPostId, type, tags);
      urgentThink();
      break;
    }
    case 'write_comment': {
      writeComment(token, data.viralPostId, {}, tags);
      urgentThink();
      break;
    }
  }
}

export function teardown(data) {
  const url = `${data.baseUrl}/api/posts/${data.viralPostId}/consistency`;
  const res = http.get(url);

  if (res.status !== 200) {
    console.error(`consistency API failed: status=${res.status}`);
    return;
  }

  let body;
  try {
    body = JSON.parse(res.body);
  } catch (e) {
    console.error(`consistency JSON parse failed: ${e}`);
    return;
  }

  console.log('\n==============================');
  console.log('VIRAL POST CONSISTENCY CHECK');
  console.log('==============================');
  console.log(JSON.stringify(body, null, 2));

  if (body.drift) {
    console.error('!! DATA DRIFT DETECTED !!');
    console.error(`likeCount=${body.likeCount}, likeActual=${body.likeActual}`);
    console.error(`dislikeCount=${body.dislikeCount}, dislikeActual=${body.dislikeActual}`);
    reactionDrift.add(1);
  } else {
    console.log('NO DRIFT — counters are consistent');
  }
}
