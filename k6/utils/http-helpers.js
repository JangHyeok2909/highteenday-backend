/**
 * 인증 + 태깅 HTTP 래퍼
 */

import http from 'k6/http';
import { check } from 'k6';
import { authCookie } from './auth.js';
import { recordDuration, errorCount } from './metrics.js';
import { TIMEOUTS } from '../config/environments.js';

const defaultParams = {
  timeout: TIMEOUTS.request,
};

/**
 * 인증된 GET 요청
 * @param {string} url
 * @param {string} token - JWT accessToken
 * @param {Object} tags - {endpoint, scenario, ...}
 * @returns {Object} k6 response
 */
export function authedGet(url, token, tags) {
  const params = {
    ...defaultParams,
    headers: authCookie(token),
    tags: { endpoint: tags.endpoint, ...tags },
  };
  const res = http.get(url, params);

  recordDuration(tags.endpoint, res.timings.duration);

  if (res.status >= 400) {
    errorCount.add(1, { endpoint: tags.endpoint });
  }

  return res;
}

/**
 * 인증된 POST 요청
 * @param {string} url
 * @param {*} body - JSON 직렬화 가능 객체 또는 null
 * @param {string} token
 * @param {Object} tags
 * @returns {Object} k6 response
 */
export function authedPost(url, body, token, tags) {
  const headers = {
    ...authCookie(token),
    'Content-Type': 'application/json',
  };
  const params = {
    ...defaultParams,
    headers,
    tags: { endpoint: tags.endpoint, ...tags },
  };
  const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
  const res = http.post(url, payload, params);

  recordDuration(tags.endpoint, res.timings.duration);

  if (res.status >= 400) {
    errorCount.add(1, { endpoint: tags.endpoint });
  }

  return res;
}

/**
 * 인증된 PATCH 요청
 */
export function authedPatch(url, body, token, tags) {
  const headers = {
    ...authCookie(token),
    'Content-Type': 'application/json',
  };
  const params = {
    ...defaultParams,
    headers,
    tags: { endpoint: tags.endpoint, ...tags },
  };
  const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
  const res = http.patch(url, payload, params);

  recordDuration(tags.endpoint, res.timings.duration);

  if (res.status >= 400) {
    errorCount.add(1, { endpoint: tags.endpoint });
  }

  return res;
}

/**
 * 비인증 GET 요청
 */
export function publicGet(url, tags) {
  const params = {
    ...defaultParams,
    tags: { endpoint: tags.endpoint, ...tags },
  };
  const res = http.get(url, params);

  recordDuration(tags.endpoint, res.timings.duration);

  if (res.status >= 400) {
    errorCount.add(1, { endpoint: tags.endpoint });
  }

  return res;
}

/**
 * 응답 상태 체크 헬퍼
 */
export function checkStatus(res, expected, label) {
  return check(res, {
    [`${label}: status ${expected}`]: (r) => r.status === expected,
  });
}
