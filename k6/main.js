/**
 * k6 부하 테스트 오케스트레이터 — arrival-rate 기반
 *
 * 설계 원칙:
 *   - 모든 시나리오를 ramping-arrival-rate로 통일
 *   - VU는 "요청 처리 워커" 역할만 → think time 제거 → VU 수 최소화
 *   - 요청률(req/sec)로 트래픽 직접 제어 → 서버 응답과 무관하게 일정 부하
 *   - 서버가 느려질수록 VU가 더 오래 점유 → maxVUs 도달 시 자연 back-pressure
 *
 * 부하 산정 (서버 1대, HikariCP 10, Tomcat 400):
 *   일반 트래픽  300 req/sec → DB 쿼리 ~300/sec
 *   알림 폴링     25 req/sec → 무캐시 COUNT 25/sec
 *   검색          60 req/sec × 150ms = 커넥션 9개 상시 점유 ← 치명적
 *   글/댓글 쓰기   30 req/sec → 캐시 eviction + row lock
 *   로그인         15 req/sec → bcrypt CPU 포화
 *   바이럴 집중    80 req/sec → 단일 row lock contention
 *   ─────────────────────────────
 *   합계 피크    ~510 req/sec
 *   필요 커넥션  ~510 × avg_query_time → HikariCP 10개로 불가능
 *
 * VU 메모리:
 *   Before: 3400 VU × ~2MB = ~7GB (대부분 think time에 idle)
 *   After:  ~600 VU × ~2MB = ~1.2GB (전부 활성 요청 처리)
 *
 * 실행:
 *   node k6/scripts/register-users.js --count 500
 *   k6 run k6/main.js
 */

import { sleep } from 'k6';
import { BASE_URL, PASSWORD, USER_COUNT } from './config/environments.js';
import { setupTokenPool, getToken, getUser } from './utils/auth.js';
import { weightedPicker, postIdPicker, actionPicker } from './utils/distributions.js';
import { browseBoardPosts } from './flows/browse-board.js';
import { readPostDetail, readComments, readPostWithComments } from './flows/read-post.js';
import { reactToPost, toggleScrap } from './flows/engage-post.js';
import { writeComment } from './flows/write-comment.js';
import { writePost } from './flows/write-post.js';
import { searchPosts, randomKeyword, searchPage } from './flows/search.js';
import { pollUnreadCount, listNotifications } from './flows/poll-notifications.js';
import { getHotPosts } from './flows/hot-posts.js';
import { doLogin } from './flows/login.js';

const boards = JSON.parse(open('./data/boards.json'));
const seedPosts = JSON.parse(open('./data/seed-posts.json'));

// ── 부하 강도 설정 (req/sec 단위) ──────────────────────────
const NORMAL_PEAK = parseInt(__ENV.K6_NORMAL_RATE || '300', 10);
const NOTIF_PEAK = parseInt(__ENV.K6_NOTIF_RATE || '25', 10);
const SEARCH_PEAK = parseInt(__ENV.K6_SEARCH_RATE || '60', 10);
const WRITE_PEAK = parseInt(__ENV.K6_WRITE_RATE || '30', 10);
const LOGIN_PEAK = parseInt(__ENV.K6_LOGIN_RATE || '15', 10);
const VIRAL_PEAK = parseInt(__ENV.K6_VIRAL_RATE || '80', 10);

