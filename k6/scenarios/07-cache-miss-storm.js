/**
 * 시나리오 07: 캐시 미스 폭주 (Cache Miss Storm / Thundering Herd)
 *
 * 목적: Cache Stampede 재현 (singleflight 보호 없음)
 * Executor: constant-vus (200 VU, 동시 시작)
 * 사전 작업: Redis 캐시 수동 flush 필요!
 *   redis-cli DEL $(redis-cli KEYS "board:*" | tr '\n' ' ')
 *   redis-cli DEL $(redis-cli KEYS "posts:*" | tr '\n' ' ')
 * 타겟 병목: 200 스레드 전부 DB 조회 → HikariCP 10개만 통과
 * 예상 장애: 첫 10개 50ms, 나머지 190개 5-30초 대기
 *
 * 실행: k6 run k6/scenarios/07-cache-miss-storm.js
 */

import { sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { cacheMissThresholds } from '../config/thresholds.js';
import { getToken } from '../utils/auth.js';
import { browseBoardPosts } from '../flows/browse-board.js';
import { getHotPosts } from '../flows/hot-posts.js';

const VUS = parseInt(__ENV.K6_CACHEMISS_VUS || '200', 10);

export const options = {
  scenarios: {
    // Phase 1: Thundering herd — 모든 VU가 동시에 같은 캐시 키 요청
    thundering_herd: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: VUS,       // 각 VU가 정확히 1회 요청
      maxDuration: '30s',
    },
    // Phase 2: 캐시 워밍업 후 정상 상태 확인
    post_warmup: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      startTime: '35s',      // thundering herd 종료 후 5초 대기
    },
  },
  thresholds: cacheMissThresholds,
};

export function setup() {
  console.log('====================================================');
  console.log('WARNING: Redis 캐시를 먼저 flush해야 정확한 결과를 얻습니다!');
  console.log('  redis-cli KEYS "board:*" | xargs redis-cli DEL');
  console.log('  redis-cli KEYS "posts:*" | xargs redis-cli DEL');
  console.log('====================================================');

  return { baseUrl: BASE_URL };
}

export default function () {
  const token = getToken(__VU - 1);
  const tags = { scenario: 'cache_miss_storm' };

  if (__ENV.SCENARIO === 'thundering_herd' ||
      (__ITER === 0 && __VU <= VUS)) {
    // Phase 1: 모든 VU가 boardId=1의 page=0을 동시 요청
    browseBoardPosts(token, 1, { page: 0, sortType: 'RECENT' }, tags);
  } else {
    // Phase 2: 다양한 게시판/페이지로 정상 패턴 (캐시 warm 상태)
    const boardId = Math.ceil(Math.random() * 5);
    const page = Math.floor(Math.random() * 3);
    browseBoardPosts(token, boardId, { page }, tags);
    sleep(1 + Math.random() * 2);
  }
}
