/**
 * 현실적 사용자 대기 시간 시뮬레이션
 * 로그정규 분포: 대부분 짧은 대기, 가끔 긴 대기
 */

import { sleep } from 'k6';

/**
 * 로그정규 분포 랜덤 값 생성 (Box-Muller)
 */
function logNormal(mu, sigma) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

/**
 * 일반 브라우징 think time (3-8초, 중앙값 ~4초)
 */
export function normalThink() {
  const t = Math.min(Math.max(logNormal(1.4, 0.4), 2), 12);
  sleep(t);
}

/**
 * 빠른 액션 think time (1-3초, 좋아요/스크랩 등)
 */
export function quickThink() {
  const t = Math.min(Math.max(logNormal(0.7, 0.3), 0.5), 5);
  sleep(t);
}

/**
 * 급한 사용자 think time (0.5-2초, 댓글 배틀/바이럴)
 */
export function urgentThink() {
  const t = Math.min(Math.max(logNormal(0.3, 0.3), 0.3), 3);
  sleep(t);
}

/**
 * 폴링 간격 (30-60초)
 */
export function pollInterval() {
  sleep(30 + Math.random() * 30);
}

/**
 * 짧은 폴링 간격 (5-15초, 급한 상황)
 */
export function shortPollInterval() {
  sleep(5 + Math.random() * 10);
}

/**
 * 커스텀 범위 think time
 * @param {number} min - 최소 초
 * @param {number} max - 최대 초
 */
export function customThink(min, max) {
  sleep(min + Math.random() * (max - min));
}
