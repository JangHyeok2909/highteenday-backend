/**
 * 댓글 작성 플로우
 * POST /api/posts/{postId}/comments
 */

import { check } from 'k6';
import { authedPost } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

const COMMENT_BODIES = [
  '인정합니다',
  '저도 같은 생각이에요',
  '대박 ㅋㅋㅋ',
  '진짜요?',
  '공감합니다',
  'ㅇㅈ',
  '좋은 글이네요',
  '궁금했는데 감사합니다',
  'ㅋㅋㅋㅋ',
  '와 대박',
  '저도요!',
  '맞아맞아',
  '헐 진짜?',
  '좋은 정보 감사합니다',
  '응원합니다!',
];

/**
 * 댓글 작성
 * @param {string} token
 * @param {number} postId
 * @param {Object} opts - {content, anonymous, parentId}
 * @param {Object} extraTags
 * @returns {boolean} 성공 여부
 */
export function writeComment(token, postId, opts, extraTags) {
  const content = (opts && opts.content) || COMMENT_BODIES[Math.floor(Math.random() * COMMENT_BODIES.length)];
  const anonymous = (opts && opts.anonymous !== undefined) ? opts.anonymous : Math.random() < 0.4;

  const body = {
    content,
    anonymous,
    url: null,
  };
  if (opts && opts.parentId) {
    body.parentId = opts.parentId;
  }

  const url = `${BASE_URL}/api/posts/${postId}/comments`;
  const tags = { endpoint: 'create_comment', postId: String(postId), ...(extraTags || {}) };

  const res = authedPost(url, body, token, tags);

  if (res.status !== 201) {
    console.warn(`create comment failed: status=${res.status} postId=${postId} body=${String(res.body).slice(0, 300)}`);
  }

  return check(res, {
    'create comment: status 201': (r) => r.status === 201,
  });
}
