/**
 * 시나리오 10: Soak 테스트 (30분 지속 부하)
 *
 * 목적: 메모리 누수, 커넥션 누수, GC 압박 검출
 * Executor: constant-vus (80 VU, 30분)
 * 타겟 병목: KEYS post:views:* 점진적 악화, EntityManager 컨텍스트 성장
 * 관찰: JVM 힙 추이, p99 시간 추이 (평탄해야 함)
 * 임계값: p99가 5분차 대비 25분차에서 50% 이상 증가하면 실패
 *
 * 실행: k6 run k6/scenarios/10-soak-test.js
 */

import { BASE_URL } from '../config/environments.js';
import { soakThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { weightedPicker, postIdPicker, actionPicker } from '../utils/distributions.js';
import { normalThink, quickThink } from '../utils/think-time.js';
import { browseBoardPosts } from '../flows/browse-board.js';
import { readPostWithComments } from '../flows/read-post.js';
import { reactToPost, toggleScrap } from '../flows/engage-post.js';
import { writeComment } from '../flows/write-comment.js';
import { writePost } from '../flows/write-post.js';
import { searchPosts, randomKeyword } from '../flows/search.js';
import { pollUnreadCount, listNotifications } from '../flows/poll-notifications.js';
import { getHotPosts } from '../flows/hot-posts.js';

const boards = JSON.parse(open('../data/boards.json'));
const seedPosts = JSON.parse(open('../data/seed-posts.json'));

const VUS = parseInt(__ENV.K6_SOAK_VUS || '80', 10);
const DURATION = __ENV.K6_SOAK_DURATION || '30m';

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: soakThresholds,
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
  console.log(`[soak] Starting ${DURATION} soak test with ${VUS} VUs`);
  console.log('[soak] Monitor JVM heap: /actuator/metrics/jvm.memory.used');
  console.log('[soak] Monitor HikariCP: /actuator/metrics/hikaricp.connections.active');
  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'soak' };
  const action = pickAction();

  switch (action) {
    case 'browse': {
      browseBoardPosts(token, pickBoard(), { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'read_post':
    case 'read_comments': {
      readPostWithComments(token, pickPostId(), tags);
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
      const type = Math.random() < 0.8 ? 'LIKE' : 'DISLIKE';
      reactToPost(token, pickPostId(), type, tags);
      quickThink();
      break;
    }
    case 'write_comment': {
      writeComment(token, pickPostId(), {}, tags);
      normalThink();
      break;
    }
    case 'search': {
      searchPosts(randomKeyword(), { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'notification_list': {
      listNotifications(token, { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'scrap': {
      toggleScrap(token, pickPostId(), tags);
      quickThink();
      break;
    }
    case 'write_post': {
      writePost(token, pickBoard(), {}, tags);
      normalThink();
      break;
    }
    default: {
      browseBoardPosts(token, pickBoard(), {}, tags);
      normalThink();
    }
  }
}

export function teardown() {
  console.log('\n==============================');
  console.log('SOAK TEST COMPLETE');
  console.log('==============================');
  console.log('Check the following for degradation:');
  console.log('  1. p99 latency trend — should be flat, not rising');
  console.log('  2. JVM heap usage — should stabilize, not grow');
  console.log('  3. HikariCP active connections — should not creep up');
  console.log('  4. Error rate — should remain < 0.1%');
  console.log('  5. Redis memory — should be stable');
}
