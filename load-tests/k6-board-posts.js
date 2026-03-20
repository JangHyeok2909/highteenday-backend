/**
 * GET /api/boards/{boardId}/posts 부하 테스트 (k6)
 *
 * 목적:
 * - 서버 최대 처리량(TPS) 확인
 * - 고부하 환경에서 latency 변화 측정
 * - 병목 지점(DB, N+1, 정렬 쿼리) 탐지
 *
 *
 * 실행
 * k6 run load-tests/k6-board-posts.js
 *
 * 환경변수
 * BASE_URL  (default: http://localhost:8080)
 * BOARD_ID  (default: 1)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const BOARD_ID = __ENV.BOARD_ID || '1';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // 워밍업
    { duration: '1m', target: 300 },   // 증가
    { duration: '2m', target: 300 },   // 유지
    { duration: '30s', target: 500 },  // 스트레스
    { duration: '30s', target: 0 },    // 종료
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

// 초기 페이지 수 확인
export function setup() {
  const res = http.get(`${BASE_URL}/api/boards/${BOARD_ID}/posts?page=0`);

  let totalPages = 10;

  try {
    const body = JSON.parse(res.body);
    if (body.totalPages && body.totalPages > 0) {
      totalPages = body.totalPages;
    }
  } catch (e) {}

  return { totalPages };
}

export default function (data) {
  let sortType = 'RECENT';
  let useCursor = false;
  let lastId = null;

  // 🔥 1. 무조건 첫 진입 (page=0)
  let res = http.get(`${BASE_URL}/api/boards/${BOARD_ID}/posts?page=0&sortType=${sortType}`);

  let body;
  try {
    body = JSON.parse(res.body);
    if (body.postPreviewDtos?.length > 0) {
      lastId = body.postPreviewDtos[body.postPreviewDtos.length - 1].id;
      useCursor = true;
    }
  } catch {}

  check(res, {
    'status 200': (r) => r.status === 200,
  });

  sleep(Math.random() * 1 + 0.5);

  // 🔥 2. 유저 행동 (세션)
  while (true) {
    let url;

    if (useCursor && lastId) {
      url = `${BASE_URL}/api/boards/${BOARD_ID}/posts?lastId=${lastId}&sortType=${sortType}`;
    } else {
      url = `${BASE_URL}/api/boards/${BOARD_ID}/posts?page=0&sortType=${sortType}`;
    }

    res = http.get(url);

    try {
      body = JSON.parse(res.body);
      if (body.postPreviewDtos?.length > 0) {
        lastId = body.postPreviewDtos[body.postPreviewDtos.length - 1].id;
      }
    } catch {}

    check(res, {
      'status 200': (r) => r.status === 200,
    });

    // 🔥 행동 결정
    const r = Math.random();

    if (r < 0.65) {
      // 계속 스크롤
      useCursor = true;

    } else if (r < 0.80) {
      // 정렬 변경
      const s = Math.random();
      if (s < 0.7) sortType = 'RECENT';
      else if (s < 0.85) sortType = 'VIEW';
      else sortType = 'LIKE';

      useCursor = false;
      lastId = null;

    } else if (r < 0.90) {
      // 홈으로
      useCursor = false;
      lastId = null;

    } else {
      // 아무것도 안함
    }

    sleep(Math.random() * 1 + 0.3); // 0.3~1.3초
  }

  // 🔥 세션 종료 후 재진입 대기
  sleep(randomIntBetween(2, 5));
}
/**
 * 부하 테스트 1차 결과(v.0)
 * 테스트 환경
 * - 최대 동시 사용자: 500
 * - 총 요청 수: 535,466
 *
 * 성능 결과
 * - p95 latency: 119ms
 * - 평균 응답시간: 28ms
 * - 최대 처리량: 1982 req/s
 * - 실패율: 0%
 * 개선 포인트
 * - N+1 제거: Post.toPrevDto()에서 user, board 지연 로딩 → 페이지당 10개면 최대 20번 추가 쿼리
 *    → findByBoard에 @EntityGraph(attributePaths = {"user","board"}) 또는 fetch join 적용
 * - DB 인덱스: 정렬(sortType)별 복합 인덱스
 *    - RECENT: (BRD_id, is_valid, created_at DESC)
 *    - LIKE:   (BRD_id, is_valid, PST_like_count DESC)
 *    - VIEW:   (BRD_id, is_valid, PST_view_count DESC)
 */
/**
 * 부하 테스트 2차 결과(v.1)
 * 개선포인트
 * -기존 N+1 문제 해결
 * 성능결과
 * - p95 latency: 73ms (38퍼센트 개선)
 * - 평균 응답시간: 17ms
 * - 최대 처리량: 2160 req/s
 * - 실패율: 0%
 */

/**
 * 부하 테스트 3차 결과(v.2)
 * 
 */