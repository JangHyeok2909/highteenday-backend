/**
 * 게시글 작성 플로우
 * POST /api/posts
 */

import { check } from 'k6';
import { authedPost } from '../utils/http-helpers.js';
import { BASE_URL } from '../config/environments.js';

const TITLES = [
  '오늘 급식 어땠어요?',
  '시험 범위 질문이요',
  '수능 D-100 화이팅',
  '야자 빠지는 법 아는 사람?',
  '체육대회 언제임?',
  '점심시간 뭐해요?',
  '동아리 추천해주세요',
  '수학 질문이요 ㅠㅠ',
  '영어 단어 외우는 팁',
  '대학 어디 가고 싶어요?',
];

const CONTENTS = [
  '제목 그대로입니다. 의견 부탁드려요!',
  '진지하게 고민 중인데 도움 부탁합니다.',
  '여러분은 어떻게 생각하세요?',
  '경험 있으신 분 답변 부탁드립니다.',
  '오늘 있었던 일인데 공유합니다.',
];

/**
 * 게시글 작성
 * @param {string} token
 * @param {number} boardId
 * @param {Object} opts - {title, content, anonymous}
 * @param {Object} extraTags
 * @returns {boolean}
 */
export function writePost(token, boardId, opts, extraTags) {
  const title = (opts && opts.title) || TITLES[Math.floor(Math.random() * TITLES.length)];
  const content = (opts && opts.content) || CONTENTS[Math.floor(Math.random() * CONTENTS.length)];
  const anonymous = (opts && opts.anonymous !== undefined) ? opts.anonymous : Math.random() < 0.5;

  const body = {
    boardId,
    title,
    content,
    anonymous,
  };

  const url = `${BASE_URL}/api/posts`;
  const tags = { endpoint: 'create_post', boardId: String(boardId), ...(extraTags || {}) };

  const res = authedPost(url, body, token, tags);

  if (res.status !== 201) {
    console.warn(`create post failed: status=${res.status} boardId=${boardId} body=${String(res.body).slice(0, 300)}`);
  }

  return check(res, {
    'create post: status 201': (r) => r.status === 201,
  });
}
