/**
 * 작은 HTTP 클라이언트 — Node 16 에는 전역 fetch 가 없다.
 * toxiproxy API 와 /actuator/health 호출에만 쓴다. JSON 을 주고받고, 타임아웃을 건다.
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * @param {number} [opts.timeoutMs] 이 요청의 마감. 넘기면 `timeout after <n>ms: ...` 로 거절한다.
 *   `plan.js` 가 이 문구로 "무응답(timeout)" 과 "연결 실패(unreachable)" 를 가르므로 바꾸지 않는다.
 */
function request(method, urlStr, body, { timeoutMs = 5000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    let settled = false;
    let timer = null;
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(arg);
    };

    const req = lib.request(u, {
      method,
      // 소켓을 재사용하지 않는다. 헬스 폴러는 5초마다 한 번 호출하므로 재사용 이득이
      // 없는 반면, 풀에 남은 소켓이 이전 요청의 타이머를 끌고 와 다음 요청을 1ms 만에
      // "timeout after 4000ms" 로 실패시킨다. redis-crash-2026-09-22T07-21-15 에서
      // 51개 표본 중 22개가 이 모양으로 실패했고, 실패 표본의 소요 시간은 0~2ms 였다.
      agent: false,
      headers: {
        ...(payload != null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { /* 본문이 JSON 이 아니다 */ }
        settle(resolve, { status: res.statusCode, text, json });
      });
      res.on('error', (e) => settle(reject, e));
    });

    req.on('error', (e) => settle(reject, e));

    // 소켓이 아니라 이 요청 하나에 거는 마감이다. 끝나면 settle 이 반드시 해제하므로
    // 다음 요청으로 타이머가 넘어가지 않는다.
    timer = setTimeout(() => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms: ${method} ${urlStr}`));
    }, timeoutMs);

    if (payload != null) req.write(payload);
    req.end();
  });
}

module.exports = { request };
