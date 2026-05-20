/**
 * 게시판 글 목록 브라우징 플로우
 * GET /api/boards/{boardId}/posts?page=&sortType=&size=
 */

import { check } from 'k6';
import { authedGet, publicGet } from '../utils/http-helpers.js';
import { randomPage } from '../utils/distributions.js';
import { BASE_URL } from '../config/environments.js';

const SORT_TYPES = ['RECENT', 'LIKE', 'VIEW'];

/**
 * 게시판 글 목록 조회
 * @param {string} token - null이면 비인증
 * @param {number} boardId
 * @param {Object} opts - {page, size, sortType}
 * @param {Object} extraTags
 * @returns {Object} 응답 body (파싱됨)
 */
export function browseBoardPosts(token, boardId, opts, extraTags) {
  const page = (opts && opts.page !== undefined) ? opts.page : randomPage(50);
  const size = (opts && opts.size) || 10;
  const sortType = (opts && opts.sortType) || SORT_TYPES[0];

  const url = `${BASE_URL}/api/boards/${boardId}/posts?page=${page}&size=${size}&sortType=${sortType}`;
  const tags = { endpoint: 'board_posts', boardId: String(boardId), page: String(page), ...(extraTags || {}) };

  const res = token ? authedGet(url, token, tags) : publicGet(url, tags);

  check(res, {
    'board posts: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 게시판 글 목록에서 게시글 ID 배열 추출
 */
export function extractPostIds(boardResponse) {
  if (!boardResponse || !boardResponse.content) return [];
  return boardResponse.content.map((p) => p.id).filter(Boolean);
}
