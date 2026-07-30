/**
 * 인증 부하 스크립트 — login / token refresh / logout.
 *
 * 검증 포인트:
 *  - BCrypt 검증은 CPU-bound. 로그인 TPS가 코어 수에 선형 종속되는지 확인
 *  - refresh는 Token 테이블(DB) 조회+갱신 — DB 커넥션 경합 관찰
 *
 * 단독 실행:
 *   k6 run scripts/auth.js -e BASE_URL=http://localhost:8080 -e DATASET=small
 */
import { sleep } from 'k6';
import { DEFAULT_THRESHOLDS, thinkTime } from './lib/config.js';
import { login, refreshToken, logout } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export { login, refreshToken, logout }; // 시나리오에서 재사용

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '1m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // BCrypt 원가(코어당 ~10ms x cost factor)를 감안해 로그인만 별도 SLO
    'http_req_duration{name:login}': ['p(95)<800'],
  }),
};

export default function () {
  const user = myUser();
  login(user);            // 세션 수립 (쿠키 발급)
  sleep(thinkTime());
  refreshToken();         // 토큰 재발급 왕복
  sleep(thinkTime());
  logout();               // 서버측 refresh token 삭제 + 쿠키 만료
  sleep(thinkTime());
}

export const handleSummary = makeHandleSummary('auth');
