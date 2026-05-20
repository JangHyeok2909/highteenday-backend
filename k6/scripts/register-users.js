#!/usr/bin/env node

/**
 * k6 토큰 풀 관리 스크립트
 *
 * 모드:
 *   register — 신규 유저 등록 + 토큰 저장 (최초 1회)
 *   refresh  — 기존 tokens.json의 이메일로 재로그인 → 토큰 갱신 (테스트 전 매번)
 *
 * 사용법:
 *   node k6/scripts/register-users.js register --count 500
 *   node k6/scripts/register-users.js refresh
 *   node k6/scripts/register-users.js refresh --base-url http://localhost:8080
 *
 * 출력: k6/data/tokens.json = [{email, token}, ...]
 */

const fs = require('fs');
const path = require('path');

// ── CLI 인자 파싱 ──────────────────────────────────────────
const MODE = process.argv[2] || 'refresh';
const args = process.argv.slice(3);

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BASE_URL = getArg('--base-url', 'http://localhost:8080');
const COUNT = parseInt(getArg('--count', '500'), 10);
const PASSWORD = getArg('--password', 'K6LoadTest!1');
const OUTPUT = path.resolve(__dirname, '../data/tokens.json');
const DELAY_MS = 30;

// ── Set-Cookie에서 accessToken 추출 ────────────────────────
function extractAccessToken(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return null;
  const m = raw.match(/accessToken=([^;]+)/);
  return m ? m[1].trim() : null;
}

// ── 등록 ───────────────────────────────────────────────────
async function registerOne(i, ts) {
  const email = `k6_${ts}_${i}@loadtest.local`;
  const phoneNum = 10000000 + i;
  const phonePart1 = String(phoneNum).slice(0, 4);
  const phonePart2 = String(phoneNum).slice(4, 8);

  const now = new Date();
  const birthYear = now.getFullYear() - 18;
  const birthDate = `${birthYear}-01-15`;

  const nickname = (`k6${ts}${i}`).slice(-12);
  const name = (`k6u${i}`).slice(0, 10);

  const payload = {
    name,
    nickname,
    phone: `010-${phonePart1}-${phonePart2}`,
    email,
    grade: 'SOPHOMORE',
    gender: 'MALE',
    provider: null,
    password: PASSWORD,
    birthDate,
  };

  const res = await fetch(`${BASE_URL}/api/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    throw new Error(`register failed i=${i} status=${res.status} email=${email} body=${body.slice(0, 400)}`);
  }

  const token = extractAccessToken(res.headers);
  if (!token) {
    throw new Error(`no accessToken in Set-Cookie for i=${i} email=${email}`);
  }

  return { email, token };
}

// ── 로그인 ─────────────────────────────────────────────────
async function loginOne(email) {
  const res = await fetch(`${BASE_URL}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    throw new Error(`login failed status=${res.status} email=${email} body=${body.slice(0, 400)}`);
  }

  const token = extractAccessToken(res.headers);
  if (!token) {
    throw new Error(`no accessToken in Set-Cookie for email=${email}`);
  }

  return token;
}

// ── register 모드 ──────────────────────────────────────────
async function doRegister() {
  console.log(`[register] BASE_URL: ${BASE_URL}`);
  console.log(`[register] Registering ${COUNT} users...`);

  const ts = Date.now();
  const pool = [];

  for (let i = 0; i < COUNT; i++) {
    const result = await registerOne(i, ts);
    pool.push(result);

    if ((i + 1) % 50 === 0) {
      console.log(`[register] ${i + 1}/${COUNT}`);
    }

    if (DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(pool, null, 2));
  console.log(`[register] Done! ${pool.length} tokens saved to ${OUTPUT}`);
}

// ── refresh 모드 ───────────────────────────────────────────
async function doRefresh() {
  if (!fs.existsSync(OUTPUT)) {
    console.error(`[refresh] ${OUTPUT} not found. Run 'register' first.`);
    process.exit(1);
  }

  const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
  console.log(`[refresh] BASE_URL: ${BASE_URL}`);
  console.log(`[refresh] Refreshing ${existing.length} tokens...`);

  const pool = [];
  let failed = 0;

  for (let i = 0; i < existing.length; i++) {
    try {
      const token = await loginOne(existing[i].email);
      pool.push({ email: existing[i].email, token });
    } catch (err) {
      failed++;
      if (failed <= 3) {
        console.warn(`[refresh] ${err.message}`);
      }
      if (failed === 4) {
        console.warn(`[refresh] suppressing further error logs...`);
      }

      // 처음 5명 연속 실패 → DB에 유저 없음 → 자동 재등록
      if (failed >= 5 && pool.length === 0) {
        console.warn('[refresh] Users not found in DB. Auto-switching to register...');
        return doRegister();
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`[refresh] ${i + 1}/${existing.length} (failed: ${failed})`);
    }

    if (DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (pool.length === 0) {
    console.warn('[refresh] All logins failed. Auto-switching to register...');
    return doRegister();
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(pool, null, 2));
  console.log(`[refresh] Done! ${pool.length} tokens refreshed (${failed} failed) → ${OUTPUT}`);
}

// ── 메인 ───────────────────────────────────────────────────
async function main() {
  switch (MODE) {
    case 'register':
      await doRegister();
      break;
    case 'refresh':
      await doRefresh();
      break;
    default:
      console.error(`Unknown mode: ${MODE}. Use 'register' or 'refresh'.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[${MODE}] FATAL: ${err.message}`);
  process.exit(1);
});
