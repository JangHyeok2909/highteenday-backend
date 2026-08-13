/**
 * 스크랩 부하 스크립트 — 게시글 스크랩 토글 + 마이페이지 스크랩 목록.
 *
 * 검증 포인트:
 *  - 스크랩 토글 → Post.scrapCount 비정규화 카운터 갱신
 *  - /api/mypage/scraps 페이징 조회 비용
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, hotPost } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export function scrapPost(postId) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/posts/${postId}/scraps`, null,
      tags('scrap', 'write', 'scrap_toggle'),
    );
    check(res, { 'scrap 2xx': (r) => r.status >= 200 && r.status < 300 });
    return res;
  });
}

export function myScraps(page = 0) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/mypage/scraps?page=${page}`,
      tags('scrap', 'read', 'scrap_list'),
    );
    check(res, { 'scrap list 200': (r) => r.status === 200 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  ensureSession(myUser());
  scrapPost(hotPost().id);
  sleep(thinkTime());
  myScraps();
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

export const handleSummary = makeHandleSummary('scraps', STANDALONE_PLAN);
