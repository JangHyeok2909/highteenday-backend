/**
 * Prometheus HTTP API 클라이언트 (의존성 0 — Node 16 내장 http/https만 사용).
 *
 * 설계 메모
 * ---------
 * 1) 왜 fetch가 아닌가
 *    이 저장소의 Node는 v16이다. 전역 fetch는 v18부터라 여기서는 없다.
 *    성능 도구가 Node 버전 때문에 안 도는 건 최악이므로 내장 http로 직접 짠다.
 *
 * 2) 왜 query_range가 아니라 instant + *_over_time 인가
 *    "테스트 20분 구간의 CPU 평균"을 구할 때 두 가지 방법이 있다.
 *      (a) query_range로 240개 점을 받아 클라이언트에서 평균 → 전송량 크고, 결측 처리
 *          로직을 우리가 또 짜야 하고, step 정렬 때문에 미묘하게 값이 틀어진다.
 *      (b) instant query 하나로 avg_over_time(x[20m]) @ end → 서버가 정확히 계산한 값 1개.
 *    (b)가 정확하고 싸다. 트렌드 스파크라인처럼 "모양"이 필요할 때만 (a)를 쓴다.
 *
 * 3) 왜 재시도가 필요한가
 *    부하 테스트 직후 Prometheus는 스크레이프/압축으로 바쁘다. 일시적 5xx나 타임아웃에
 *    파이프라인 전체가 죽으면 20분짜리 테스트 결과를 통째로 잃는다. 지수 백오프로 재시도하고,
 *    끝내 실패하면 그 지표만 null로 남기고 나머지는 살린다(부분 실패 허용).
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_URL = process.env.PROM_URL || 'http://localhost:9090';

/** Prometheus가 받아들이는 range selector 문자열로 변환 (예: 1620 → "1620s") */
function toRangeSelector(seconds) {
  const s = Math.max(1, Math.round(seconds));
  return `${s}s`;
}

function request(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          // Prometheus는 4xx 본문에 사유를 담아준다 — PromQL 오타 디버깅에 필수라 같이 던진다.
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON 파싱 실패: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`타임아웃 ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PromClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl   Prometheus 주소 (기본 http://localhost:9090)
   * @param {number} opts.timeoutMs 단일 요청 타임아웃
   * @param {number} opts.retries   실패 시 재시도 횟수
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || DEFAULT_URL).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs || 15000;
    this.retries = opts.retries != null ? opts.retries : 3;
    this.debug = !!opts.debug;
    this.stats = { queries: 0, failures: 0 };
  }

  async _call(path, params) {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${path}?${qs}`;
    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        this.stats.queries++;
        const json = await request(url, this.timeoutMs);
        if (json.status !== 'success') {
          throw new Error(`Prometheus error: ${json.error || JSON.stringify(json).slice(0, 200)}`);
        }
        return json.data;
      } catch (e) {
        lastErr = e;
        if (attempt < this.retries) {
          // 200ms → 400ms → 800ms. 부하 테스트 직후 일시적 과부하를 넘기기에 충분한 정도.
          await sleep(200 * Math.pow(2, attempt));
        }
      }
    }
    this.stats.failures++;
    if (this.debug) console.error(`  [promql] 실패: ${params.query} — ${lastErr.message}`);
    throw lastErr;
  }

  /** Prometheus가 살아있고 쿼리를 받는지 확인 */
  async ping() {
    try {
      await this._call('/api/v1/query', { query: 'up', time: Math.floor(Date.now() / 1000) });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * instant query — 특정 시각의 스칼라 값 하나를 얻는다.
   * 여러 시계열이 반환되면 reduce 규칙(sum/max/first)으로 하나로 접는다.
   *
   * @param {string} query PromQL
   * @param {Date}   at    평가 시각
   * @param {'sum'|'max'|'min'|'first'} reduce 다중 시계열 축약 방식
   * @returns {number|null} 값 (결측/NaN이면 null)
   */
  async instant(query, at, reduce = 'first') {
    const data = await this._call('/api/v1/query', {
      query,
      time: Math.floor(at.getTime() / 1000),
    });
    const result = data.result || [];
    if (result.length === 0) return null;

    const nums = result
      .map((r) => Number(r.value && r.value[1]))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;

    switch (reduce) {
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'max': return Math.max(...nums);
      case 'min': return Math.min(...nums);
      default: return nums[0];
    }
  }

  /**
   * range query — 시계열 "모양"이 필요할 때만 사용 (리포트 스파크라인).
   * @returns {Array<{t:number, v:number}>} 초 단위 타임스탬프 + 값
   */
  async range(query, from, to, stepSec) {
    const data = await this._call('/api/v1/query_range', {
      query,
      start: Math.floor(from.getTime() / 1000),
      end: Math.floor(to.getTime() / 1000),
      step: Math.max(1, Math.round(stepSec)),
    });
    const series = (data.result || [])[0];
    if (!series) return [];
    return series.values
      .map(([t, v]) => ({ t: Number(t), v: Number(v) }))
      .filter((p) => Number.isFinite(p.v));
  }

  /**
   * 지표 카탈로그 한 항목을 실행한다.
   *
   * 카탈로그 항목은 PromQL 안에 `$RANGE` 토큰을 쓴다. 이걸 실제 테스트 구간 길이로
   * 치환하기 때문에, 같은 정의가 3분짜리 스모크 테스트에도 60분짜리 soak에도 그대로 맞는다.
   * (구간 길이를 하드코딩하면 시나리오마다 카탈로그를 복제해야 한다.)
   */
  async evalSpec(spec, window) {
    const q = spec.query.replace(/\$RANGE/g, toRangeSelector(window.durationSec));
    const raw = await this.instant(q, window.to, spec.reduce || 'first');
    if (raw == null) return null;
    const scaled = spec.scale ? raw * spec.scale : raw;
    return Number.isFinite(scaled) ? scaled : null;
  }
}

module.exports = { PromClient, toRangeSelector };