export const options = {
  scenarios: {
    // ─────────────────────────────────────────────────────────
    // Phase 1: 워밍업 (0-2분) — 캐시 워밍, 기준선 확보
    // Phase 2: 증가 (2-5분) — 트래픽 단계적 증가
    // Phase 3: 피크 (5-10분) — 전 시나리오 최대 부하, 장애 유발
    // Phase 4: 감소 (10-13분)
    // ─────────────────────────────────────────────────────────

    // 일반 브라우징 — 메인 트래픽 (Read:Write ≈ 92:8 혼합)
    // 300 req/sec 피크 → HikariCP 과점유 시 latency 폭등
    normal_traffic: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '2m', target: Math.round(NORMAL_PEAK * 0.15) },  // 45/s 워밍업
        { duration: '2m', target: Math.round(NORMAL_PEAK * 0.5) },   // 150/s
        { duration: '1m', target: NORMAL_PEAK },                      // 300/s 피크
        { duration: '4m', target: NORMAL_PEAK },                      // 피크 유지
        { duration: '2m', target: Math.round(NORMAL_PEAK * 0.3) },   // 90/s 감소
        { duration: '2m', target: 0 },
      ],
      exec: 'normalBrowsing',
    },

    // 알림 폴링 — 무캐시 DB COUNT 쿼리
    // 25 req/sec = 실사용자 750~1500명이 30~60초 간격 폴링하는 것과 동일
    notification_polling: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 60,
      stages: [
        { duration: '2m', target: 5 },
        { duration: '2m', target: Math.round(NOTIF_PEAK * 0.5) },
        { duration: '5m', target: NOTIF_PEAK },                       // 25/s
        { duration: '2m', target: 5 },
        { duration: '2m', target: 0 },
      ],
      exec: 'notificationPolling',
    },

    // 검색 — LIKE 풀 테이블 스캔, 쿼리당 150ms+
    // 60 req/sec × 150ms = 커넥션 9개 상시 점유 (HikariCP 10개 중!)
    searchers: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 200,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 30 },
        { duration: '3m', target: SEARCH_PEAK },                      // 60/s
        { duration: '3m', target: SEARCH_PEAK },
        { duration: '2m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      startTime: '1m',
      exec: 'searchActivity',
    },

    // 글/댓글 작성 — write contention + 캐시 eviction
    // 30 writes/sec → 매 쓰기마다 evictBoard() → 읽기 전부 cache miss
    writers: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 60,
      stages: [
        { duration: '2m', target: 5 },
        { duration: '2m', target: 15 },
        { duration: '5m', target: WRITE_PEAK },                       // 30/s
        { duration: '2m', target: 5 },
        { duration: '2m', target: 0 },
      ],
      exec: 'writeActivity',
    },

    // 로그인 burst — bcrypt CPU 포화
    // 15 req/sec × 100ms CPU = 1.5 코어 상시 점유
    login_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '1m', target: LOGIN_PEAK },                       // 15/s
        { duration: '2m', target: LOGIN_PEAK },
        { duration: '1m', target: 0 },
      ],
      startTime: '4m',
      exec: 'loginActivity',
    },

    // 바이럴 포스트 — 단일 게시글 집중 → row lock contention
    // 80 req/sec이 postId=1에 몰림 (읽기/좋아요/댓글/스크랩)
    viral_post: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 120,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '1m', target: VIRAL_PEAK },                       // 80/s
        { duration: '4m', target: VIRAL_PEAK },
        { duration: '2m', target: 20 },
        { duration: '1m', target: 0 },
      ],
      startTime: '3m',
      exec: 'viralPostActivity',
    },
  },

  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'http_req_duration{endpoint:board_posts}': ['p(95)<1000'],
    'http_req_duration{endpoint:post_detail}': ['p(95)<1000'],
    'http_req_duration{endpoint:comments}': ['p(95)<1000'],
    'http_req_duration{endpoint:hot_posts}': ['p(95)<1000'],
    'http_req_duration{endpoint:unread_count}': ['p(95)<2000'],
    'http_req_duration{endpoint:search}': ['p(95)<5000'],
    'http_req_duration{endpoint:reaction}': ['p(95)<2000'],
    'http_req_duration{endpoint:create_comment}': ['p(95)<2000'],
    'http_req_duration{endpoint:create_post}': ['p(95)<3000'],
    'http_req_duration{endpoint:login}': ['p(95)<3000'],
  },
};

const pickBoard = weightedPicker(boards);
const pickPostId = postIdPicker(seedPosts.hotPostIds, seedPosts.totalPosts, 1.07);

const pickNormalAction = actionPicker({
  browse: 35,
  read_post: 25,
  hot_posts: 10,
  reaction: 12,
  write_comment: 8,
  scrap: 5,
  write_post: 2,
  poll_unread: 3,
});

const pickWriteAction = actionPicker({
  write_comment: 50,
  write_post: 20,
  reaction: 20,
  scrap: 10,
});

const TOTAL_PEAK = NORMAL_PEAK + NOTIF_PEAK + SEARCH_PEAK + WRITE_PEAK + LOGIN_PEAK + VIRAL_PEAK;
const TOKEN_POOL_SIZE = parseInt(__ENV.K6_USERS || '200', 10);

export function setup() {
  console.log('=== k6 HighTeenDay STRESS Test (arrival-rate) ===');
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`Peak rates (req/sec): normal=${NORMAL_PEAK} notif=${NOTIF_PEAK} search=${SEARCH_PEAK} write=${WRITE_PEAK} login=${LOGIN_PEAK} viral=${VIRAL_PEAK}`);
  console.log(`Total peak: ~${TOTAL_PEAK} req/sec`);
  console.log(`Max VUs: ~790`);
  console.log(`Duration: ~13 minutes`);

  const pool = setupTokenPool(BASE_URL, TOKEN_POOL_SIZE, PASSWORD);
  return { pool, baseUrl: BASE_URL };
}

// ── 일반 브라우징 ──────────────────────────────────────────
// arrival-rate: think time 불필요 — 요청률이 곧 사용자 행동 빈도

