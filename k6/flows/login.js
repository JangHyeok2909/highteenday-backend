/**
 * 로그인 플로우
 * POST /api/user/login → accessToken 쿠키 수신
 */

import http from 'k6/http';
import { check } from 'k6';
import { extractAccessToken } from '../utils/auth.js';
import { recordDuration, errorCount } from '../utils/metrics.js';
import { TIMEOUTS } from '../config/environments.js';

/**
 * 로그인 실행 → accessToken 반환
 * @param {string} baseUrl
 * @param {string} email
 * @param {string} password
 * @param {Object} extraTags
 * @returns {string|null} accessToken 또는 null
 */
export function doLogin(baseUrl, email, password, extraTags) {
  const tags = { endpoint: 'login', ...(extraTags || {}) };
  const res = http.post(
    `${baseUrl}/api/user/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags,
      timeout: TIMEOUTS.request,
    }
  );

  recordDuration('login', res.timings.duration);

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
  });

  if (!ok) {
    errorCount.add(1, { endpoint: 'login' });
    return null;
  }

  return extractAccessToken(res);
}
