/**
 * 인증 토큰 관리
 * - setup()에서 로그인 시도 → 실패 시 자동 등록
 * - VU별 토큰 할당 (라운드로빈)
 */

import http from 'k6/http';
import { sleep } from 'k6';

/**
 * Set-Cookie 헤더에서 accessToken 추출
 */
export function extractAccessToken(res) {
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  if (!raw) return null;
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

/**
 * 로그인 시도 → accessToken 반환
 */
function loginOne(baseUrl, email, password) {
  const res = http.post(`${baseUrl}/api/user/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/user/login' },
  });

  if (res.status !== 200) return null;
  return extractAccessToken(res);
}

/**
 * 신규 등록 → accessToken 반환
 */
function registerOne(baseUrl, i, ts, password) {
  const email = `k6_${ts}_${i}@loadtest.local`;
  const phoneNum = 10000000 + i;
  const phonePart1 = String(phoneNum).slice(0, 4);
  const phonePart2 = String(phoneNum).slice(4, 8);

  const now = new Date();
  const birthYear = now.getFullYear() - 18;
  const birthDate = `${birthYear}-01-15`;

  const payload = JSON.stringify({
    name: name10(i),
    nickname: nickname12(ts, i),
    phone: `010-${phonePart1}-${phonePart2}`,
    email,
    grade: 'SOPHOMORE',
    gender: 'MALE',
    provider: null,
    password,
    birthDate,
  });

  const res = http.post(`${baseUrl}/api/user/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/user/register' },
  });

  if (res.status !== 200) {
    return { ok: false, email, status: res.status, detail: String(res.body || '').slice(0, 400) };
  }

  const token = extractAccessToken(res);
  if (!token) {
    return { ok: false, email, status: res.status, detail: 'no accessToken in Set-Cookie' };
  }

  return { ok: true, email, token };
}

/**
 * 토큰 풀 생성: 로그인 우선, 실패 시 신규 등록
 */
export function setupTokenPool(baseUrl, count, password) {
  const ts = Date.now();
  const pool = [];

  // 기존 유저 로그인 시도 (첫 3명)
  let loginOk = 0;
  for (let i = 0; i < Math.min(3, count); i++) {
    const email = `k6_load_${i}@loadtest.local`;
    const token = loginOne(baseUrl, email, password);
    if (token) {
      pool.push({ email, token });
      loginOk++;
    }
  }

  if (loginOk > 0) {
    // 기존 유저가 DB에 있음 → 나머지도 로그인
    console.log(`[auth] Existing users found. Logging in ${count} users...`);
    // 이미 로그인한 3명 외 나머지
    for (let i = 3; i < count; i++) {
      const email = `k6_load_${i}@loadtest.local`;
      const token = loginOne(baseUrl, email, password);
      if (token) {
        pool.push({ email, token });
      }
      if ((i + 1) % 100 === 0) console.log(`[auth] Login ${i + 1}/${count}`);
      sleep(0.02);
    }

    if (pool.length >= count * 0.8) {
      console.log(`[auth] Token pool ready: ${pool.length} users (login)`);
      return pool;
    }

    // 로그인 성공률이 낮으면 재등록
    console.warn(`[auth] Only ${pool.length}/${count} logins succeeded. Re-registering...`);
    pool.length = 0;
  }

  // 신규 등록
  console.log(`[auth] Registering ${count} new users...`);
  for (let i = 0; i < count; i++) {
    // 고정 이메일 패턴 (재로그인 가능하도록)
    const email = `k6_load_${i}@loadtest.local`;
    const phoneNum = 10000000 + i;
    const phonePart1 = String(phoneNum).slice(0, 4);
    const phonePart2 = String(phoneNum).slice(4, 8);

    const now = new Date();
    const birthYear = now.getFullYear() - 18;
    const birthDate = `${birthYear}-01-15`;

    const payload = JSON.stringify({
      name: name10(i),
      nickname: nickname12(ts, i),
      phone: `010-${phonePart1}-${phonePart2}`,
      email,
      grade: 'SOPHOMORE',
      gender: 'MALE',
      provider: null,
      password,
      birthDate,
    });

    const res = http.post(`${baseUrl}/api/user/register`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/user/register' },
    });

    if (res.status === 200) {
      const token = extractAccessToken(res);
      if (token) {
        pool.push({ email, token });
      }
    } else {
      // 이미 존재하면 로그인 시도
      const token = loginOne(baseUrl, email, password);
      if (token) {
        pool.push({ email, token });
      } else {
        console.warn(`[auth] Failed i=${i} email=${email} status=${res.status}`);
      }
    }

    if ((i + 1) % 50 === 0) console.log(`[auth] ${i + 1}/${count}`);
    sleep(0.02);
  }

  if (pool.length === 0) {
    throw new Error('[auth] No tokens obtained. Check server connectivity.');
  }

  console.log(`[auth] Token pool ready: ${pool.length} users`);
  return pool;
}

/**
 * VU 인덱스로 토큰 가져오기
 */
export function getToken(pool, vuIndex) {
  return pool[vuIndex % pool.length].token;
}

/**
 * VU 인덱스로 사용자 정보 가져오기
 */
export function getUser(pool, vuIndex) {
  return pool[vuIndex % pool.length];
}

/**
 * 인증 쿠키 헤더 생성
 */
export function authCookie(token) {
  return { Cookie: `accessToken=${token}` };
}
