/**
 * 통합 워크로드 모듈 — 모든 시나리오의 공통 심장부.
 *
 * "사용자 여정(journey)" 단위로 기능 스크립트를 조합하고,
 * 시나리오는 여정별 가중치(weight profile)만 바꿔서 트래픽 성격을 정의한다.
 *
 *   시나리오 파일  →  가중치 프로파일  →  mixedIteration()  →  scripts/*.js 액션
 *
 * 이렇게 하면 조회/쓰기/채팅/알림이 "동시에" 섞여 돌아가는 실제 서비스 상태를
 * 어떤 시나리오에서든 재현하면서, 비율만 조정해 Normal Day/Exam Week 등을 만든다.
 */
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { thinkTime, currentPhase } from '../../scripts/lib/config.js';
import { ensureSession } from '../../scripts/lib/session.js';
import { myUser, hotPost, randomBoard } from '../../scripts/lib/data.js';
import { pageIndex } from '../../scripts/lib/sampling.js';

import { listPosts, readPost, searchPosts, writeCycle, createPost } from '../../scripts/posts.js';
import { listComments, createComment, pickCommentId } from '../../scripts/comments.js';
import { reactToPost, reactToComment } from '../../scripts/reactions.js';
import { scrapPost } from '../../scripts/scraps.js';
import { listBoards, dailyHotPosts } from '../../scripts/boards.js';
import { unreadCount, listNotifications, readAll, readOne, pickNotificationId } from '../../scripts/notifications.js';
import { friendList, receivedRequests } from '../../scripts/friends.js';
import { myRooms, roomMessages, markRead, pickMyRoom } from '../../scripts/chat-rest.js';
import { chatSession } from '../../scripts/chat-ws.js';
import { todayMeal, monthMeal } from '../../scripts/school.js';
import { todayTimetable } from '../../scripts/timetable.js';
import { userInfo, myPosts } from '../../scripts/mypage.js';
import { login, refreshToken, logout } from '../../scripts/auth.js';

// ---------- 사용자 여정 ----------

/** 눈팅: 게시판 → 목록 → 인기글 상세 2~4개 + 댓글 열람. 트래픽의 대부분. */
export function journeyBrowse() {
  listBoards();
  sleep(thinkTime());
  dailyHotPosts();
  sleep(thinkTime());
  listPosts(randomBoard().id, pageIndex());
  sleep(thinkTime());
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const p = hotPost();
    readPost(p.id);
    if (Math.random() < 0.6) listComments(p.id);
    sleep(thinkTime());
  }
}

/**
 * 참여: 상세 열람 후 좋아요/댓글반응/댓글/스크랩.
 *
 * 분기 확률을 재분배해 여정당 쓰기 1회를 유지한다. 댓글 반응을 그냥 덧붙이면 여정당
 * 요청 수가 늘어 TPS·RPS 기준선이 통째로 어긋나므로, 기존 분기에서 몫을 떼어 온다.
 * 댓글 반응 분기에서만 목록을 한 번 더 읽는데, 그건 실제 사용자도 댓글을 봐야
 * 좋아요를 누를 수 있기 때문이다.
 */
export function journeyEngage() {
  const p = hotPost();
  readPost(p.id);
  sleep(thinkTime());
  const dice = Math.random();
  if (dice < 0.4) {
    reactToPost(p.id, Math.random() < 0.85 ? 'LIKE' : 'DISLIKE');
  } else if (dice < 0.55) {
    // 댓글 카운터도 게시글과 같은 비정규화 구조라 인기 댓글에서 같은 경합이 생기는지 본다.
    const commentId = pickCommentId(p.id);
    if (commentId) reactToComment(commentId, Math.random() < 0.85 ? 'LIKE' : 'DISLIKE');
  } else if (dice < 0.85) {
    createComment(p.id);
  } else {
    scrapPost(p.id);
  }
  sleep(thinkTime());
}

/** 작성: 새 글 작성 (수정/삭제 사이클 일부 포함) */
export function journeyWrite() {
  const board = randomBoard();
  if (Math.random() < 0.2) writeCycle(board.id);
  else createPost(board.id);
  sleep(thinkTime());
}

/** 검색 */
export function journeySearch() {
  const TERMS = ['시험', '급식', '수행', '내신', '동아리', '모의고사'];
  searchPosts(TERMS[Math.floor(Math.random() * TERMS.length)]);
  sleep(thinkTime());
}

/** 채팅(REST): 방 목록 → 메시지 페이징 → 읽음 */
export function journeyChatRest() {
  const roomId = pickMyRoom();
  sleep(thinkTime());
  if (roomId) {
    roomMessages(roomId);
    sleep(thinkTime());
    markRead(roomId);
    sleep(thinkTime());
  }
}

