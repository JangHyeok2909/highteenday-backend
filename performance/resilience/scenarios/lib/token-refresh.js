/**
 * 토큰 재발급 — 세션. 재시도가 로그아웃시킨다.
 *
 * 재발급은 성공하는 순간 옛 refresh 토큰을 무효로 만든다(TokenService.saveOrUpdate 가 옛
 * Redis 키를 지우고 DB 행을 덮어쓴다). 응답이 유실되면 클라이언트 쿠키에는 아직 옛 토큰이
 * 남아 있고, 그 토큰으로 재시도하면 서버에 없는 토큰이라 401 이 나간다. 사용자 입장에서는
 * 로그인이 풀린 것이다(performance/cases/retry-after-lost-response.md).
 *
 * DB 행으로는 안 보인다. 판정은 `session_lost` — 재시도가 401 을 받은 횟수 — 로 한다.
 * 재시도의 응답까지 잃으면 401 을 볼 기회가 없어 이 카운터에 안 잡히므로, 이 값은 실제
 * 끊긴 세션 수의 **하한**이다.
 */
import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { BASE_URL } from '../../../scripts/lib/config.js';
import { login } from '../../../scripts/lib/session.js';
import { attempt, opts } from './attempt.js';

export const key = 'token_refresh';
export const kind = 'session';

/**
 * 이 액션만 쓰는 카운터라 여기서 등록한다. 태그 없는 단일 값이라 threshold 로 서브메트릭을
 * 만들 필요가 없고, 그래서 이 모듈을 빼도 k6 가 "등록되지 않은 메트릭" 으로 멈추지 않는다.
 */
export const sessionLost = new Counter('session_lost');

export function run(user) {
  const url = `${BASE_URL}/api/token/refresh`;
  attempt(key, () => http.post(url, null, opts('auth', 'auth', 'token_refresh')), (retryRes) => {
    if (retryRes.status !== 401) return;
    sessionLost.add(1);
    // 관측 때문이 아니라 오염을 막으려고 되살린다. 세션이 죽은 채로 두면 이 VU 의 남은
    // iteration 이 전부 인증 실패로 끝나, 다른 액션의 의도 건수가 실제 부하와 무관하게 줄어든다.
    login(user);
  });
  return true;
}
