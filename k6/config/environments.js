/**
 * 환경별 설정
 * 사용: K6_BASE_URL=http://... k6 run ...
 */

export const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:8080';
export const PASSWORD = __ENV.K6_USER_PASSWORD || 'K6LoadTest!1';
export const USER_COUNT = parseInt(__ENV.K6_USERS || '100', 10);

export const TIMEOUTS = {
  request: '30s',
  connect: '10s',
};