export function normalBrowsing(data) {
  const token = getToken(data.pool, __VU - 1);
  const tags = { scenario: 'normal_traffic' };
  const action = pickNormalAction();

  switch (action) {
    case 'browse': {
      const boardId = pickBoard();
      browseBoardPosts(token, boardId, { page: 0 }, tags);
      if (Math.random() < 0.5) {
        browseBoardPosts(token, boardId, { page: 1 }, tags);
      }
      break;
    }
    case 'read_post':
      readPostWithComments(token, pickPostId(), tags);
      break;
    case 'hot_posts':
      getHotPosts(tags);
      break;
    case 'reaction':
      reactToPost(token, pickPostId(), Math.random() < 0.8 ? 'LIKE' : 'DISLIKE', tags);
      break;
    case 'write_comment':
      writeComment(token, pickPostId(), {}, tags);
      break;
    case 'scrap':
      toggleScrap(token, pickPostId(), tags);
      break;
    case 'write_post':
      writePost(token, pickBoard(), {}, tags);
      break;
    case 'poll_unread':
      pollUnreadCount(token, tags);
      break;
    default:
      browseBoardPosts(token, pickBoard(), {}, tags);
  }
}

// ── 알림 폴링 ──────────────────────────────────────────────
// 25 req/sec = 실 사용자 750~1500명의 30~60초 폴링과 동일 효과

export function notificationPolling(data) {
  const token = getToken(data.pool, __VU - 1);
  const tags = { scenario: 'notification_polling' };

  pollUnreadCount(token, tags);

  if (Math.random() < 0.3) {
    listNotifications(token, { page: 0 }, tags);
  }
}

// ── 검색 ───────────────────────────────────────────────────

export function searchActivity() {
  const tags = { scenario: 'searchers' };

  searchPosts(randomKeyword(seedPosts.searchKeywords), { page: searchPage() }, tags);

  if (Math.random() < 0.2) {
    searchPosts(randomKeyword(seedPosts.searchKeywords), { page: 0 }, tags);
  }
}

// ── 글/댓글 작성 ───────────────────────────────────────────

export function writeActivity(data) {
  const token = getToken(data.pool, __VU - 1);
  const tags = { scenario: 'writers' };
  const action = pickWriteAction();

  switch (action) {
    case 'write_comment':
      writeComment(token, pickPostId(), {}, tags);
      break;
    case 'write_post':
      writePost(token, pickBoard(), {}, tags);
      break;
    case 'reaction':
      reactToPost(token, pickPostId(), 'LIKE', tags);
      break;
    case 'scrap':
      toggleScrap(token, pickPostId(), tags);
      break;
  }
}

// ── 로그인 burst ───────────────────────────────────────────

export function loginActivity(data) {
  const tags = { scenario: 'login_burst' };
  const user = getUser(data.pool, __VU - 1);

  doLogin(data.baseUrl, user.email, PASSWORD, tags);
}

// ── 바이럴 포스트 ──────────────────────────────────────────

const VIRAL_POST_ID = parseInt(__ENV.K6_VIRAL_POST_ID || '1', 10);

const pickViralAction = actionPicker({
  read: 50,
  comments: 20,
  like: 15,
  comment_write: 10,
  scrap: 5,
});

export function viralPostActivity(data) {
  const token = getToken(data.pool, __VU - 1);
  const tags = { scenario: 'viral_post', postId: String(VIRAL_POST_ID) };
  const action = pickViralAction();

  switch (action) {
    case 'read':
      readPostDetail(token, VIRAL_POST_ID, tags);
      break;
    case 'comments':
      readComments(token, VIRAL_POST_ID, tags);
      break;
    case 'like':
      reactToPost(token, VIRAL_POST_ID, 'LIKE', tags);
      break;
    case 'comment_write':
      writeComment(token, VIRAL_POST_ID, {}, tags);
      break;
    case 'scrap':
      toggleScrap(token, VIRAL_POST_ID, tags);
      break;
  }
}

export function teardown() {
  console.log('\n========================================');
  console.log('  STRESS TEST COMPLETE');
  console.log('========================================');
  console.log('병목 체크포인트:');
  console.log('  1. http_req_failed > 5%? → HikariCP 고갈');
  console.log('  2. search p95 > 5s? → LIKE 풀스캔이 커넥션 9/10 점유');
  console.log('  3. unread_count p95 > 2s? → 알림 폴링 무캐시 COUNT');
  console.log('  4. reaction p95 > 2s? → 바이럴 row lock contention');
  console.log('  5. create_comment p95 > 2s? → comment count race condition');
  console.log('  6. login p95 > 3s? → bcrypt CPU 포화');
  console.log('  7. board_posts p95 > 1s? → 캐시 eviction thrashing');
  console.log('  8. Insufficient VUs 경고? → 서버 응답 지연으로 VU 부족 = 병목 확인');
}
