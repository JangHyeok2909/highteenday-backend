/**
 * 알림 부하 스크립트 — 목록 / 미읽음 수 / 읽음 처리.
 *
 * 검증 포인트:
 *  - /unread-count 는 헤더 배지용으로 모든 화면 전환마다 호출되는 고빈도 엔드포인트.
 *    COUNT 쿼리가 알림 테이블 크기에 비례해 느려지는지 관찰 (인덱스 유무 효과)
 *  - read-all 은 범위 UPDATE — 대량 row 갱신 시 undo log/락 비용
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser } from './lib/data.js';
import { makeHandleSummary } from './lib/summary.js';

export function listNotifications(page = 0, size = 20) {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/notifications?page=${page}&size=${size}`,
      tags('notification', 'read', 'notif_list'),
    );
    check(res, { 'notif list 200': (r) => r.status === 200 });
    return res;
  });
}

export function unreadCount() {
  return withAuth(() => {
    const res = http.get(
      `${BASE_URL}/api/notifications/unread-count`,
      tags('notification', 'read', 'notif_unread_count'),
    );
    check(res, { 'unread count 200': (r) => r.status === 200 });
    return res;
  });
}

export function readAll() {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/notifications/read-all`, null,
      tags('notification', 'write', 'notif_read_all'),
    );
    check(res, { 'read all 200': (r) => r.status === 200 });
    return res;
  });
}

/**
 * 알림 하나를 읽음 처리. read-all 과 부하 특성이 정반대다 —
 * read-all 이 범위 UPDATE 1회라면 이쪽은 목록을 훑으며 단건 UPDATE 가 N회 발생한다.
 */
export function readOne(id) {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/notifications/${id}/read`, null,
      tags('notification', 'write', 'notif_read_one'),
    );
    // 목록에서 받은 내 알림 id 로만 호출된다 — 4xx 가 나올 경로가 없다.
    check(res, { 'read one 200': (r) => r.status === 200 });
    return res;
  });
}

/**
 * 알림 목록 응답에서 읽지 않은 알림 id 를 하나 고른다.
 * 응답은 PagedNotificationsDto { page, totalPages, totalElements, notifications: [...] } 다.
 * 미읽음이 없으면 아무거나, 목록이 비면 null — 호출부가 건너뛴다.
 */
export function pickNotificationId(res) {
  try {
    const list = (JSON.parse(res.body) || {}).notifications;
    if (!Array.isArray(list) || list.length === 0) return null;
    const unread = list.filter((n) => n.isRead === false);
    const pool = unread.length ? unread : list;
    return pool[Math.floor(Math.random() * pool.length)].id ?? null;
  } catch (_) {
    return null;
  }
}

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || '1m',
  thresholds: Object.assign({}, DEFAULT_THRESHOLDS, {
    // 배지 카운트는 모든 페이지에서 호출되므로 매우 엄격한 SLO
    'http_req_duration{name:notif_unread_count}': ['p(95)<100'],
  }),
};

export default function () {
  ensureSession(myUser());
  // 화면 전환 3~5회당 unread-count 1회꼴의 실제 호출 패턴
  unreadCount();
  sleep(thinkTime());
  if (Math.random() < 0.4) {
    listNotifications();
    sleep(thinkTime());
    if (Math.random() < 0.3) readAll();
  }
}

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 60),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('notifications', STANDALONE_PLAN);
