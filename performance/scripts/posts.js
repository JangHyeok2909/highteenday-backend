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
import { BASE_URL, DEFAULT_THRESHOLDS, check, tags, thinkTime } from './lib/config.js';
import { buildPhasePlan, toSeconds } from './lib/phases.js';
import { ensureSession, withAuth } from './lib/session.js';
import { myUser, hotPost, randomBoard } from './lib/data.js';
import { pageIndex } from './lib/sampling.js';
import { makeHandleSummary } from './lib/summary.js';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

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
  const res = http.get(`${BASE_URL}/api/posts/${postId}`, tags('post', 'read', 'post_detail'));
  check(res, { 'post detail 200': (r) => r.status === 200 });
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
