/**
 * 시나리오 06: 검색 스파이크 (Search Spike)
 *
 * 목적: LIKE 풀 테이블 스캔 + Offset 페이지네이션 비용 드러내기
 * Executor: ramping-arrival-rate (0→50→100→50→0 iter/sec, 5분)
 * 선택 이유: 느린 쿼리가 VU 기반 부하를 자연 감소시키는 것 방지
 * 타겟 병목: containsIgnoreCase → LIKE '%keyword%' 풀 스캔
 * 관찰: 페이지 번호별 응답 시간, HikariCP 포화 시점
 * 예상 장애: 50+ 동시 검색 시 pool 포화, deep page 타임아웃
 *
 * 실행: k6 run k6/scenarios/06-search-spike.js
 */

import { BASE_URL } from '../config/environments.js';
import { searchThresholds } from '../config/thresholds.js';
import { searchPosts, randomKeyword, searchPage } from '../flows/search.js';
import { customThink } from '../utils/think-time.js';

const seedPosts = JSON.parse(open('../data/seed-posts.json'));

const PEAK_RATE = parseInt(__ENV.K6_SEARCH_PEAK_RATE || '100', 10);

export const options = {
  scenarios: {
    search_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: Math.round(PEAK_RATE * 0.2) },
        { duration: '1m', target: Math.round(PEAK_RATE * 0.5) },
        { duration: '1m30s', target: PEAK_RATE },                  // 피크
        { duration: '1m', target: Math.round(PEAK_RATE * 0.5) },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: searchThresholds,
};

const keywords = seedPosts.searchKeywords;

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function () {
  const tags = { scenario: 'search_spike' };
  const keyword = randomKeyword(keywords);
  const page = searchPage();

  searchPosts(keyword, { page }, tags);

  // 검색 결과를 읽는 시간: 1-3초
  customThink(1, 3);
}
