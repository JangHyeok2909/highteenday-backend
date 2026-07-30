#!/usr/bin/env node
/**
 * 부하 테스트 시드 데이터 생성기.
 *
 * API를 통해 데이터를 생성한다 (SQL 직접 삽입 대비 느리지만 스키마 변경에 안전하고,
 * 서비스 로직[카운터, 이벤트, 알림 팬아웃]까지 실제와 동일하게 만들어진다).
 *
 * 현실적인 분포:
 *  - 활동량: 사용자별 Zipf — 소수의 헤비 유저가 대부분의 글/댓글을 쓴다
 *  - 인기도: 게시글별 Zipf — 상위 ~10% 글에 반응/댓글의 ~80%가 몰린다 (Hot Data)
 *  - 친구: 같은 학교 위주로 클러스터링
 *  - 채팅: 친구 쌍 일부가 1:1 방 + 소수의 단체방
 *
 * 사용법:
 *   node datasets/seed.js --profile small [--base http://localhost:8080] [--concurrency 10]
 *   프로파일: smoke(20명) | small(100명) | medium(1,000명) | large(10,000명) | xlarge(100,000명)
 *
 * 산출물: datasets/generated/<profile>/{users,posts,boards}.json  ← k6가 로드
 * 요구사항: Node 18+ (내장 fetch)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 설정 ----------

const PROFILES = require('./profiles.json');

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const PROFILE_NAME = arg('profile', 'small');
const BASE = arg('base', 'http://localhost:8080');
const CONCURRENCY = Number(arg('concurrency', 10));
const P = PROFILES[PROFILE_NAME];
if (!P) {
  console.error(`unknown profile: ${PROFILE_NAME} (available: ${Object.keys(PROFILES).join(', ')})`);
  process.exit(1);
}

const PASSWORD = 'PerfTest123!'; // scripts/lib/config.js SEED_PASSWORD와 일치해야 함
const OUT_DIR = path.join(__dirname, 'generated', PROFILE_NAME);

// ---------- 유틸 ----------

/** 결정론적 PRNG — 같은 프로파일이면 항상 같은 데이터 (재현성) */
let seed = 20260730;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(n) { return Math.floor(rand() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }

/** Zipf 근사 샘플러: 0..n-1, 낮은 인덱스일수록 자주 뽑힌다 */
function zipf(n, skew = 0.7) {
  return Math.floor(Math.pow(n, Math.pow(rand(), 1 + skew))) % n;
}

const TITLES = ['오늘 급식 어땠음?', '수행평가 팁 공유', '내신 공부법', '동아리 추천좀', '모의고사 등급컷',
  '시험기간 공부 인증', '학교 축제 후기', '야자 탈출 방법', '급식 맛집 학교', '수학 문제 질문',
  '영어 단어 암기법', '체육대회 후기', '담임쌤 썰', '매점 신메뉴', '기숙사 생활 팁'];
const BODIES = ['공감하면 좋아요 눌러줘', '댓글로 알려주세요', '다들 어떻게 생각함?',
  '진짜 궁금해서 물어봄', '내일까지 해야 하는데 도와줘', '경험담 공유합니다'];
const COMMENTS_POOL = ['ㅋㅋㅋㅋ 인정', '오 꿀팁 감사', '우리 학교도 그럼', '좋아요 누르고 갑니다',
  '자세히 좀 알려줘', '와 대박', 'ㄹㅇ 공감', '저장해둠', '단톡에 공유함', '선생님께 여쭤봐'];

// ---------- HTTP 세션 (쿠키 지원) ----------

class Session {
  constructor() { this.cookies = new Map(); }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async fetch(url, opts = {}) {
    opts.headers = Object.assign({}, opts.headers);
    const ck = this.cookieHeader();
    if (ck) opts.headers.Cookie = ck;
    const res = await fetch(BASE + url, opts);
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }
  async json(method, url, body) {
    const res = await this.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (_) { data = text; }
    // 글/댓글 생성은 201 + 빈 바디 + Location 헤더로 ID를 준다 (PostController/CommentController).
    return { status: res.status, data, location: res.headers.get('location') };
  }
  /** Location 헤더(`/api/posts/{id}` 등)의 마지막 path segment를 숫자 ID로 뽑는다. */
  static idFromLocation(location) {
    if (!location) return null;
    const seg = location.split('/').filter(Boolean).pop();
    const id = Number(seg);
    return Number.isFinite(id) ? id : null;
  }
}

/**
 * 제한 동시성 실행기.
 *
 * 인기글(Zipf 편중) 댓글/반응/스크랩은 같은 post row를 동시에 UPDATE하다가
 * MySQL 데드락("Deadlock found when trying to get lock; try restarting transaction")을
 * 실제로 유발한다(BTL-003, 동시성 5의 낮은 부하에서도 재현됨). MySQL 공식 문서도
 * 데드락은 애플리케이션이 재시도하는 것을 전제로 설계됐다고 명시한다 — 여기서 1회
 * 재시도한다. reactions/scraps는 멱등(같은 반응 반복은 토글/무시)이라 재시도가 안전하다.
 */
async function pooled(items, worker, concurrency = CONCURRENCY, label = '') {
  let done = 0, failed = 0;
  const queue = [...items.entries()];
  async function lane() {
    while (queue.length) {
      const [i, item] = queue.shift();
      try {
        await worker(item, i);
      } catch (e) {
        if (/[Dd]eadlock/.test(e.message)) {
          try { await worker(item, i); continue; } catch (e2) { e = e2; }
        }
        failed++;
        if (failed <= 5) console.error(`  ! ${label}[${i}]: ${e.message}`);
      }
      if (++done % 200 === 0) process.stdout.write(`  ${label}: ${done}/${items.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane));
  console.log(`  ${label}: ${done}/${items.length} 완료 (실패 ${failed})`);
}

// ---------- 생성 단계 ----------

function buildUsers() {
  const users = [];
  for (let i = 0; i < P.users; i++) {
    users.push({
      email: `perf${String(i).padStart(6, '0')}@loadtest.local`,
      password: PASSWORD,
      name: `부하${i}`,
      nickname: `perf_user_${i}`,
      // PhoneNumber 값 객체가 "010-XXXX-XXXX" 형식만 허용한다 (하이픈 필수).
      phone: `010-${String(9000 + (i % 1000)).padStart(4, '0')}-${String(1000 + (i % 9000)).padStart(4, '0')}`,
      grade: pick(['SOPHOMORE', 'JUNIOR', 'SENIOR']), // enums.Grade 실제 값 (1/2/3학년)
      gender: pick(['MALE', 'FEMALE']),
      birthDate: `${pick(['2007', '2008', '2009'])}-0${1 + randInt(9)}-1${randInt(9)}`,
      schoolIdx: randInt(P.schools), // 같은 값 = 같은 학교 (친구 클러스터 기준)
    });
  }
  return users;
}

async function registerUsers(users) {
  console.log(`[1/6] 회원가입 ${users.length}명`);
  await pooled(users, async (u) => {
    const s = new Session();
    const r = await s.json('POST', '/api/user/register', {
      name: u.name, nickname: u.nickname, phone: u.phone, email: u.email,
      grade: u.grade, gender: u.gender, provider: 'DEFAULT',
      password: u.password, birthDate: u.birthDate,
    });
    // 재실행 시 중복 가입은 409(ALREADY_EXISTS_USER) — 그 외 4xx/5xx는 실제 실패이므로 던진다.
    if (r.status >= 400 && r.status !== 409) {
      throw new Error(`register ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }, CONCURRENCY, 'register');
}

async function loginAll(users) {
  console.log(`[2/6] 로그인 세션 확보`);
  const sessions = new Array(users.length);
  await pooled(users, async (u, i) => {
    const s = new Session();
    const r = await s.json('POST', '/api/user/login', { email: u.email, password: u.password });
    if (r.status !== 200) throw new Error(`login ${r.status}`);
    sessions[i] = s;
  }, CONCURRENCY, 'login');
  return sessions;
}

async function fetchBoards(sessions) {
  const s = sessions.find(Boolean);
  const r = await s.json('GET', '/api/boards');
  const boards = (Array.isArray(r.data) ? r.data : []).map((b) => ({
    id: b.id ?? b.boardId, name: b.name ?? b.boardName ?? '',
  })).filter((b) => b.id != null);
  if (boards.length === 0) throw new Error('게시판이 없습니다 — 서버 data.sql 초기화 확인');
  console.log(`  게시판 ${boards.length}개 확인`);
  return boards;
}

async function createPosts(users, sessions, boards) {
  console.log(`[3/6] 게시글 ${P.posts}건 (작성자 Zipf 편중)`);
  const posts = [];
  const jobs = Array.from({ length: P.posts }, (_, i) => i);
  await pooled(jobs, async (i) => {
    const authorIdx = zipf(users.length);          // 헤비 유저 편중
    const s = sessions[authorIdx];
    if (!s) return;
    const board = boards[randInt(boards.length)];
    const r = await s.json('POST', '/api/posts', {
      boardId: board.id,
      title: `${pick(TITLES)} #${i}`,
      content: `${pick(BODIES)} `.repeat(1 + randInt(8)),
      // RequestPostDto의 boolean 필드는 Lombok이 setAnonymous(...)를 생성하므로
      // Jackson이 기대하는 JSON 키는 "isAnonymous"가 아니라 "anonymous"다 (실측 확인됨).
      anonymous: rand() < 0.5,
    });
    if (r.status >= 200 && r.status < 300) {
      // 201 Created는 바디가 비어 있고 Location: /api/posts/{id} 헤더로만 ID를 준다.
      const id = Session.idFromLocation(r.location);
      if (id) posts.push({ id, boardId: board.id, rank: i });
      else throw new Error(`post 2xx이지만 Location 헤더에서 id를 못 뽑음: ${r.location}`);
    } else if (r.status >= 500) throw new Error(`post ${r.status}`);
  }, CONCURRENCY, 'posts');
  // rank 낮은 글 = 먼저 생성된 글 = 인기글로 사용 (posts.json은 인기순 정렬 상태)
  posts.sort((a, b) => a.rank - b.rank);
  return posts;
}

async function createEngagement(users, sessions, posts) {
  console.log(`[4/6] 댓글 ${P.comments} + 반응 ${P.reactions} + 스크랩 ${P.scraps} (게시글 Zipf 편중)`);
  const commentJobs = Array.from({ length: P.comments }, () => ({
    post: posts[zipf(posts.length)],
    author: zipf(users.length),
  }));
  await pooled(commentJobs, async (j) => {
    const s = sessions[j.author];
    if (!s || !j.post) return;
    const r = await s.json('POST', `/api/posts/${j.post.id}/comments`, {
      parentId: null, content: pick(COMMENTS_POOL), anonymous: rand() < 0.6, url: null,
    });
    if (r.status >= 500) throw new Error(`comment ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }, CONCURRENCY, 'comments');

  const reactionJobs = Array.from({ length: P.reactions }, () => ({
    post: posts[zipf(posts.length)],
    user: randInt(users.length),
  }));
  await pooled(reactionJobs, async (j) => {
    const s = sessions[j.user];
    if (!s || !j.post) return;
    const type = rand() < 0.85 ? 'LIKE' : 'DISLIKE';
    const r = await s.json('POST', `/api/posts/${j.post.id}/reaction?type=${type}`);
    if (r.status >= 500) throw new Error(`reaction ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }, CONCURRENCY, 'reactions');

  const scrapJobs = Array.from({ length: P.scraps }, () => ({
    post: posts[zipf(posts.length)],
    user: randInt(users.length),
  }));
  await pooled(scrapJobs, async (j) => {
    const s = sessions[j.user];
    if (!s || !j.post) return;
    const r = await s.json('POST', `/api/posts/${j.post.id}/scraps`);
    if (r.status >= 500) throw new Error(`scrap ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }, CONCURRENCY, 'scraps');
}

async function createFriendships(users, sessions) {
  console.log(`[5/6] 친구 관계 ~${P.friendships}쌍 (같은 학교 클러스터)`);
  const bySchool = new Map();
  users.forEach((u, i) => {
    if (!bySchool.has(u.schoolIdx)) bySchool.set(u.schoolIdx, []);
    bySchool.get(u.schoolIdx).push(i);
  });
  const pairs = [];
  const seen = new Set();
  let guard = P.friendships * 20;
  while (pairs.length < P.friendships && guard-- > 0) {
    // 80%는 같은 학교, 20%는 무작위
    let a, b;
    if (rand() < 0.8) {
      const group = bySchool.get(randInt(P.schools)) || [];
      if (group.length < 2) continue;
      a = pick(group); b = pick(group);
    } else {
      a = randInt(users.length); b = randInt(users.length);
    }
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }

  await pooled(pairs, async ([a, b]) => {
    const sa = sessions[a], sb = sessions[b];
    if (!sa || !sb) return;
    const r1 = await sa.json('POST', '/api/friends/request', { nickname: users[b].nickname });
    if (r1.status >= 500) throw new Error(`friend request ${r1.status}`);
    // 받은 신청 목록에서 이 신청을 찾아 수락
    const r2 = await sb.json('GET', '/api/friends/requests/received');
    if (Array.isArray(r2.data)) {
      const req = r2.data.find((q) =>
        (q.requesterNickname ?? q.nickname) === users[a].nickname) || r2.data[r2.data.length - 1];
      if (req) await sb.json('POST', '/api/friends/respond', { id: req.id, status: 'ACCEPTED' });
    }
  }, Math.min(CONCURRENCY, 5), 'friendships');
  return pairs;
}

async function createChat(users, sessions, pairs) {
  console.log(`[6/6] 채팅방 + 메시지`);
  const roomPairs = pairs.slice(0, Math.floor(pairs.length * P.chatRoomRatio));
  const rooms = [];
  await pooled(roomPairs, async ([a, b]) => {
    const sa = sessions[a];
    if (!sa) return;
    // friendId = 상대 userId — 친구 목록에서 조회
    const fl = await sa.json('GET', '/api/friends/list');
    if (!Array.isArray(fl.data)) return;
    const friend = fl.data.find((f) => (f.nickname ?? '') === users[b].nickname);
    if (!friend) return;
    const r = await sa.json('POST', '/api/chat/rooms', { friendId: friend.id ?? friend.userId });
    if (r.status === 200 && r.data) rooms.push({ roomId: r.data.roomId ?? r.data.id, a, b });
  }, Math.min(CONCURRENCY, 5), 'chat-rooms');

  // 방마다 히스토리 메시지 (REST가 아닌 WS 전용이므로 여기서는 read 상태만 갱신)
  // 메시지 히스토리는 chat-ws.js 첫 실행이 자연스럽게 쌓는다.
  console.log(`  1:1 채팅방 ${rooms.length}개 생성`);
  return rooms;
}

// ---------- 메인 ----------

(async function main() {
  console.log(`프로파일: ${PROFILE_NAME}`, P, `→ ${BASE}`);
  const t0 = Date.now();

  const users = buildUsers();
  await registerUsers(users);
  const sessions = await loginAll(users);
  const boards = await fetchBoards(sessions);
  const posts = await createPosts(users, sessions, boards);
  await createEngagement(users, sessions, posts);
  const pairs = await createFriendships(users, sessions);
  await createChat(users, sessions, pairs);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'users.json'),
    JSON.stringify(users.map((u) => ({ email: u.email, nickname: u.nickname })), null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'posts.json'),
    JSON.stringify(posts.map((p) => ({ id: p.id, boardId: p.boardId })), null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'boards.json'), JSON.stringify(boards, null, 1));

  console.log(`\n완료: ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`);
  console.log(`산출물: ${OUT_DIR}/{users,posts,boards}.json`);
  console.log(`k6 실행 시 -e DATASET=${PROFILE_NAME} 로 사용`);
})().catch((e) => { console.error(e); process.exit(1); });
