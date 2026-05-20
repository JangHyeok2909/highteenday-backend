/**
 * 시나리오 05: 알림 폭주 (Notification Storm)
 *
 * 목적: 알림 폴링 무캐시 DB 부하 드러내기
 * Executor: constant-vus (300 VU, 3분)
 * 타겟 병목: COUNT 쿼리 10회/초 + HikariCP 10개 커넥션 경쟁
 * 관찰: unread-count 응답 시간 추이, 게시판 목록 latency 교차 영향
 * 예상 장애: DB 커넥션 기아로 게시판 조회까지 영향
 *
 * 실행: k6 run k6/scenarios/05-notification-storm.js
 */

import { sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { notificationThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { weightedPicker, actionPicker } from '../utils/distributions.js';
import { normalThink, quickThink } from '../utils/think-time.js';
import { pollUnreadCount, listNotifications } from '../flows/poll-notifications.js';
import { browseBoardPosts } from '../flows/browse-board.js';
import { readPostDetail } from '../flows/read-post.js';
import { getHotPosts } from '../flows/hot-posts.js';

const boards = JSON.parse(open('../data/boards.json'));

const VUS = parseInt(__ENV.K6_NOTIF_VUS || '300', 10);
const DURATION = __ENV.K6_NOTIF_DURATION || '3m';

export const options = {
  scenarios: {
    notification_storm: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: notificationThresholds,
};

const pickBoard = weightedPicker(boards);

// 알림 폴링 비중을 크게 높임 (실제 서비스: 30초마다 폴링하는 300명)
const pickAction = actionPicker({
  poll_unread: 40,        // 핵심: 알림 폴링 40%
  notification_list: 15,  // 알림 목록 확인
  browse: 25,             // 일반 브라우징 (교차 영향 측정용)
  read_post: 15,
  hot_posts: 5,
});

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'notification_storm' };
  const action = pickAction();

  switch (action) {
    case 'poll_unread': {
      pollUnreadCount(token, tags);
      // 폴링 후 짧은 대기 (30초 폴링 주기 시뮬레이션은 VU 수로 대체)
      quickThink();
      break;
    }
    case 'notification_list': {
      const unread = pollUnreadCount(token, tags);
      if (unread > 0) {
        listNotifications(token, { page: 0 }, tags);
      }
      normalThink();
      break;
    }
    case 'browse': {
      browseBoardPosts(token, pickBoard(), { page: 0 }, tags);
      normalThink();
      break;
    }
    case 'read_post': {
      const postId = Math.floor(Math.random() * 100) + 1;
      readPostDetail(token, postId, tags);
      normalThink();
      break;
    }
    case 'hot_posts': {
      getHotPosts(tags);
      normalThink();
      break;
    }
  }
}
