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
const PAGE_SIZE = 10;

export const options = {
  stages: [
    { duration: '30s', target: 300 },  // 워밍업
    { duration: '1m',  target: 600 },  // 증가
    { duration: '2m',  target: 1000 },  // 안정 부하
    { duration: '1m',  target: 1400 },  // 스트레스
    { duration: '30s', target: 0 },    // 종료
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

function buildUrl(params) {
  const query = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${BASE_URL}/api/boards/${BOARD_ID}/posts?${query}`;
}

// 초기 total 확인
export function setup() {
  const res = http.get(buildUrl({ page: 0, size: PAGE_SIZE, sortType: 'RECENT', isRandomPage: true }));
  let total = 100000;
  try {
    const body = JSON.parse(res.body);
    if (body.total > 0) total = body.total;
  } catch (e) {}
  return { total };
}

export default function (data) {
  let sortType = 'RECENT';
  let lastSeedId = null;  // RECENT 커서
  let page = 0;           // LIKE/VIEW 오프셋 페이지
  let isSequential = false; // 순차 스크롤 여부

  // ── 1. 첫 진입 (randomPage=true: 랜덤 접근)
  let res = http.get(buildUrl({ page: 0, size: PAGE_SIZE, sortType, isRandomPage: true }));

  let body;
  try {
    body = JSON.parse(res.body);
    if (body.content?.length > 0) {
      lastSeedId = body.content[body.content.length - 1].id;
      isSequential = true;
    }
  } catch {}

  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(Math.random() * 1 + 0.5);

  // ── 2. 유저 행동 루프
  while (true) {
    let url;

    if (isSequential) {
      // 다음 페이지로 이동 → isRandomPage=false
      if (sortType === 'RECENT' && lastSeedId) {
        // RECENT: 커서 기반
        url = buildUrl({ lastSeedId, size: PAGE_SIZE, sortType, isRandomPage: false });
      } else {
        // LIKE/VIEW: 오프셋 기반 순차
        page++;
        url = buildUrl({ page, size: PAGE_SIZE, sortType, isRandomPage: false });
      }
    } else {
      // 랜덤 접근 (정렬 변경, 홈 복귀 등) → isRandomPage=true
      url = buildUrl({ page: 0, size: PAGE_SIZE, sortType, isRandomPage: true });
    }

    res = http.get(url);

    try {
      body = JSON.parse(res.body);
      if (body.content?.length > 0) {
        lastSeedId = body.content[body.content.length - 1].id;
      }
    } catch {}

    check(res, { 'status 200': (r) => r.status === 200 });

    // ── 행동 결정
    const r = Math.random();

    if (r < 0.65) {
      // 계속 스크롤 (다음 페이지 → sequential)
      isSequential = true;

    } else if (r < 0.80) {
      // 정렬 변경 → 랜덤 접근
      const s = Math.random();
      if (s < 0.70) sortType = 'RECENT';
      else if (s < 0.85) sortType = 'VIEW';
      else sortType = 'LIKE';

      isSequential = false;
      lastSeedId = null;
      page = 0;

    } else if (r < 0.90) {
      // 홈으로 → 랜덤 접근
      isSequential = false;
      lastSeedId = null;
      page = 0;

    } else {
      // 아무것도 안함
    }

    sleep(Math.random() * 1 + 0.3);
  }
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