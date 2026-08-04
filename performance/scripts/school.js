/**
 * 학교/급식 부하 스크립트 — 학교 검색 / 오늘·월간 급식.
 *
 * 검증 포인트:
 *  - /schools/search : 이름 LIKE 검색 (학교 수천 건 — 인덱스/캐시 효과)
 *  - /schools/meals/* : NEIS 연동 데이터. 동일 학교·날짜 반복 조회이므로
 *    캐시 히트율이 100%에 가까워야 정상. 미스 시 외부 API 지연 전파 관찰
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, tags, thinkTime } from './lib/config.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

const SCHOOL_TERMS = ['고등학교', '여자고', '외국어', '과학', '대신', '서울', '부산', '중앙'];

export function searchSchools(name) {
  const res = http.get(
    `${BASE_URL}/api/schools/search?name=${encodeURIComponent(name)}`,
    tags('school', 'read', 'school_search'),
  );
  check(res, { 'school search 200': (r) => r.status === 200 });
  return res;
}

export function todayMeal() {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/schools/meals/today`,
      tags('school', 'read', 'meal_today'),
    );
    // `status < 500`으로 두면 400(SCHOOL_NOT_ASSIGNED)이 통과해버린다 — 실제로 요청의
    // 53%가 실패하는데 checks는 100%로 보고되어, 조회 성능이 아니라 에러 경로를
    // 측정하고 있다는 사실이 가려졌다(실측). 시드가 학교를 배정하므로 200이 정상이다.
    // 급식이 없는 날은 200 + 빈 배열로 응답한다(확인함).
    check(res, { 'meal today 200': (r) => r.status === 200 });
    return res;
  });
}

export function monthMeal(year, month) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/schools/meals/month?year=${year}&month=${month}`,
      tags('school', 'read', 'meal_month'),
    );
    check(res, { 'meal month 200': (r) => r.status === 200 });
    return res;
  });
}

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 급식은 아침 등교 시간대에 호출 폭증 — 캐시 전제 SLO
    'http_req_duration{name:meal_today}': ['p(95)<200'],
  }),
};

export default function () {
  ensureSession(myUser());
  todayMeal();
  sleep(thinkTime());
  if (Math.random() < 0.3) {
    const now = new Date();
    monthMeal(now.getFullYear(), now.getMonth() + 1);
    sleep(thinkTime());
  }
  if (Math.random() < 0.1) {
    searchSchools(SCHOOL_TERMS[Math.floor(Math.random() * SCHOOL_TERMS.length)]);
    sleep(thinkTime());
  }
}

export const handleSummary = makeHandleSummary('school');
