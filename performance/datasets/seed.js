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
 *   node datasets/seed.js --profile small [--base http://localhost:18080] [--concurrency 10]
 *   프로파일: smoke(20명) | small(100명) | medium(1,000명) | large(10,000명) | xlarge(100,000명)
 *
 * 산출물: datasets/generated/<profile>/{users,posts,boards}.json  ← k6가 로드
 * 요구사항: Node 18+ (내장 fetch)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Node 18 미만에는 전역 fetch가 없다. 가드가 없으면 수백 건의
// "fetch is not defined"가 개별 요청 실패로 찍히다가 마지막에 엉뚱한
// TypeError로 죽어, 원인이 노드 버전이라는 사실이 드러나지 않는다(실측 2회).
if (typeof fetch !== 'function') {
  console.error(
    `이 스크립트는 Node 18+ 가 필요하다 (전역 fetch 사용). 현재: ${process.version}\n` +
    `  nvm-windows 예: nvm use 22.23.1`
  );
  process.exit(1);
}

// ---------- 설정 ----------

const PROFILES = require('./profiles.json');

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const PROFILE_NAME = arg('profile', 'small');
const BASE = arg('base', 'http://localhost:18080');
const CONCURRENCY = Number(arg('concurrency', 10));
const P = PROFILES[PROFILE_NAME];
if (!P) {
  console.error(`unknown profile: ${PROFILE_NAME} (available: ${Object.keys(PROFILES).join(', ')})`);
  process.exit(1);
}

const PASSWORD = 'PerfTest123!'; // scripts/lib/config.js SEED_PASSWORD와 일치해야 함
const OUT_DIR = path.join(__dirname, 'generated', PROFILE_NAME);

// ---------- 유틸 ----------

/**
 * 결정론적 PRNG — 같은 프로파일이면 항상 같은 데이터 (재현성).
 *
 * 이전 구현은 `seed * 1103515245` 를 그대로 계산했는데, 이 곱이 2^53 을 넘어
 * JavaScript 의 안전 정수 범위를 벗어난다. 하위 비트가 뭉개지면서 **주기가 10,466** 밖에
 * 되지 않았고, 그 이상 뽑으면 같은 수열이 반복됐다.
 *
 * 지금까지는 중복이 그냥 중복 요청이 되어 조용히 넘어갔지만, (사용자, 게시글) 조합의
 * 유일성을 요구하자 드러났다 — large 시드에서 반응 100만 건 목표에 5,185 개,
 * 친구 3만 쌍 목표에 2,702 쌍만 확보됐다.
 *
 * Math.imul 은 32비트 곱셈을 정밀도 손실 없이 수행한다. 주기는 2^32 이고, 같은 시드는
 * 여전히 같은 수열을 준다. 다만 수열 자체가 바뀌므로 이 커밋 이후의 시드 데이터는
 * 이전과 다르다 — 프로파일별로 재생성해야 한다.
 */
let seed = 20260730;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
}
function randInt(n) { return Math.floor(rand() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }

/**
 * 인기 편중 샘플러: 0..n-1, 낮은 인덱스일수록 자주 뽑힌다.
 *
 * 규칙 본체는 `scripts/lib/sampling.js`에 있다 — 부하 스크립트(`scripts/lib/data.js`)와
 * **같은 분포**를 써야 하기 때문이다. 예전에는 이 파일이 같은 식을 복사해 갖고 있었고,
 * 그 식이 index 0을 못 뽑아서(S-03) `posts.json`의 index 0에는 댓글·반응·스크랩이 하나도
 * 붙지 않았다. 그런데 `datasets/README.md`는 그 자리를 "최고 인기글"이라고 선언한다.
 * 규칙을 한 곳에 두지 않으면 이런 모순이 조용히 유지된다.
 *
 * 난수원으로 이 파일의 고정 시드 `rand()`를 넘긴다 — 시드 데이터의 재현성을 지키려면
 * 샘플러가 Math.random을 쓰면 안 된다.
 */
let hotIndex = null; // main()이 동적 import로 채운다 (ESM ↔ CJS 경계)
function zipf(n) {
  return hotIndex(n, undefined, rand);
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
  /**
   * 액세스 토큰이 만료됐으면 재발급하고 한 번 다시 보낸다.
   *
   * 액세스 토큰 수명은 30분인데(TokenProvider.ACCESS_TOKEN_EXPIRE_TIME) large 시드는
   * 그보다 오래 걸린다. 실측에서 반응 단계가 길어지자 그 뒤의 스크랩 8만 건이 전부 401 로
   * 죽었다 — 세션은 살아 있는데 토큰만 만료된 상태였다. 리프레시 토큰은 7일이라 갱신으로
   * 충분히 덮인다. 갱신 요청 자체가 실패하면 원래 401 응답을 그대로 돌려 상위에서
   * 실패로 집계되게 둔다.
   */
  async json(method, url, body) {
    const send = () => this.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let res = await send();
    if (res.status === 401 && url !== '/api/token/refresh') {
      const refreshed = await this.fetch('/api/token/refresh', { method: 'POST' });
      if (refreshed.status >= 200 && refreshed.status < 300) res = await send();
    }

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

/** 워커가 이 값을 반환하면 "일을 하지 않고 건너뛰었다"로 집계된다 (성공으로 세지 않는다). */
const SKIP = Symbol('skip');

/**
 * 제한 동시성 실행기.
 *
 * 인기글(Zipf 편중) 댓글/반응/스크랩은 같은 post row를 동시에 UPDATE하다가
 * MySQL 데드락("Deadlock found when trying to get lock; try restarting transaction")을
 * 실제로 유발한다(BTL-003, 동시성 5의 낮은 부하에서도 재현됨). MySQL 공식 문서도
 * 데드락은 애플리케이션이 재시도하는 것을 전제로 설계됐다고 명시한다 — 여기서 1회
 * 재시도한다. reactions/scraps는 멱등(같은 반응 반복은 토글/무시)이라 재시도가 안전하다.
 */
/**
 * 재시도해도 되는 실패인가.
 *
 * 기준은 "그 요청이 일을 하지 않은 것이 확실한가"다. 아래 셋은 전부 트랜잭션이 시작되기
 * 전이거나 롤백된 뒤라, 글·댓글처럼 멱등하지 않은 생성도 중복 없이 다시 보낼 수 있다.
 *
 *  - 데드락      : MySQL이 롤백시킨다. 공식 문서도 애플리케이션 재시도를 전제로 한다.
 *  - 커넥션 고갈 : HikariCP가 커넥션을 못 줘서 트랜잭션 자체가 열리지 않는다.
 *                 이게 과거 시드가 명세에 미달한 실제 원인인데, 데드락만 재시도하던
 *                 이전 구현에서는 그대로 영구 손실이 됐다.
 *  - 전송 오류   : 연결이 끊겨 요청이 서버에 닿지 않았다.
 *
 * 반대로 일반 5xx는 재시도하지 않는다. 앱 결함으로 일부가 이미 적용됐을 수 있어 다시 보내면
 * 중복이 생긴다. 4xx도 재시도 대상이 아니다 — 같은 요청을 다시 보내도 결과가 같다.
 */
function isRetryable(err) {
  const m = String(err && err.message);
  return /[Dd]eadlock/.test(m)
    || /Could not open JPA EntityManager|Connection is not available|HikariPool|connection timeout/i.test(m)
    || /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|fetch failed|other side closed/i.test(m);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pooled(items, worker, concurrency = CONCURRENCY, label = '') {
  let processed = 0, ok = 0, failed = 0, skipped = 0, retried = 0;
  const queue = [...items.entries()];

  const tally = (r) => { if (r === SKIP) skipped++; else ok++; };

  // 인기글 카운터(BTL-003)의 데드락은 시드 내내 꾸준히 발생한다. 이건 앱에서 없앨 대상이
  // 아니라 EXP-003 이 측정할 병목이므로, 시더 쪽에서 재시도로 흡수해 데이터셋만 온전히 만든다.
  // 3회로는 부족했다(smoke 실측: 댓글 2.7%, 스크랩 5% 손실).
  const MAX_ATTEMPTS = 6;

  async function lane() {
    while (queue.length) {
      const [i, item] = queue.shift();
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          tally(await worker(item, i));
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt === MAX_ATTEMPTS || !isRetryable(e)) break;
          retried++;
          // 지수 백오프 + 지터. 지터가 없으면 모든 레인이 같은 박자로 재시도해
          // 고갈 상태를 스스로 연장한다. 상한을 두는 이유는 재시도 대기가 길어지면
          // 레인이 놀아 전체 처리량이 떨어지기 때문이다.
          await sleep(Math.min(100 * 2 ** (attempt - 1), 800) + Math.floor(rand() * 50));
        }
      }
      if (lastErr) {
        failed++;
        if (failed <= 5) console.error(`  ! ${label}[${i}]: ${lastErr.message}`);
      }
      if (++processed % 200 === 0) process.stdout.write(`  ${label}: ${processed}/${items.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane));

  // "처리 개수"가 아니라 "실제 생성 개수"를 보고한다. 이전에는 조용히 건너뛴 작업까지
  // 완료로 세어 "500/500 완료 (실패 0)"인데 실제로는 187건만 생성된 상태를 성공으로
  // 보고했다(실측). 데이터셋이 명세에 미달하면 그 위의 모든 실험이 무효가 되므로
  // 여기서 크게 드러내야 한다.
  const parts = [`성공 ${ok}`];
  if (failed) parts.push(`실패 ${failed}`);
  if (skipped) parts.push(`건너뜀 ${skipped}`);
  // 재시도 횟수는 경합의 크기를 보여준다. 성공했더라도 이 수가 크면 동시성이나 풀 크기가
  // 맞지 않는다는 신호이므로 다음 실행에서 조정할 근거가 된다.
  if (retried) parts.push(`재시도 ${retried}`);
  console.log(`  ${label}: ${processed}/${items.length} 처리 (${parts.join(', ')})`);
  if (ok < items.length) {
    console.log(`    ⚠ 목표 ${items.length}건 중 ${items.length - ok}건 미생성 — 데이터셋이 명세에 미달한다.`);
  }
}

// ---------- 생성 단계 ----------

function buildUsers() {
  const users = [];
  for (let i = 0; i < P.users; i++) {
    users.push({
      email: `perf${String(i).padStart(6, '0')}@loadtest.local`,
      password: PASSWORD,
      name: `부하${i}`,
      // 닉네임은 2~12자 제한이 있다(Nickname 값 객체). `perf_user_${i}` 는 i>=100 부터
      // 13자가 되어 가입이 400 으로 거절된다 — large 실측에서 10,000명 중 정확히 100명만
      // 가입에 성공했고, 그 뒤 단계가 전부 그 100명 위에서 돌아 데이터셋이 무너졌다.
      // small(100명)이 지금까지 멀쩡했던 건 우연히 경계 안이었기 때문이다.
      // `u${i}` 는 xlarge(10만명)의 `u99999` 도 6자라 여유가 있다.
      nickname: `u${i}`,
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
    // 자기 userId를 여기서 한 번만 받아 세션에 붙인다.
    // 친구 신청 API가 닉네임이 아니라 대상 사용자 id를 받으므로(RequestFriendDto.targetUserId)
    // 어딘가에서는 id를 알아야 한다. 쌍마다 /friends/search 로 조회하면 요청이 쌍 수만큼
    // 늘어나지만(large 기준 3만 건), 로그인 직후 1회면 사용자 수만큼(1만 건)으로 끝난다.
    const info = await s.json('GET', '/api/user/userInfo');
    if (info.status !== 200 || !info.data || info.data.id == null) {
      throw new Error(`userInfo ${info.status}: id를 못 받음`);
    }
    s.userId = info.data.id;
    sessions[i] = s;
  }, CONCURRENCY, 'login');
  return sessions;
}

/**
 * 사용자에게 학교/학년/반을 배정한다.
 *
 * users의 `schoolIdx`는 원래 친구 클러스터링 계산에만 쓰였고 실제 계정에는 반영되지
 * 않았다. 그 결과 급식처럼 학교 배정을 요구하는 경로가 전부 400(SCHOOL_NOT_ASSIGNED)이
 * 되어, `scripts/school.js`가 요청의 절반을 실패하면서도 checks는 100%로 통과하는
 * 상태였다(실측: 실패율 53.1%, checks 100% — 검증이 `status < 500`이라 400을 놓쳤다).
 *
 * schools 테이블은 마이그레이션으로 이미 채워져 있다(2401개, SCH_id 1~2401).
 * schoolIdx(0-based)를 SCH_id(1-based)에 그대로 대응시키면 "같은 schoolIdx = 같은 학교"가
 * 유지되므로 친구 클러스터 전제도 그대로다.
 */
async function assignSchools(users, sessions) {
  console.log('  학교/학년/반 배정');
  await pooled(users, async (u, i) => {
    const s = sessions[i];
    if (!s) return SKIP;                       // 세션 없는 계정은 배정 불가 — 건너뜀으로 집계
    const r = await s.json('PATCH', '/api/user/school', {
      schoolId: String(u.schoolIdx + 1),       // SchoolIdDto.schoolId 는 String 이다
      grade: u.grade,
      userClass: 1 + (i % 10),
    });
    if (r.status >= 400) {
      throw new Error(`school ${r.status}: ${JSON.stringify(r.data).slice(0, 150)}`);
    }
  }, CONCURRENCY, 'school');
}

/**
 * 세션이 확보된 사용자 인덱스만 추린다.
 *
 * 가입/로그인이 실패한 계정을 남겨둔 채 zipf(users.length)로 작성자를 뽑으면, 그 계정이
 * 뽑힐 때마다 작업이 조용히 버려진다. 게다가 Zipf는 낮은 인덱스(헤비 유저)를 압도적으로
 * 자주 뽑으므로 상위 몇 명만 실패해도 손실이 증폭된다.
 *
 * 실측(small): 100명 중 8명이 로그인에 실패하자 글이 500건 중 187건만 생성됐는데도
 * "500/500 완료 (실패 0)"으로 보고됐고, 작성자 분포도 Zipf가 아니라 거의 균등해져
 * (최다 작성자 12건) datasets/README.md가 전제하는 Hot Data 편중이 사라졌다.
 * 편중을 전제로 한 병목(BTL-001/003/004)은 이런 데이터로는 재현되지 않는다.
 *
 * 살아있는 세션만 모아 그 위에서 Zipf를 돌리면 생성 개수와 분포 형태가 모두 보존된다.
 * (누가 헤비 유저가 되는지는 바뀌지만, 실험에 필요한 것은 특정 계정이 아니라 분포다.)
 */
function liveAuthors(sessions) {
  const live = [];
  for (let i = 0; i < sessions.length; i++) if (sessions[i]) live.push(i);
  if (live.length === 0) {
    throw new Error('사용 가능한 세션이 없다 — 회원가입/로그인 단계를 먼저 확인할 것');
  }
  if (live.length < sessions.length) {
    console.log(`  ⚠ 세션 확보 ${live.length}/${sessions.length}명 — 작성자 풀을 이 범위로 제한한다`);
  }
  return live;
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
  const live = liveAuthors(sessions);
  const posts = [];
  const jobs = Array.from({ length: P.posts }, (_, i) => i);
  await pooled(jobs, async (i) => {
    const authorIdx = live[zipf(live.length)];     // 살아있는 세션 위에서 헤비 유저 편중
    const s = sessions[authorIdx];
    const board = boards[randInt(boards.length)];
    const r = await s.json('POST', '/api/posts', {
      boardId: board.id,
      title: `${pick(TITLES)} #${i}`,
      content: `${pick(BODIES)} `.repeat(1 + randInt(8)),
      // RequestPostDto의 boolean 필드는 Lombok이 setAnonymous(...)를 생성하므로
      // Jackson이 기대하는 JSON 키는 "isAnonymous"가 아니라 "anonymous"다 (실측 확인됨).
      anonymous: rand() < 0.5,
    });
    // 4xx도 실패다. 예전에는 `else if (r.status >= 500)`이라 4xx가 어느 분기도 타지 않아
    // posts 배열에는 안 담기는데 성공으로 집계됐다 — 배열이 비어가는데 "성공 100,000"으로
    // 보고되는 상태였다. 미달을 드러내려면 여기서 던져야 한다.
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`post ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
    // 201 Created는 바디가 비어 있고 Location: /api/posts/{id} 헤더로만 ID를 준다.
    const id = Session.idFromLocation(r.location);
    if (!id) throw new Error(`post 2xx이지만 Location 헤더에서 id를 못 뽑음: ${r.location}`);
    posts.push({ id, boardId: board.id, rank: i });
  }, CONCURRENCY, 'posts');
  // rank 낮은 글 = 먼저 생성된 글 = 인기글로 사용 (posts.json은 인기순 정렬 상태)
  posts.sort((a, b) => a.rank - b.rank);
  return posts;
}

async function createEngagement(users, sessions, posts) {
  console.log(`[4/6] 댓글 ${P.comments} + 반응 ${P.reactions} + 스크랩 ${P.scraps} (게시글 Zipf 편중)`);
  const live = liveAuthors(sessions);
  if (posts.length === 0) throw new Error('게시글이 없다 — 3단계(게시글 생성)를 먼저 확인할 것');

  const commentJobs = Array.from({ length: P.comments }, () => ({
    post: posts[zipf(posts.length)],
    author: live[zipf(live.length)],
  }));
  await pooled(commentJobs, async (j) => {
    const s = sessions[j.author];
    const r = await s.json('POST', `/api/posts/${j.post.id}/comments`, {
      parentId: null, content: pick(COMMENTS_POOL), anonymous: rand() < 0.6, url: null,
    });
    // 4xx도 실패로 본다 — 아래 반응/스크랩도 같다. 5xx만 보면 조용히 미달한다.
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`comment ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }, CONCURRENCY, 'comments');

  // 반응과 스크랩은 (사용자, 게시글) 조합이 유일해야 한다 — DB에도 유니크 제약이 있다
  // (uk_posts_reactions_pst_usr / uk_scraps_usr_pst). 예전처럼 무작위로 뽑으면 같은 조합이
  // 반복되는데, 서버가 upsert 로 바뀐 뒤로는 그게 오류가 아니라 "기존 행 갱신"이 되어
  // 조용히 목표 개수에 미달한다. 실패로 드러나지 않으므로 생성 단계에서 걸러야 한다.
  //
  // 한 게시글이 받을 수 있는 반응의 상한은 사용자 수다. Zipf 로 인기글에 몰리므로 상위
  // 게시글은 금방 포화되고, 그때부터는 뽑기가 계속 중복에 걸린다. guard 로 시도 횟수를
  // 제한하고, 목표에 못 미치면 그대로 보고한다(조용히 줄이지 않는다).
  const uniquePairs = (count, label) => {
    const jobs = [];
    const seen = new Set();
    let guard = count * 20;
    while (jobs.length < count && guard-- > 0) {
      const post = posts[zipf(posts.length)];
      const user = live[randInt(live.length)];
      const key = `${user}:${post.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ post, user });
    }
    if (jobs.length < count) {
      console.log(`  ⚠ ${label}: 유일한 (사용자, 게시글) 조합을 ${jobs.length}/${count}개만 확보했다 ` +
        `— 사용자 ${live.length}명 / 게시글 ${posts.length}건으로는 이 목표를 채울 수 없다.`);
    }
    return jobs;
  };

  const reactionJobs = uniquePairs(P.reactions, '반응');
  await pooled(reactionJobs, async (j) => {
    const s = sessions[j.user];
    const type = rand() < 0.85 ? 'LIKE' : 'DISLIKE';
    const r = await s.json('POST', `/api/posts/${j.post.id}/reaction?type=${type}`);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`reaction ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }, CONCURRENCY, 'reactions');

  const scrapJobs = uniquePairs(P.scraps, '스크랩');
  await pooled(scrapJobs, async (j) => {
    const s = sessions[j.user];
    const r = await s.json('POST', `/api/posts/${j.post.id}/scraps`);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`scrap ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
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
    if (!sa || !sb) return SKIP;   // 세션 없는 계정 — 성공으로 세지 않는다
    // 닉네임이 아니라 대상 사용자 id로 보낸다. 닉네임에는 유니크 제약이 없고 변경도
    // 가능해서 API가 id 기반으로 바뀌었다(RequestFriendDto.targetUserId).
    const r1 = await sa.json('POST', '/api/friends/request', { targetUserId: sb.userId });
    if (r1.status < 200 || r1.status >= 300) {
      throw new Error(`friend request ${r1.status}: ${JSON.stringify(r1.data).slice(0, 150)}`);
    }
    // 받은 신청 목록에서 이 신청을 찾아 수락.
    // 응답은 FriendInfoDto 라 신청 식별자가 requestId 다 — id 로 읽으면 undefined 가 되어
    // JSON 에서 통째로 빠지고 서버가 400 으로 끊는다.
    const r2 = await sb.json('GET', '/api/friends/requests/received');
    if (r2.status !== 200 || !Array.isArray(r2.data)) {
      throw new Error(`received ${r2.status}`);
    }
    const req = r2.data.find((q) => q.userId === sa.userId) || r2.data[r2.data.length - 1];
    if (!req || req.requestId == null) throw new Error('받은 신청 목록에서 방금 보낸 신청을 못 찾음');
    const r3 = await sb.json('POST', '/api/friends/respond', { id: req.requestId, status: 'ACCEPTED' });
    if (r3.status < 200 || r3.status >= 300) {
      throw new Error(`friend respond ${r3.status}: ${JSON.stringify(r3.data).slice(0, 150)}`);
    }
  }, Math.min(CONCURRENCY, 5), 'friendships');
  return pairs;
}

async function createChat(users, sessions, pairs) {
  console.log(`[6/6] 채팅방 + 메시지`);
  const roomPairs = pairs.slice(0, Math.floor(pairs.length * P.chatRoomRatio));
  const rooms = [];
  await pooled(roomPairs, async ([a, b]) => {
    const sa = sessions[a], sb = sessions[b];
    if (!sa || !sb) return SKIP;
    // 상대 userId 는 세션이 이미 들고 있다. 예전에는 쌍마다 /friends/list 를 조회해
    // 닉네임으로 찾았는데, large 기준 9천 건의 목록 조회가 더해지고 닉네임이 바뀌면
    // 조용히 못 찾는 구조였다.
    const r = await sa.json('POST', '/api/chat/rooms', { friendId: sb.userId });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`chat room ${r.status}: ${JSON.stringify(r.data).slice(0, 150)}`);
    }
    const roomId = r.data && (r.data.roomId ?? r.data.id);
    if (roomId == null) throw new Error(`chat room 2xx 이지만 roomId 를 못 받음`);
    rooms.push({ roomId, a, b });
  }, Math.min(CONCURRENCY, 5), 'chat-rooms');

  // 방마다 히스토리 메시지 (REST가 아닌 WS 전용이므로 여기서는 read 상태만 갱신)
  // 메시지 히스토리는 chat-ws.js 첫 실행이 자연스럽게 쌓는다.
  console.log(`  1:1 채팅방 ${rooms.length}개 생성`);
  return rooms;
}

// ---------- 데이터셋 지문 ----------

/**
 * 이 데이터셋이 "어떤 규칙으로 만들어진 무엇인가"를 요약한 지문을 만든다.
 *
 * 왜 필요한가: 비교 조건에서 데이터셋은 그동안 프로파일 이름(`large`)뿐이었다. 그런데
 * 인기 편중 샘플러를 고쳐 데이터를 다시 만들어도 이름은 그대로 `large`다. 그러면 인기
 * 분포가 완전히 달라진 데이터셋으로 잰 결과가 옛 실행과 같은 조건으로 비교된다.
 * 실제로 S-03(index 0을 못 뽑던 버그) 수정 때 그 상황이 발생할 뻔했다.
 *
 * **`generatedAt`은 지문에 넣지 않는다.** 같은 생성기·같은 프로파일로 다시 시드하면 통계적
 * 성질이 동일한 데이터셋이 나온다(LCG 시드가 고정이다). 그걸 매번 다른 데이터셋으로 취급하면
 * 재시드할 때마다 기준선이 전부 무효가 되어, 정작 막으려던 것과 무관하게 비교가 끊긴다.
 * 지문이 답해야 하는 질문은 "언제 만들었나"가 아니라 **"같은 규칙과 같은 규모인가"**다.
 *
 * 실제 생성 개수를 넣는 이유: 시드가 부분 실패하면(과거 실측: 500건 목표에 187건) 규칙이
 * 같아도 데이터가 다르다. 그 실행을 정상 데이터셋과 비교하면 안 된다.
 */
function buildMeta(users, posts, boards) {
  const hashOf = (rel) => {
    const buf = fs.readFileSync(path.join(__dirname, rel));
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  };
  // 생성 규칙을 이루는 것: 이 생성기 자체 + 공용 샘플러(인기 편중 분포).
  const generatorVersion = crypto.createHash('sha256')
    .update(hashOf('seed.js'))
    .update(hashOf('../scripts/lib/sampling.js'))
    .digest('hex').slice(0, 12);

  const identity = {
    schemaVersion: 1,
    profile: PROFILE_NAME,
    generatorVersion,
    params: P,
    counts: { users: users.length, posts: posts.length, boards: boards.length },
  };
  const fingerprint = 'sha256:' + crypto.createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex').slice(0, 12);

  return { ...identity, fingerprint, generatedAt: new Date().toISOString() };
}

// ---------- 메인 ----------

(async function main() {
  console.log(`프로파일: ${PROFILE_NAME}`, P, `→ ${BASE}`);
  const t0 = Date.now();

  // sampling.js는 k6가 요구하는 ESM이라 require()로 못 읽는다. 데이터를 만들기 전에
  // 받아 둔다 — zipf()를 쓰는 단계보다 반드시 먼저 실행되는 자리다.
  ({ hotIndex } = await import(
    require('url').pathToFileURL(path.join(__dirname, '..', 'scripts', 'lib', 'sampling.js')).href
  ));

  const users = buildUsers();
  await registerUsers(users);
  const sessions = await loginAll(users);
  await assignSchools(users, sessions);
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

  const meta = buildMeta(users, posts, boards);
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 1));

  console.log(`\n완료: ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`);
  console.log(`산출물: ${OUT_DIR}/{users,posts,boards,meta}.json`);
  console.log(`데이터셋 지문: ${meta.fingerprint} (생성기 ${meta.generatorVersion})`);
  console.log(`k6 실행 시 -e DATASET=${PROFILE_NAME} 로 사용`);
  console.log('지문이 다른 데이터셋으로 잰 과거 실행과는 비교되지 않습니다 — 새 기준선이 필요합니다.');
})().catch((e) => { console.error(e); process.exit(1); });