/** 채팅(WebSocket): 실시간 세션 유지 + 메시지 송수신 */
export function journeyChatWs() {
  const roomId = pickMyRoom();
  if (roomId) chatSession(roomId, 15 + Math.random() * 15);
  else sleep(thinkTime());
}

/**
 * 알림 확인.
 *
 * 목록을 연 뒤의 행동을 둘로 나눈다 — 알림 하나를 눌러 읽는 쪽(단건 UPDATE)이
 * "전체 읽음"(범위 UPDATE 1회)보다 흔하다. 부하 특성이 정반대라 read-all 만 재면
 * 알림 20개를 하나씩 읽는 실제 패턴의 UPDATE 비용이 통째로 빠진다.
 * 확률 합(0.6)은 기존 read-all 0.3 에서 늘었지만, 둘은 배타 분기라
 * 여정당 쓰기는 여전히 최대 1회다.
 */
export function journeyNotification() {
  unreadCount();
  sleep(thinkTime());
  if (Math.random() < 0.5) {
    const listed = listNotifications();
    sleep(thinkTime());
    const dice = Math.random();
    if (dice < 0.4) {
      const id = pickNotificationId(listed);
      if (id) readOne(id);
    } else if (dice < 0.6) {
      readAll();
    }
  }
}

/** 아침 루틴: 급식 + 시간표 (등교 시간 피크의 주역) */
export function journeyMorning() {
  todayMeal();
  sleep(thinkTime());
  todayTimetable();
  sleep(thinkTime());
  if (Math.random() < 0.2) {
    const now = new Date();
    monthMeal(now.getFullYear(), now.getMonth() + 1);
    sleep(thinkTime());
  }
}

/** 소셜: 친구 목록/신청함 */
export function journeySocial() {
  friendList();
  sleep(thinkTime());
  if (Math.random() < 0.4) {
    receivedRequests();
    sleep(thinkTime());
  }
  myRooms();
  sleep(thinkTime());
}

/** 마이페이지 */
export function journeyMypage() {
  userInfo();
  sleep(thinkTime());
  myPosts();
  sleep(thinkTime());
}

/** 세션 갱신: 만료 → refresh (장기 접속자 모사) */
export function journeyTokenRefresh() {
  refreshToken();
  sleep(thinkTime());
}

/** 재로그인: 로그아웃 → 로그인 (BCrypt 원가 부하) */
export function journeyRelogin(user) {
  logout();
  sleep(thinkTime());
  login(user);
  sleep(thinkTime());
}

const JOURNEYS = {
  browse: journeyBrowse,
  engage: journeyEngage,
  write: journeyWrite,
  search: journeySearch,
  chatRest: journeyChatRest,
  chatWs: journeyChatWs,
  notification: journeyNotification,
  morning: journeyMorning,
  social: journeySocial,
  mypage: journeyMypage,
  tokenRefresh: journeyTokenRefresh,
  relogin: journeyRelogin,
};

// ---------- 가중치 프로파일 ----------
// 값은 상대 가중치. 합이 100일 필요는 없지만 가독성을 위해 100으로 맞춘다.

/**
 * 평일 일과 시간 평균 트래픽 — 읽기 중심 (읽기:쓰기 ≈ 8:2)
 *
 * 채팅 비중을 13 → 25 로 올렸다(2026-09-01). 이유는 두 가지다.
 *
 * **① 이 프로파일이 모든 Before/After 의 기준이다.** 채팅이 과소 대표되면 채팅 경로의
 * 회귀는 기준선에서 영영 드러나지 않는다.
 *
 * **② 그동안 채팅을 재고 있지도 않았다.** 시더가 메시지를 만들지 않아 `chat_messages` 가
 * 0행이었고, 방 목록의 미읽음 집계는 빈 테이블 위에서 돌았으며 메시지 조회는 늘 빈 배열을
 * 돌려줬다. 비중만 올리면 빈 결과를 더 자주 재게 되므로, 데이터(시더의 chat-messages·
 * group-rooms 단계)를 먼저 채운 뒤 함께 올린다.
 *
 * **합계 100 을 유지하고 다른 여정에서 몫을 떼어 온다.** 그냥 더하면 여정당 요청 수가 늘어
 * RPS 기준선이 통째로 어긋난다 — `journeyEngage` 가 같은 이유로 이미 그렇게 하고 있다.
 *
 * VU 여유 검산: `journeyChatWs` 는 세션을 15~30초 유지하므로 평균 반복 시간이 늘어난다.
 * 0.13×23초 + 0.87×9초 ≈ 10.8초, RATE=4 에서 약 44 VU 다. `preAllocatedVUs` 100 안이라
 * 여유가 있지만, 실행 후 `dropped_iterations` 가 0인지 확인해야 한다 — 도착률을 못 맞추면
 * open model 로 전환한 의미가 사라진다.
 */
