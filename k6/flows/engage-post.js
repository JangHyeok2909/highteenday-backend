/**
 * 게시글 반응 플로우
 * POST /api/posts/{postId}/reaction?type=LIKE|DISLIKE
 * POST /api/posts/{postId}/scraps
 */

import { check } from 'k6';
import { authedPost } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

/**
 * 게시글 좋아요/싫어요 토글
 * @param {string} token
 * @param {number} postId
 * @param {string} type - 'LIKE' 또는 'DISLIKE'
 * @param {Object} extraTags
 * @returns {Object|null}
 */
export function reactToPost(token, postId, type, extraTags) {
  const url = `${BASE_URL}/api/posts/${postId}/reaction?type=${type || 'LIKE'}`;
  const tags = { endpoint: 'reaction', postId: String(postId), type: type || 'LIKE', ...(extraTags || {}) };

  const res = authedPost(url, null, token, tags);

  check(res, {
    'reaction: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 게시글 스크랩 토글
 * @param {string} token
 * @param {number} postId
 * @param {Object} extraTags
 */
export function toggleScrap(token, postId, extraTags) {
  const url = `${BASE_URL}/api/posts/${postId}/scraps`;
  const tags = { endpoint: 'scrap', postId: String(postId), ...(extraTags || {}) };

  const res = authedPost(url, null, token, tags);

  check(res, {
    'scrap: status 200': (r) => r.status === 200,
  });
}

/**
 * 댓글 좋아요 토글
 */
export function reactToComment(token, commentId, type, extraTags) {
  const url = `${BASE_URL}/api/comments/${commentId}/reaction?type=${type || 'LIKE'}`;
  const tags = { endpoint: 'reaction', commentId: String(commentId), type: type || 'LIKE', ...(extraTags || {}) };

  const res = authedPost(url, null, token, tags);

  check(res, {
    'comment reaction: status 200': (r) => r.status === 200,
  });
}
