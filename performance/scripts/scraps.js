/**
 * 스크랩 부하 스크립트 — 게시글 스크랩 토글 + 마이페이지 스크랩 목록.
 *
 * 검증 포인트:
 *  - 스크랩 토글 → Post.scrapCount 비정규화 카운터 갱신
 *  - /api/mypage/scraps 페이징 조회 비용
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
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

export const handleSummary = makeHandleSummary('scraps');
