/**
 * 작은 HTTP 클라이언트 — Node 16 에는 전역 fetch 가 없다.
 * toxiproxy API 와 /actuator/health 호출에만 쓴다. JSON 을 주고받고, 타임아웃을 건다.
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

function request(method, urlStr, body, { timeoutMs = 5000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = lib.request(u, {
      method,
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
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms: ${method} ${urlStr}`)));
    if (payload != null) req.write(payload);
    req.end();
  });
}

module.exports = { request };
