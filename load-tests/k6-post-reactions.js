/**
 * k6 — 게시글 반응 동시성 + 정합성 자동 검증
 *
 * 토큰: setup()에서 VU 수만큼 자동 회원가입 → VU마다 서로 다른 토큰(1:1)
 *
 * 실행
 *   k6 run load-tests/k6-post-reactions.js
 *   VUS=50 POST_ID=1 k6 run load-tests/k6-post-reactions.js
 *
 * 환경변수 (선택)
 *   BASE_URL, POST_ID, MODE(like|dislike|mixed), VUS 또는 USER_COUNT (기본 100)
 *
 * 백엔드: GET /api/posts/{id}/consistency (drift 시 teardown 실패)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { registerMultipleAndGetTokens, authHeaders } from './helpers/auth.js';

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

export function setup() {
  const tokens = registerMultipleAndGetTokens(BASE_URL, VUS);
  return { tokens, baseUrl: BASE_URL };
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
