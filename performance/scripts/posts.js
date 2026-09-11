/**
 * 게시글 부하 스크립트 — 목록 / 상세 / 작성 / 수정 / 삭제 / 검색.
 *
 * 검증 포인트:
 *  - GET /api/boards/{id}/posts : isRandomPage=true 랜덤 페이징 쿼리 비용
 *  - GET /api/posts/{id}        : 조회수 Redis 버퍼링 경로 (ViewCountScheduler)
 *  - GET /api/posts/search      : LIKE 검색 → 풀스캔 여부 (slow query 관찰)
 *  - 상세 조회는 Zipf 분포로 인기글에 편중시킨다 (Hot Data 재현)
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, hotPost, randomBoard } from './lib/data.js';
import { pageIndex } from './lib/sampling.js';
import { makeHandleSummary } from './lib/summary.js';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

/**
 * 조회수가 올랐어야 할 횟수를 부하 쪽에서 센다.
 *
 * 왜 필요한가: Redis 가 죽으면 `tryMarkViewed` 가 실패하고 `ResilientRedisAspect` 가 false 를
 * 돌려줘서 조회수 증가가 **아예 시도되지 않는다.** 그 조회는 Redis 에도 DB 에도 남지 않으므로,
 * 서버를 아무리 뒤져도 "몇 건 사라졌는지"를 알 수 없다. 부하 발생기만 안다.
 *
 * 세는 규칙: 서버는 `viewed:{postId}:{userId}` 키로 중복을 접고 TTL 이 1시간이다. 실행은 몇
 * 분이므로 실행 안에서는 **(글, 사용자) 쌍마다 딱 한 번** 오른다. VU 는 `myUser()` 로 사용자
 * 하나에 고정되므로, VU 마다 "이번 실행에서 읽은 글" 을 기억하면 그 규칙과 같아진다.
 *
 * 200 과 그 외를 나누는 이유: 조회수 증가는 응답을 만들기 전에 일어나고 Redis 실패는 삼켜지므로
 * **200 을 받았다면 서버가 그 지점을 지났다.** 타임아웃(status 0)은 서버가 거기까지 갔는지
 * 알 수 없어 따로 센다 — 이 건수가 유실 계산의 불확실 구간이다.
 *
 * 요청을 더 보내지 않으므로 성능 측정 기준선에는 영향이 없다.
 */
const seenPosts = {};
const viewExpected = new Counter('view_expected');
const viewUnknown = new Counter('view_unknown');

const SEARCH_TERMS = ['시험', '급식', '수행평가', '내신', '동아리', '모의고사', '방학', '축제'];

// ---------- 재사용 가능한 액션 ----------

/**
 * 게시판 목록 조회.
 *
 * `page` 태그를 함께 실어 "어느 페이지에 요청이 얼마나 갔는가"를 리포트에서 확인할 수 있게
 * 한다(S-04). 선언한 목표 비율과 실제 요청 수가 어긋나면 그 자리에서 드러나야 한다.
 * 태그 값이 문자열이어야 k6 서브메트릭 selector(`{page:0}`)와 정확히 맞는다.
 */
export function listPosts(boardId, page = 0, sortType = 'RECENT') {
  const res = http.get(
    `${BASE_URL}/api/boards/${boardId}/posts?page=${page}&sortType=${sortType}&size=10`,
    tags('post', 'read', 'post_list', { page: String(page) }),
  );
  check(res, { 'post list 200': (r) => r.status === 200 });
  return res;
}

export function readPost(postId) {
  const first = !seenPosts[postId];
  const res = http.get(`${BASE_URL}/api/posts/${postId}`, tags('post', 'read', 'post_detail'));
  check(res, { 'post detail 200': (r) => r.status === 200 });
  // 첫 시도에서만 센다. 같은 글을 다시 읽어도 서버는 중복으로 접으므로 올리지 않는다.
  if (first) {
    seenPosts[postId] = true;
    if (res.status === 200) viewExpected.add(1);
    else viewUnknown.add(1);
  }
  return res;
}

