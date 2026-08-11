/**
 * 세션 관리 — 로그인 / 토큰 재발급 / 로그아웃.
 *
 * HighTeenDay는 JWT를 HttpOnly 쿠키(accessToken / refreshToken)로 내려준다.
 * 세션은 config.js의 `vuJar`(VU 단위로 유지되는 쿠키 저장소)에 담기며,
 * 모든 요청은 `tags()`를 통해 이 저장소를 함께 전달받는다.
 * 401 발생 시 /api/token/refresh 로 재발급 후 1회 재시도한다.
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, SEED_PASSWORD, tags, vuJar } from './config.js';

export const tokenRefreshes = new Counter('auth_token_refreshes');
export const authFailures = new Counter('auth_failures');

/** 로그인. 성공 시 쿠키 저장소에 accessToken/refreshToken이 심어진다. */
export function login(user) {
  const res = http.post(
    `${BASE_URL}/api/user/login`,
    JSON.stringify({ email: user.email, password: user.password || SEED_PASSWORD }),
    Object.assign(
      { headers: { 'Content-Type': 'application/json' } },
      tags('auth', 'auth', 'login'),
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
  const res = http.post(`${BASE_URL}/api/token/refresh`, null, tags('auth', 'auth', 'token_refresh'));
  tokenRefreshes.add(1);
  check(res, { 'refresh 200': (r) => r.status === 200 });
  return res;
}

export function logout() {
  const res = http.post(`${BASE_URL}/api/user/logout`, null, tags('auth', 'auth', 'logout'));
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
 * iteration 시작 시 accessToken 쿠키가 있는지 확인하고, 없으면 로그인한다.
 *
 * 세션은 `config.js`의 `vuJar`에 담긴다. k6의 기본 저장소(`http.cookieJar()`)는
 * iteration마다 리셋되지만 모듈 스코프 저장소는 VU 단위로 유지되므로, 실제 사용자처럼
 * VU당 한 번만 로그인하고 이후 iteration은 그 세션을 그대로 쓴다(S-01).
 * 토큰이 만료돼 401이 나면 `withAuth`가 재발급으로 처리한다.
 */
export function ensureSession(user) {
  const cookies = vuJar.cookiesForURL(BASE_URL);
  if (!cookies.accessToken || !cookies.accessToken[0]) {
    login(user);
  }
  return user;
}

/** WebSocket 핸드셰이크용 Cookie 헤더 문자열을 세션 저장소에서 꺼낸다. */
export function cookieHeader() {
  const cookies = vuJar.cookiesForURL(BASE_URL);
  return Object.entries(cookies)
    .map(([name, values]) => `${name}=${values[0]}`)
    .join('; ');
}
