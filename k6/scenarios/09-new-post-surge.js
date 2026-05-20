/**
 * 시나리오 09: 신규 글 + 폴링 증가 (New Post + Polling Surge)
 *
 * 목적: 캐시 무효화 쓰래싱 재현
 * Executor: ramping-vus (Writer 20 VU + Reader 100 VU)
 * 타겟 병목: 매 글 생성 시 evictBoard() → 캐시 영구 cold → 리더 DB fallback
 * 관찰: 캐시 hit ratio, findByBoard DB 호출 수
 * 예상: 캐시 영구 cold 상태, 리더 latency 간헐적 폭등
 *
 * 실행: k6 run k6/scenarios/09-new-post-surge.js
 */

import { sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { getToken } from '../utils/auth.js';
import { quickThink } from '../utils/think-time.js';
import { browseBoardPosts } from '../flows/browse-board.js';
import { writePost } from '../flows/write-post.js';
import { readPostDetail } from '../flows/read-post.js';

const WRITER_VUS = parseInt(__ENV.K6_WRITER_VUS || '20', 10);
const READER_VUS = parseInt(__ENV.K6_READER_VUS || '100', 10);
const DURATION = __ENV.K6_SURGE_DURATION || '2m';
const TARGET_BOARD_ID = 1; // 자유게시판에 집중

export const options = {
  scenarios: {
    // Writer: 글을 계속 생성 → evictBoard() 호출 → 캐시 삭제
    writers: {
      executor: 'constant-vus',
      vus: WRITER_VUS,
      duration: DURATION,
      env: { ROLE: 'writer' },
    },
    // Reader: 같은 게시판을 계속 폴링 → 캐시 미스 → DB fallback
    readers: {
      executor: 'constant-vus',
      vus: READER_VUS,
      duration: DURATION,
      env: { ROLE: 'reader' },
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.03'],
    'http_req_duration{endpoint:board_posts}': ['p(95)<2000'],
    'http_req_duration{endpoint:create_post}': ['p(95)<3000'],
  },
};

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'new_post_surge' };

  if (__ENV.ROLE === 'writer') {
    // 글 작성 → 캐시 eviction 유발
    writePost(token, TARGET_BOARD_ID, {
      title: `부하테스트 글 VU${__VU} ${Date.now()}`,
      content: '캐시 무효화 테스트 콘텐츠입니다.',
    }, tags);
    sleep(2 + Math.random() * 3); // 3-5초 간격으로 글 작성
  } else {
    // 같은 게시판 첫 페이지를 계속 폴링
    browseBoardPosts(token, TARGET_BOARD_ID, { page: 0, sortType: 'RECENT' }, tags);
    sleep(1.5 + Math.random()); // 1.5-2.5초 간격 폴링
  }
}
