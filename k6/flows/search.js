/**
 * 검색 플로우
 * GET /api/posts/search?query=&page=&searchType=
 */

import { check } from 'k6';
import { publicGet } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

const SEARCH_TYPES = ['TITLE', 'CONTENT', 'TITLE_CONTENT'];

const DEFAULT_KEYWORDS = ['급식', '수능', '시험', '선생님', '야자', '공부', '수학', '영어', '체육', '축제'];

/**
 * 게시글 검색
 * @param {string} query - 검색어
 * @param {Object} opts - {page, searchType}
 * @param {Object} extraTags
 * @returns {Object|null}
 */
export function searchPosts(query, opts, extraTags) {
  const page = (opts && opts.page !== undefined) ? opts.page : 0;
  const searchType = (opts && opts.searchType) || SEARCH_TYPES[Math.floor(Math.random() * SEARCH_TYPES.length)];

  const encodedQuery = encodeURIComponent(query);
  const url = `${BASE_URL}/api/posts/search?query=${encodedQuery}&page=${page}&searchType=${searchType}`;
  const tags = {
    endpoint: 'search',
    searchType,
    page: String(page),
    ...(extraTags || {}),
  };

  const res = publicGet(url, tags);

  check(res, {
    'search: status 200': (r) => r.status === 200,
  });

  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

/**
 * 랜덤 키워드 선택
 */
export function randomKeyword(keywords) {
  const list = keywords || DEFAULT_KEYWORDS;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * deep page 포함 랜덤 페이지 (검색 전용)
 * 95% page 0-4, 5% deep page
 */
export function searchPage() {
  const r = Math.random();
  if (r < 0.50) return 0;
  if (r < 0.75) return 1;
  if (r < 0.88) return 2;
  if (r < 0.95) return Math.floor(Math.random() * 5) + 3;
  // 5% deep page: 50, 100, 200
  const deepPages = [50, 100, 200];
  return deepPages[Math.floor(Math.random() * deepPages.length)];
}
