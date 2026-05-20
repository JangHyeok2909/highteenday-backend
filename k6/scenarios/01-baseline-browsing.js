/**
 * 시나리오 01: 평시 기준선 (Baseline Browsing)
 *
 * 목적: 건강한 상태의 기준 메트릭 확보
 * Executor: ramping-vus (10→50→100→50→0, 10분)
 * 타겟 병목: 없음 — 기준선 수립
 * 관찰: p50/p95/p99 per endpoint, error rate, throughput
 * 예상: 100 VU에서 정상 통과
 *
 * 실행: k6 run k6/scenarios/01-baseline-browsing.js
 */

import { sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { baselineThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { weightedPicker, postIdPicker, actionPicker } from '../utils/distributions.js';
import { normalThink, quickThink } from '../utils/think-time.js';
import { browseBoardPosts, extractPostIds } from '../flows/browse-board.js';
import { readPostWithComments } from '../flows/read-post.js';
import { reactToPost, toggleScrap } from '../flows/engage-post.js';
import { writeComment } from '../flows/write-comment.js';
import { writePost } from '../flows/write-post.js';
import { searchPosts, randomKeyword, searchPage } from '../flows/search.js';
import { pollUnreadCount, listNotifications } from '../flows/poll-notifications.js';
import { getHotPosts } from '../flows/hot-posts.js';

const boards = JSON.parse(open('../data/boards.json'));
const seedPosts = JSON.parse(open('../data/seed-posts.json'));

const VUS = parseInt(__ENV.K6_BASELINE_VUS || '100', 10);

export const options = {
  scenarios: {
    baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(VUS * 0.1) },   // 워밍업
        { duration: '2m', target: Math.round(VUS * 0.5) },   // 증가
        { duration: '4m', target: VUS },                       // 피크
        { duration: '2m', target: Math.round(VUS * 0.5) },   // 감소
        { duration: '1m', target: 0 },                         // 종료
      ],
    },
  },
  thresholds: baselineThresholds,
};

const pickBoard = weightedPicker(boards);
const pickPostId = postIdPicker(seedPosts.hotPostIds, seedPosts.totalPosts, 1.07);
const pickAction = actionPicker({
  browse: 35,
  read_post: 20,
  read_comments: 15,
  hot_posts: 8,
  poll_notifications: 8,
  reaction: 4,
  write_comment: 3,
  search: 2,
  notification_list: 2,
  scrap: 1,
  write_post: 0.5,
  login_check: 0.5,
});

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'baseline' };
  const action = pickAction();

  switch (action) {
    case 'browse': {
      const boardId = pickBoard();
      browseBoardPosts(token, boardId, { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'read_post': {
      const postId = pickPostId();
      readPostWithComments(token, postId, tags);
      normalThink();
      break;
    }
    case 'read_comments': {
      const postId = pickPostId();
      readPostWithComments(token, postId, tags);
      normalThink();
      break;
    }
    case 'hot_posts': {
      getHotPosts(tags);
      normalThink();
      break;
    }
    case 'poll_notifications': {
      pollUnreadCount(token, tags);
      normalThink();
      break;
    }
    case 'reaction': {
      const postId = pickPostId();
      const type = Math.random() < 0.8 ? 'LIKE' : 'DISLIKE';
      reactToPost(token, postId, type, tags);
      quickThink();
      break;
    }
    case 'write_comment': {
      const postId = pickPostId();
      writeComment(token, postId, {}, tags);
      normalThink();
      break;
    }
    case 'search': {
      searchPosts(randomKeyword(), { page: searchPage() }, tags);
      normalThink();
      break;
    }
    case 'notification_list': {
      listNotifications(token, { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'scrap': {
      const postId = pickPostId();
      toggleScrap(token, postId, tags);
      quickThink();
      break;
    }
    case 'write_post': {
      const boardId = pickBoard();
      writePost(token, boardId, {}, tags);
      normalThink();
      break;
    }
    case 'login_check': {
      pollUnreadCount(token, tags);
      normalThink();
      break;
    }
    default: {
      browseBoardPosts(token, pickBoard(), { page: 0 }, tags);
      normalThink();
    }
  }
}
