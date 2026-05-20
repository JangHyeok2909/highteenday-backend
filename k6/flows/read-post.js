/**
 * 게시글 상세 조회 + 댓글 조회 플로우
 * GET /api/posts/{postId}
 * GET /api/posts/{postId}/comments
 */

import { check } from 'k6';
import { authedGet, publicGet } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

/**
 * 게시글 상세 조회
 * @param {string|null} token
 * @param {number} postId
 * @param {Object} extraTags
 * @returns {Object|null} 파싱된 응답
 */
export function readPostDetail(token, postId, extraTags) {
  const url = `${BASE_URL}/api/posts/${postId}`;
  const tags = { endpoint: 'post_detail', postId: String(postId), ...(extraTags || {}) };

  const res = token ? authedGet(url, token, tags) : publicGet(url, tags);

  check(res, {
    'post detail: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 게시글 댓글 목록 조회
 * @param {string|null} token
 * @param {number} postId
 * @param {Object} extraTags
 * @returns {Array|null}
 */
export function readComments(token, postId, extraTags) {
  const url = `${BASE_URL}/api/posts/${postId}/comments`;
  const tags = { endpoint: 'comments', postId: String(postId), ...(extraTags || {}) };

  const res = token ? authedGet(url, token, tags) : publicGet(url, tags);

  check(res, {
    'comments: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 게시글 상세 + 댓글 한 번에 조회 (실제 사용자 행동)
 */
export function readPostWithComments(token, postId, extraTags) {
  const post = readPostDetail(token, postId, extraTags);
  const comments = readComments(token, postId, extraTags);
  return { post, comments };
}
