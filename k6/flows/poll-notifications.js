/**
 * 알림 폴링 플로우
 * GET /api/notifications/unread-count
 * GET /api/notifications?page=&size=
 */

import { check } from 'k6';
import { authedGet, authedPatch } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

/**
 * 읽지 않은 알림 개수 조회
 * @param {string} token
 * @param {Object} extraTags
 * @returns {number} 읽지 않은 알림 수
 */
export function pollUnreadCount(token, extraTags) {
  const url = `${BASE_URL}/api/notifications/unread-count`;
  const tags = { endpoint: 'unread_count', ...(extraTags || {}) };

  const res = authedGet(url, token, tags);

  check(res, {
    'unread count: status 200': (r) => r.status === 200,
  });

  try {
    return parseInt(res.body, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * 알림 목록 조회
 * @param {string} token
 * @param {Object} opts - {page, size}
 * @param {Object} extraTags
 * @returns {Object|null}
 */
export function listNotifications(token, opts, extraTags) {
  const page = (opts && opts.page !== undefined) ? opts.page : 0;
  const size = (opts && opts.size) || 20;

  const url = `${BASE_URL}/api/notifications?page=${page}&size=${size}`;
  const tags = { endpoint: 'notification_list', ...(extraTags || {}) };

  const res = authedGet(url, token, tags);

  check(res, {
    'notification list: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 알림 읽음 처리
 */
export function markNotificationRead(token, notificationId, extraTags) {
  const url = `${BASE_URL}/api/notifications/${notificationId}/read`;
  const tags = { endpoint: 'mark_read', ...(extraTags || {}) };

  authedPatch(url, null, token, tags);
}
