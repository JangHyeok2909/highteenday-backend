/**
 * GET /api/boards/{boardId}/posts 스트레스 테스트 (k6)
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
 * PAGE_MAX  (default: 10)  // 실제 페이지 분산
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const BOARD_ID = __ENV.BOARD_ID || '1';
const PAGE_MAX = parseInt(__ENV.PAGE_MAX || '3', 10);

const SORT_TYPES = ['RECENT', 'LIKE', 'VIEW'];

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // 워밍업
    { duration: '1m', target: 300 },   // 고부하 진입
    { duration: '2m', target: 300 },   // 지속 부하
    { duration: '30s', target: 500 },  // 스트레스
    { duration: '30s', target: 0 },    // 종료
  ],

  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {

  const page = randomIntBetween(0, PAGE_MAX);
  const sortType = SORT_TYPES[randomIntBetween(0, SORT_TYPES.length - 1)];

  const url = `${BASE_URL}/api/boards/${BOARD_ID}/posts?page=${page}&sortType=${sortType}`;

  const res = http.get(url, {
    tags: { name: 'BoardPostsAPI' },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'valid response structure': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          typeof body.page === 'number' &&
          typeof body.totalPages === 'number' &&
          typeof body.totalElements === 'number' &&
          Array.isArray(body.postPreviewDtos)
        );
      } catch {
        return false;
      }
    },
  });

  // 처리량 극대화
  sleep(0.1);
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