export const PROFILE_NORMAL = {
  browse: 32, engage: 13, write: 5, search: 4,
  chatRest: 12, chatWs: 13, notification: 9,
  morning: 3, social: 4, mypage: 3, tokenRefresh: 1, relogin: 1,
};

/** 등교 직전/점심 피크 — 급식·시간표·알림 폭증 */
export const PROFILE_PEAK = {
  browse: 25, engage: 10, write: 4, search: 2,
  chatRest: 10, chatWs: 8, notification: 15,
  morning: 18, social: 4, mypage: 2, tokenRefresh: 1, relogin: 1,
};

/** 읽기 편중 (캐시 효율 측정 기준선) */
export const PROFILE_READ_HEAVY = {
  browse: 62, engage: 5, write: 1, search: 7,
  chatRest: 5, chatWs: 2, notification: 10,
  morning: 3, social: 3, mypage: 2, tokenRefresh: 0, relogin: 0,
};

/** 쓰기 편중 (커넥션 풀/락/카운터 갱신 압박) */
export const PROFILE_WRITE_HEAVY = {
  browse: 15, engage: 30, write: 25, search: 2,
  chatRest: 5, chatWs: 5, notification: 8,
  morning: 0, social: 5, mypage: 3, tokenRefresh: 1, relogin: 1,
};

/** 채팅 편중 (WebSocket 세션 + 브로드캐스트 압박) */
export const PROFILE_CHAT_HEAVY = {
  browse: 10, engage: 5, write: 2, search: 1,
  chatRest: 25, chatWs: 40, notification: 10,
  morning: 0, social: 5, mypage: 2, tokenRefresh: 0, relogin: 0,
};

/** 알림 편중 (배지 폴링 + read-all 대량 UPDATE) */
export const PROFILE_NOTIFICATION_HEAVY = {
  browse: 20, engage: 15, write: 5, search: 2,
  chatRest: 5, chatWs: 5, notification: 40,
  morning: 0, social: 5, mypage: 3, tokenRefresh: 0, relogin: 0,
};

/** 시험 기간 — 검색/열람 급증, 채팅 감소, 밤 시간대 지속 */
export const PROFILE_EXAM_WEEK = {
  browse: 45, engage: 12, write: 8, search: 15,
  chatRest: 3, chatWs: 2, notification: 8,
  morning: 2, social: 2, mypage: 3, tokenRefresh: 0, relogin: 0,
};

/** 신학기(가입일) — 회원가입/로그인/친구신청/학교검색 폭증 */
export const PROFILE_REGISTRATION = {
  browse: 15, engage: 5, write: 3, search: 3,
  chatRest: 3, chatWs: 2, notification: 5,
  morning: 5, social: 30, mypage: 4, tokenRefresh: 5, relogin: 20,
};

// ---------- 실행기 ----------

/** 가중치 프로파일에서 여정 하나를 추첨한다. */
export function pickJourney(profile) {
  const entries = Object.entries(profile).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of entries) {
    r -= w;
    if (r <= 0) return name;
  }
  return entries[0][0];
}

/**
 * k6 builtin `iterations`는 iteration 완료 시점에 엔진이 직접 기록하므로, 경과 시간에 따라
 * 동적으로 바뀌는 phase 태그를 실어 보낼 방법이 없다(스크립트가 값을 만드는 게 아니라
 * k6가 만든다). phase별 TPS를 내려면 iteration이 끝나는 시점에 우리가 직접 세는 대체
 * Counter가 필요하다 — k6.phases.<phase>.tps는 이 값을 measureSec 등으로 나눠 계산한다.
 */
const phaseIterations = new Counter('phase_iterations');

/**
 * 시나리오 기본 반복 — 로그인 보장 후 프로파일 기반 여정 1회 수행.
 * 모든 시나리오 파일의 default function은 이 함수 하나로 충분하다.
 */
export function mixedIteration(profile) {
  const user = ensureSession(myUser());
  const j = pickJourney(profile);
  if (j === 'relogin') journeyRelogin(user);
  else JOURNEYS[j]();

  const phase = currentPhase();
  if (phase) phaseIterations.add(1, { phase });
}
