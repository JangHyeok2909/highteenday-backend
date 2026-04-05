/**
 * k6 — 게시글 반응 동시성 + 정합성 자동 검증
 *
 * 토큰
 * - 기본: setup()에서 회원가입을 VUS명만큼 수행 → 유저 수 = VU 수 → VU마다 서로 다른 토큰(1:1)
 * - 선택: ACCESS_TOKENS 가 있으면 자동 회원가입 생략 (토큰 개수 < VU 이면 라운드로빈 공유)
 *
 * 실행
 *   k6 run load-tests/k6-post-reactions.js
 *   VUS=50 POST_ID=1 k6 run load-tests/k6-post-reactions.js
 *
 * 환경변수
 *   BASE_URL, POST_ID, MODE(like|dislike|mixed), VUS 또는 USER_COUNT (기본 150)
 *   K6_USER_PASSWORD (기본 K6LoadTest!1), ACCESS_TOKENS (선택)
 *
 * 백엔드: GET /api/posts/{id}/consistency (drift 시 teardown 실패)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const POST_ID = __ENV.POST_ID || '1';
const MODE = (__ENV.MODE || 'mixed').toLowerCase();

/** 동시 VU 수 = 자동 생성할 테스트 유저 수(기본 동일) */
const VUS = parseInt(__ENV.VUS || __ENV.USER_COUNT || '100', 10);

export const options = {
  scenarios: {
    spike_test: {
      executor: 'constant-vus',
      vus: VUS,
      duration: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

function extractAccessToken(res) {
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  if (raw === undefined || raw === null) return null;
  const joined = Array.isArray(raw) ? raw.join(';') : String(raw);
  const m = joined.match(/accessToken=([^;]+)/);
  return m ? m[1].trim() : null;
}

/** DB constraints: USR_nickname max 12, USR_name max 10 */
function nickname12(ts, i) {
  return (`k6${ts}${i}`).slice(-12);
}

function name10(i) {
  return (`k6u${i}`).slice(0, 10);
}

function registerOne(baseUrl, i, ts, password) {
  const email = `k6_${ts}_${i}@loadtest.local`;
  const payload = JSON.stringify({
    name: name10(i),
    nickname: nickname12(ts, i),
    phone: `010${String(10000000 + i).padStart(8, '0')}`,
    email: email,
    grade: 'SOPHOMORE',
    gender: 'MALE',
    provider: null,
    password: password,
  });

  const res = http.post(`${baseUrl}/api/user/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/user/register' },
  });

  if (res.status !== 200) {
    return {
      ok: false,
      email,
      status: res.status,
      detail: String(res.body || '').slice(0, 400),
    };
  }

  const token = extractAccessToken(res);
  if (!token) {
    return { ok: false, email, status: res.status, detail: 'no accessToken in Set-Cookie' };
  }

  return { ok: true, token };
}

//기본은 유저 수 만큼 토큰 할당, 토큰 부족할 시에만 라운드로빈
export function setup() {
  const baseUrl = BASE_URL;
  const password = __ENV.K6_USER_PASSWORD || 'K6LoadTest!1';

  const manual = (__ENV.ACCESS_TOKENS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (manual.length > 0) {
    console.log(
      `setup: ACCESS_TOKENS ${manual.length}개 사용 . VUS=${VUS} → 토큰 부족시 라운드 로빈으로 사용`
    );
    return { tokens: manual, baseUrl };
  }

  const ts = Date.now();
  const tokens = [];
  console.log(`setup: VUS=${VUS} 와 동일하게 회원가입 ${VUS}건 → 토큰 ${VUS}개 발급`);

  for (let i = 0; i < VUS; i++) {
    const r = registerOne(baseUrl, i, ts, password);
    if (!r.ok) {
      throw new Error(
        `register failed i=${i} status=${r.status} email=${r.email} detail=${r.detail}`
      );
    }
    tokens.push(r.token);
    sleep(0.05);
  }

  console.log(`setup: 완료 tokens=${tokens.length} (VU 1..${VUS} 각각 1토큰)`);
  return { tokens, baseUrl };
}

function authHeaders(token) {
  return {
    Cookie: `accessToken=${token}`,
  };
}

function pickEndpoint() {
  if (MODE === 'like') return 'like';
  if (MODE === 'dislike') return 'dislike';
  return Math.random() < 0.5 ? 'like' : 'dislike';
}

export default function (data) {
  const tokens = data.tokens;
  const token = tokens[(__VU - 1) % tokens.length];

  const action = pickEndpoint();
  const url = `${data.baseUrl}/api/posts/${POST_ID}/${action}`;

  const res = http.post(url, null, {
    headers: authHeaders(token),
  });

  check(res, {
    'status is 200': (r) => {
      if (r.status !== 200) {
        console.error(` ${r.url} failed with status ${r.status}, body: ${r.body}`);
        return false;
      }
      return true;
    },
  });
}

export function teardown(data) {
  const baseUrl = data.baseUrl || BASE_URL;
  const url = `${baseUrl}/api/posts/${POST_ID}/consistency`;

  const res = http.get(url);

  if (res.status !== 200) {
    throw new Error(`consistency API 실패: status=${res.status} body=${String(res.body).slice(0, 200)}`);
  }

  let body;
  try {
    body = JSON.parse(res.body);
  } catch (e) {
    throw new Error(`consistency 응답 JSON 파싱 실패: ${e}`);
  }

  console.log('\n==============================');
  console.log('CONSISTENCY CHECK RESULT');
  console.log('==============================');
  console.log(JSON.stringify(body, null, 2));

  if (body.drift) {
    console.error('DATA DRIFT');
    console.error(`likeCount=${body.likeCount}, likeActual=${body.likeActual}`);
    console.error(`dislikeCount=${body.dislikeCount}, dislikeActual=${body.dislikeActual}`);
    throw new Error('데이터 정합성 불일치 (drift=true)');
  }

  console.log('\nNO DRIFT');
}
