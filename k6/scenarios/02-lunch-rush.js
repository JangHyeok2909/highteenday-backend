/**
 * 시나리오 02: 점심 급증 (Lunch Rush)
 *
 * 목적: HikariCP pool=10 고갈 드러내기
 * Executor: ramping-vus (0→300→500→300→0, 8분)
 * 타겟 병목: 10개 DB 커넥션 vs 400+ Tomcat 스레드
 * 관찰 메트릭: p99 latency 스파이크, 500 에러 발생 시점
 * 예상 장애: 200+ 동시 DB 요청 시 p99가 5-30초로 폭등
 *
 * 실행: k6 run k6/scenarios/02-lunch-rush.js
 */

import { BASE_URL } from '../config/environments.js';
import { lunchRushThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { weightedPicker, postIdPicker, actionPicker } from '../utils/distributions.js';
import { quickThink, urgentThink } from '../utils/think-time.js';
import { browseBoardPosts } from '../flows/browse-board.js';
import { readPostWithComments } from '../flows/read-post.js';
import { reactToPost, toggleScrap } from '../flows/engage-post.js';
import { writeComment } from '../flows/write-comment.js';
import { searchPosts, randomKeyword, searchPage } from '../flows/search.js';
import { pollUnreadCount } from '../flows/poll-notifications.js';
import { getHotPosts } from '../flows/hot-posts.js';

const boards = JSON.parse(open('../data/boards.json'));
const seedPosts = JSON.parse(open('../data/seed-posts.json'));

const PEAK_VUS = parseInt(__ENV.K6_LUNCH_PEAK || '500', 10);

export const options = {
  scenarios: {
    lunch_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(PEAK_VUS * 0.3) },
        { duration: '1m', target: Math.round(PEAK_VUS * 0.6) },
        { duration: '2m', target: PEAK_VUS },                    // 피크 2분 유지
        { duration: '2m', target: Math.round(PEAK_VUS * 0.6) },
        { duration: '1m', target: Math.round(PEAK_VUS * 0.3) },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: lunchRushThresholds,
};

const pickBoard = weightedPicker(boards);
const pickPostId = postIdPicker(seedPosts.hotPostIds, seedPosts.totalPosts, 1.07);
const pickAction = actionPicker({
  browse: 35,
  read_post: 25,
  hot_posts: 10,
  poll_notifications: 10,
  reaction: 8,
  write_comment: 5,
  search: 4,
  scrap: 3,
});

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'lunch_rush' };
  const action = pickAction();

  switch (action) {
    case 'browse': {
      browseBoardPosts(token, pickBoard(), { page: 0 }, tags);
      quickThink();  // 점심시간: 급하게 스크롤
      break;
    }
    case 'read_post': {
      readPostWithComments(token, pickPostId(), tags);
      quickThink();
      break;
    }
    case 'hot_posts': {
      getHotPosts(tags);
      quickThink();
      break;
    }
    case 'poll_notifications': {
      pollUnreadCount(token, tags);
      urgentThink();
      break;
    }
    case 'reaction': {
      reactToPost(token, pickPostId(), 'LIKE', tags);
      urgentThink();
      break;
    }
    case 'write_comment': {
      writeComment(token, pickPostId(), {}, tags);
      quickThink();
      break;
    }
    case 'search': {
      searchPosts(randomKeyword(), { page: searchPage() }, tags);
      quickThink();
      break;
    }
    case 'scrap': {
      toggleScrap(token, pickPostId(), tags);
      urgentThink();
      break;
    }
    default: {
      browseBoardPosts(token, pickBoard(), {}, tags);
      quickThink();
    }
  }
}