export function searchPosts(query, page = 0) {
  const res = http.get(
    `${BASE_URL}/api/posts/search?query=${encodeURIComponent(query)}&page=${page}&searchType=TITLE_CONTENT`,
    tags('post', 'read', 'post_search'),
  );
  check(res, { 'post search 200': (r) => r.status === 200 });
  return res;
}

export function createPost(boardId) {
  return withAuth(() => {
    const res = http.post(
      `${BASE_URL}/api/posts`,
      JSON.stringify({
        boardId,
        title: `부하테스트 글 ${Date.now() % 100000}`,
        content: '성능 테스트용 본문입니다. '.repeat(1 + Math.floor(Math.random() * 10)),
        // RequestPostDto는 Lombok이 setAnonymous(...)를 생성해 Jackson이 "anonymous"로 바인딩한다
        // (필드명 isAnonymous 그대로 보내면 400 Unrecognized field — 실측 확인됨).
        anonymous: Math.random() < 0.5,
      }),
      Object.assign({}, JSON_HEADERS, tags('post', 'write', 'post_create')),
    );
    check(res, { 'post create 2xx': (r) => r.status >= 200 && r.status < 300 });
    return res;
  });
}

export function updatePost(postId) {
  return withAuth(() => {
    const res = http.patch(
      `${BASE_URL}/api/posts/${postId}`,
      JSON.stringify({ title: `수정 ${Date.now() % 100000}`, content: '수정된 본문' }),
      Object.assign({}, JSON_HEADERS, tags('post', 'write', 'post_update')),
    );
    // writeCycle()이 방금 만든 자기 글로만 호출하므로 비소유자 4xx는 이 스크립트에
    // 존재하지 않는다. 느슨하게 두면 재려던 UPDATE 경로 대신 소유권 검사에서 끊긴
    // 에러 경로의 지연을 재면서도 통과해 버린다.
    check(res, { 'post update 200': (r) => r.status === 200 });
    return res;
  });
}

export function deletePost(postId) {
  return withAuth(() => {
    const res = http.del(
      `${BASE_URL}/api/posts/${postId}`, null,
      tags('post', 'write', 'post_delete'),
    );
    check(res, { 'post delete 200': (r) => r.status === 200 });
    return res;
  });
}

/** 작성→수정→삭제를 자기 소유 글로만 수행하는 안전한 쓰기 사이클 */
export function writeCycle(boardId) {
  const created = createPost(boardId);
  // PostController.createPost는 201 + 빈 바디 + Location: /api/posts/{id} 헤더만 준다.
  const location = created.headers['Location'] || created.headers['location'];
  const id = location ? Number(location.split('/').filter(Boolean).pop()) : null;
  if (id) {
    sleep(0.5);
    updatePost(id);
    sleep(0.5);
    deletePost(id);
  }
  return created;
}

// ---------- 단독 실행 ----------

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || '2m',
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  ensureSession(myUser());
  const board = randomBoard();

  // 목록 → 상세 2~3개 → 가끔 검색/작성 (실제 열람 패턴)
  listPosts(board.id, pageIndex()); // 앞 페이지에 편중 (0페이지 포함 — sampling.js의 PAGE_WEIGHTS)
  sleep(thinkTime());

  const reads = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < reads; i++) {
    readPost(hotPost().id);
    sleep(thinkTime());
  }

  const dice = Math.random();
  if (dice < 0.1) {
    searchPosts(SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]);
    sleep(thinkTime());
  } else if (dice < 0.17) {
    writeCycle(board.id);
    sleep(thinkTime());
  }
}

// 단독 실행은 constant-vus라 warmup/measure 구분이 없다 — 진단 전용으로 선언한다
// (Node 회귀 게이트 대상 아님).
const STANDALONE_PLAN = buildPhasePlan({
  mode: 'diagnostic',
  warmupSec: 0,
  measureSec: toSeconds(options.duration, 120),
  rampdownSec: 0,
  gatePhase: null,
});

export const handleSummary = makeHandleSummary('posts', STANDALONE_PLAN);
