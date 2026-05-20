/**
 * 인기글 조회 플로우
 * GET /api/hotposts/daily
 */

import { check } from 'k6';
import { publicGet } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

/**
 * 일간 인기글 조회
 * @param {Object} extraTags
 * @returns {Array|null}
 */
export function getHotPosts(extraTags) {
  const url = `${BASE_URL}/api/hotposts/daily`;
  const tags = { endpoint: 'hot_posts', ...(extraTags || {}) };

  const res = publicGet(url, tags);

  check(res, {
    'hot posts: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}
