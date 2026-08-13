/**
 * 게시판/HOT 게시글 부하 스크립트.
 *
 * 검증 포인트:
 *  - GET /api/boards      : Redis 캐시 히트율 (거의 정적 데이터)
 *  - GET /api/hotposts/daily : Redis Sorted Set 리더보드 조회.
 *    HotScoreScheduler 재계산 시점과 겹칠 때 지연 스파이크가 있는지 관찰
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { makeHandleSummary } from './lib/summary.js';

export function listBoards() {
  const res = http.get(`${BASE_URL}/api/boards`, tags('board', 'read', 'board_list'));
  check(res, { 'board list 200': (r) => r.status === 200 });
  return res;
}

export function dailyHotPosts() {
  const res = http.get(`${BASE_URL}/api/hotposts/daily`, tags('hot', 'read', 'hot_daily'));
  check(res, { 'hot daily 200': (r) => r.status === 200 });
  return res;
}

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '1m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 캐시 경로는 더 엄격하게 — 캐시가 동작하면 이 SLO는 여유롭게 통과해야 정상
    'http_req_duration{name:board_list}': ['p(95)<100'],
    'http_req_duration{name:hot_daily}': ['p(95)<150'],
  }),
};

export default function () {
  listBoards();
  sleep(thinkTime());
  dailyHotPosts();
  sleep(thinkTime());
}

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 60),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('boards', STANDALONE_PLAN);
