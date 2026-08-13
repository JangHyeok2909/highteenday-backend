/**
 * 마이페이지 부하 스크립트 — 내 글 / 내 댓글 / 내 정보.
 *
 * 검증 포인트:
 *  - 사용자별 작성물 페이징 — (USR_id, is_valid, created) 복합 인덱스 유무 효과
 *  - /userInfo 는 세션 검증 겸용으로 빈번히 호출됨
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export function userInfo() {
  return withAuth(() => {
    const res = http.get(`${BASE_URL}/api/user/userInfo`, tags('mypage', 'read', 'user_info'));
    check(res, { 'user info 200': (r) => r.status === 200 });
    return res;
  });
}

// sortType은 필수 파라미터다 — 빼면 400("Required request parameter 'sortType' ...")이 떨어져
// 부하가 조회 경로가 아니라 에러 경로를 때린다(실측). 값: LIKE | VIEW | RECENT.
export function myPosts(page = 0, sortType = 'RECENT') {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/mypage/posts?page=${page}&sortType=${sortType}`,
      tags('mypage', 'read', 'my_posts'),
    );
    check(res, { 'my posts 200': (r) => r.status === 200 });
    return res;
  });
}

export function myComments(page = 0, sortType = 'RECENT') {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/mypage/comments?page=${page}&sortType=${sortType}`,
      tags('mypage', 'read', 'my_comments'),
    );
    check(res, { 'my comments 200': (r) => r.status === 200 });
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
  userInfo();
  sleep(thinkTime());
  myPosts();
  sleep(thinkTime());
  if (Math.random() < 0.5) {
    myComments();
    sleep(thinkTime());
  }
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

export const handleSummary = makeHandleSummary('mypage', STANDALONE_PLAN);
