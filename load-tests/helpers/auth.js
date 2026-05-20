/**
 * k6 공통 인증 헬퍼
 *
 * setup()에서 자동 회원가입 → accessToken 발급.
 * 별도 환경변수나 사전 작업 없이 바로 사용 가능.
 *
 * 사용법:
 *   import { registerAndGetToken, authHeaders } from './helpers/auth.js';
 *
 *   export function setup() {
 *     const token = registerAndGetToken(BASE_URL);
 *     return { token };
 *   }
 *
 *   export default function (data) {
 *     http.post(url, payload, { headers: authHeaders(data.token) });
 *   }
 */

import http from 'k6/http';
import { sleep } from 'k6';

const PASSWORD = 'K6test!1';  // 8자+, 숫자 포함, 특수문자 포함

function extractAccessToken(res) {
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  if (raw === undefined || raw === null) return null;
  const joined = Array.isArray(raw) ? raw.join(';') : String(raw);
  const m = joined.match(/accessToken=([^;]+)/);
  return m ? m[1].trim() : null;
}

function doRegister(baseUrl, ts, i) {
  // email: 이메일 형식, max 48자 (k6 + ts7 + _ + i5 + @loadtest.local = 32자)
  const shortTs = String(ts).slice(-7);
  const email = `k6${shortTs}_${i}@loadtest.local`;

  // nickname: 2~12자
  const nickname = (`k6u${shortTs}${i}`).slice(-12);

  // name: 2~8자
  const name = (`k6u${i + 1}`).slice(0, 8);

  // phone: 010-XXXX-XXXX 형식
  const seq = String(i % 100000000).padStart(8, '0');
  const phone = `010-${seq.slice(0, 4)}-${seq.slice(4)}`;

  // birthDate: 만 15~30세 (2005년생 = 만 20~21세)
  const birthDate = '2005-01-01';

  const payload = JSON.stringify({
    name,
    nickname,
    phone,
    email,
    grade: 'SOPHOMORE',
    gender: 'MALE',
    provider: null,
    password: PASSWORD,
    birthDate,
  });

  const res = http.post(`${baseUrl}/api/user/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/user/register (setup)' },
  });

  if (res.status !== 200) {
    throw new Error(
      `register failed: status=${res.status} email=${email} body=${String(res.body).slice(0, 400)}`
    );
  }

  const token = extractAccessToken(res);
  if (!token) {
    throw new Error(`register succeeded but no accessToken in Set-Cookie. email=${email}`);
  }

  return token;
}

/**
 * 테스트 유저 1명을 자동 회원가입하고 accessToken을 반환한다.
 */
export function registerAndGetToken(baseUrl) {
  const token = doRegister(baseUrl, Date.now(), 0);
  console.log('setup: 자동 회원가입 완료, 토큰 발급됨');
  return token;
}

/**
 * count명만큼 자동 회원가입하여 토큰 배열을 반환한다.
 */
export function registerMultipleAndGetTokens(baseUrl, count) {
  const ts = Date.now();
  const tokens = [];

  console.log(`setup: 회원가입 ${count}건 진행`);
  for (let i = 0; i < count; i++) {
    tokens.push(doRegister(baseUrl, ts, i));
    if (i % 50 === 49) sleep(0.1);
  }

  console.log(`setup: 완료 tokens=${tokens.length}`);
  return tokens;
}

/**
 * accessToken 쿠키가 포함된 헤더 객체를 반환한다.
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Cookie: `accessToken=${token}`,
  };
}
