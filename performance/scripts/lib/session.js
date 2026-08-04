/**
 * 세션 관리 — 로그인 / 토큰 재발급 / 로그아웃.
 *
 * HighTeenDay는 JWT를 HttpOnly 쿠키(accessToken / refreshToken)로 내려준다.
 * k6는 VU마다 독립 쿠키 저장소를 가지므로 로그인 후 별도 헤더 관리가 필요 없다.
 * 401 발생 시 /api/token/refresh 로 재발급 후 1회 재시도한다.
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, SEED_PASSWORD, tags } from './config.js';

export const tokenRefreshes = new Counter('auth_token_refreshes');
export const authFailures = new Counter('auth_failures');

/** 로그인. 성공 시 쿠키 저장소에 accessToken/refreshToken이 심어진다. */
export function login(user) {
  const res = http.post(
    `${BASE_URL}/api/user/login`,
    JSON.stringify({ email: user.email, password: user.password || SEED_PASSWORD }),
    Object.assign(
      { headers: { 'Content-Type': 'application/json' } },
      tags('auth', 'write', 'login'),
    ),
  );
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) {
    authFailures.add(1);
    fail(`login failed: ${res.status} ${String(res.body).slice(0, 120)} (${user.email})`);
  }
  return res;
}

export function refreshToken() {
  const res = http.post(`${BASE_URL}/api/token/refresh`, null, tags('auth', 'write', 'token_refresh'));
  tokenRefreshes.add(1);
  check(res, { 'refresh 200': (r) => r.status === 200 });
  return res;
}

export function logout() {
  const res = http.post(`${BASE_URL}/api/user/logout`, null, tags('auth', 'write', 'logout'));
  check(res, { 'logout 200': (r) => r.status === 200 });
  return res;
}

/**
 * 인증이 필요한 요청 래퍼 — 401이면 refresh 후 1회 재시도.
 * 장시간 soak 테스트에서 access token 만료를 사용자처럼 처리하기 위함이다.
 */
export function withAuth(fn) {
  let res = fn();
  if (res && res.status === 401) {
    refreshToken();
    res = fn();
  }
  return res;
}

/**
 * 매 iteration 시작 시 accessToken 쿠키가 있는지 확인하고, 없으면 로그인한다.
 *
 * ⚠ k6는 같은 VU 안에서도 **iteration마다 쿠키 저장소를 리셋한다**(실측 확인됨 —
 * VU 모듈 스코프 변수는 iteration 사이에 그대로 남아있지만, http.cookieJar()의
 * 쿠키는 리셋된다). 그래서 "VU 최초 1회만 로그인" 방식(모듈 스코프 플래그만으로
 * 판단)은 2번째 iteration부터 쿠키 없이 요청을 보내 전부 401이 난다.
 * 매번 쿠키 존재 여부를 실제로 확인해서, 없을 때만 다시 로그인한다 — 결과적으로는
 * 매 iteration 로그인하는 것과 같지만(k6가 매번 리셋하므로), 코드는 미래에 k6가
 * 쿠키를 유지하는 방향으로 바뀌어도 그대로 안전하게 동작한다.
 */
export function ensureSession(user) {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  if (!cookies.accessToken || !cookies.accessToken[0]) {
    login(user);
  }
  return user;
}

/** WebSocket 핸드셰이크용 Cookie 헤더 문자열을 쿠키 저장소에서 꺼낸다. */
export function cookieHeader() {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  return Object.entries(cookies)
    .map(([name, values]) => `${name}=${values[0]}`)
    .join('; ');
}
