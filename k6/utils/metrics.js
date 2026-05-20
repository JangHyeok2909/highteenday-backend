/**
 * 엔드포인트별 커스텀 메트릭 정의
 */

import { Trend, Counter, Rate } from 'k6/metrics';

// ── Read 엔드포인트 ─────────────────────────────────────────
export const boardPostsDuration = new Trend('board_posts_duration', true);
export const postDetailDuration = new Trend('post_detail_duration', true);
export const commentListDuration = new Trend('comment_list_duration', true);
export const hotPostsDuration = new Trend('hot_posts_duration', true);
export const unreadCountDuration = new Trend('unread_count_duration', true);
export const notificationListDuration = new Trend('notification_list_duration', true);
export const searchDuration = new Trend('search_duration', true);

// ── Write 엔드포인트 ─────────────────────────────────────────
export const reactionDuration = new Trend('reaction_duration', true);
export const createCommentDuration = new Trend('create_comment_duration', true);
export const createPostDuration = new Trend('create_post_duration', true);
export const scrapDuration = new Trend('scrap_duration', true);
export const loginDuration = new Trend('login_duration', true);

// ── 데이터 정합성 ────────────────────────────────────────────
export const reactionDrift = new Counter('reaction_drift');
export const commentDrift = new Counter('comment_drift');

// ── 에러 카운터 ──────────────────────────────────────────────
export const errorCount = new Counter('error_count');

// ── 메트릭 기록 헬퍼 ─────────────────────────────────────────
const metricMap = {
  board_posts: boardPostsDuration,
  post_detail: postDetailDuration,
  comments: commentListDuration,
  hot_posts: hotPostsDuration,
  unread_count: unreadCountDuration,
  notification_list: notificationListDuration,
  search: searchDuration,
  reaction: reactionDuration,
  create_comment: createCommentDuration,
  create_post: createPostDuration,
  scrap: scrapDuration,
  login: loginDuration,
};

/**
 * 응답 시간을 해당 엔드포인트 메트릭에 기록
 * @param {string} endpoint - 엔드포인트 키
 * @param {number} duration - 응답 시간 (ms)
 */
export function recordDuration(endpoint, duration) {
  const metric = metricMap[endpoint];
  if (metric) {
    metric.add(duration);
  }
}
