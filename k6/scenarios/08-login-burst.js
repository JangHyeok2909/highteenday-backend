/**
 * 시나리오 08: 로그인 폭주 (Login Burst)
 *
 * 목적: bcrypt CPU 포화
 * Executor: shared-iterations (500 iterations, 100 VU)
 * 타겟 병목: bcrypt cost factor 10 → 요청당 ~100ms CPU
 * 관찰: 로그인 latency, CPU 사용률
 * 예상 장애: 소형 EC2에서 latency 10초+ 가능
 *
 * 실행: k6 run k6/scenarios/08-login-burst.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, PASSWORD } from '../config/environments.js';
import { loginBurstThresholds } from '../config/thresholds.js';
import { getUser, poolSize } from '../utils/auth.js';
import { doLogin } from '../flows/login.js';
import { recordDuration } from '../utils/metrics.js';

const VUS = parseInt(__ENV.K6_LOGIN_VUS || '100', 10);
const ITERATIONS = parseInt(__ENV.K6_LOGIN_ITERATIONS || '500', 10);

export const options = {
  scenarios: {
    login_burst: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '5m',
    },
  },
  thresholds: loginBurstThresholds,
};

export function setup() {
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const tags = { scenario: 'login_burst' };
  const user = getUser(__VU - 1);

  doLogin(data.baseUrl, user.email, PASSWORD, tags);

  // 로그인 직후 약간의 대기 (실제 사용자: 로그인 후 화면 로딩)
  sleep(0.5 + Math.random());
}
