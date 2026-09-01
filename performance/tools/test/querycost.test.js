'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const querycost = require('../lib/querycost');

/**
 * 여기서 고정하는 계약은 **"알 수 있는 것 이상을 말하지 않는다"** 이다.
 *
 * 요청당 쿼리 수의 분포는 SLO 버킷(1·2·5·10·20·50·100·200·500·1000·5000)으로만 관측된다.
 * Prometheus 의 histogram_quantile 은 버킷 사이를 선형 보간해 137.4 같은 값을 내는데,
 * 쿼리 수는 정수이고 그 값은 실제로 관측된 적이 없다. 보간된 숫자는 정밀해 보여서
 * 오히려 잘못된 확신을 준다 — 그래서 구간으로 돌려준다.
 */

/** 누적 히스토그램 버킷을 만든다. Prometheus 의 `_bucket` 시계열과 같은 모양(누적)이다. */
function buckets(pairs) {
  return pairs.map(([le, count]) => ({ le, count }));
}

test('분위수가 걸린 버킷 구간을 그대로 돌려준다', () => {
  // 100건 중 90건이 5 이하, 나머지 10건이 5~10 구간.
  const b = buckets([[1, 0], [2, 0], [5, 90], [10, 100], [Infinity, 100]]);
  const p95 = querycost.quantileBucket(b, 0.95);
  assert.deepEqual(p95, { atMost: 10, moreThan: 5 },
    'p95(=95번째 건)는 5 초과 10 이하 구간에 있다');
});

test('첫 버킷에 걸리면 하한을 말하지 않는다', () => {
  const b = buckets([[1, 100], [2, 100], [Infinity, 100]]);
  assert.deepEqual(querycost.quantileBucket(b, 0.95), { atMost: 1, moreThan: null });
});

test('마지막 경계를 넘으면 상한 대신 "초과"로 표현한다', () => {
  // 100건 중 96건이 5000 이하, 4건이 그 위(+Inf 버킷).
  const b = buckets([[5, 10], [5000, 96], [Infinity, 100]]);
  const p99 = querycost.quantileBucket(b, 0.99);
  assert.equal(p99.atMost, null, '+Inf 버킷은 상한이 없다 — 임의의 숫자를 만들지 않는다');
  assert.equal(p99.moreThan, 5000);
});

test('표본이 없으면 분위수를 만들지 않는다', () => {
  assert.equal(querycost.quantileBucket([], 0.95), null);
  assert.equal(querycost.quantileBucket(buckets([[1, 0], [Infinity, 0]]), 0.95), null);
});

test('엔드포인트 키는 method 와 uri 템플릿으로 만든다', () => {
  // 실제 경로가 아니라 템플릿이어야 게시물 ID 마다 시계열이 생기지 않는다.
  assert.equal(querycost.endpointKey({ method: 'GET', uri: '/api/posts/{id}/comments' }),
    'GET /api/posts/{id}/comments');
  assert.equal(querycost.endpointKey({}), '? ?');
});

test('버킷 경계 선언이 앱의 QueryCountFilter 와 일치한다', () => {
  // 이 값이 어긋나면 분위수가 조용히 틀린 구간을 가리킨다. 앱 소스의
  // QUERY_COUNT_BUCKETS 를 바꾸면 여기도 같이 바꿔야 한다는 것을 이 테스트가 알린다.
  assert.deepEqual(querycost.QUERY_COUNT_BUCKETS, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000]);
});

test('요청당 쿼리 임계는 전역 지표와 같은 잣대를 쓴다', () => {
  // report.js 의 EFFICIENCY_THRESHOLDS['efficiency.queriesPerReq'] 와 같아야 한다.
  // 전역 값과 엔드포인트별 값에 다른 기준을 대면 두 표를 나란히 읽을 수 없다.
  assert.deepEqual(querycost.PER_REQUEST_THRESHOLD, { warn: 10, fail: 50 });
});

/**
 * 수집 자체는 Prometheus 응답을 대역으로 넣어 검증한다. 여기서 확인하는 것은
 * **재지 못했을 때 그 사실이 드러나는가** 이다. 빈 표가 "문제 없음"으로 읽히면
 * 이 계측을 만든 이유가 사라진다.
 */
test('시계열이 없으면 available:false 와 사유를 남긴다', async () => {
  const fakeProm = { series: async () => [], instant: async () => null };
  const win = { to: new Date(), durationSec: 300 };
  const r = await querycost.collect(fakeProm, win);
  assert.equal(r.available, false);
  assert.match(r.reason, /QueryCountFilter/, '왜 없는지를 말해야 한다 — "없음"만으로는 조치할 수 없다');
  assert.deepEqual(r.endpoints, []);
});

test('엔드포인트별 값을 요청 수 상위로 정렬해 싣는다', async () => {
  const S = (uri, method, value) => ({ labels: { uri, method }, value });
  const fakeProm = {
    async series(q) {
      if (/http_server_queries_count/.test(q) && !/_sum/.test(q)) {
        return [S('/a', 'GET', 10), S('/b', 'GET', 100)];
      }
      if (/http_server_queries_sum/.test(q)) return [S('/a', 'GET', 300), S('/b', 'GET', 3)];
      if (/http_server_requests_seconds/.test(q)) return [S('/a', 'GET', 200), S('/b', 'GET', 10)];
      if (/query_time_seconds_sum/.test(q) && /clamp_min/.test(q)) {
        return [S('/a', 'GET', 50), S('/b', 'GET', 2)];
      }
      if (/query_time_seconds_sum/.test(q)) return [S('/a', 'GET', 500), S('/b', 'GET', 200)];
      if (/_bucket/.test(q)) return [];
      return [];
    },
    async instant() { return 1234; },
  };
  const r = await querycost.collect(fakeProm, { to: new Date(), durationSec: 300 });

  assert.equal(r.available, true);
  assert.equal(r.endpoints[0].endpoint, 'GET /b', '요청 수 상위가 먼저 온다');
  assert.equal(r.endpoints[1].endpoint, 'GET /a');
  assert.equal(r.endpoints[1].queriesPerRequest, 300, '요청당 쿼리 수는 sum/count 조회 결과 그대로다');
  assert.equal(r.outsideRequestStatements, 1234, '요청 밖 문장 수는 검산에 쓰인다');
  // 귀속 합계 = 경로별(요청당 쿼리 × 요청 수)의 합
  assert.equal(r.attributedStatements, 300 * 10 + 3 * 100);
});

test('DB 몫은 응답 시간 대비 DB 시간의 비율이다', async () => {
  // 이 값 하나가 "원인이 DB 안인가 밖인가"를 가른다. 쿼리를 200개 쓰더라도 DB 몫이
  // 낮으면 쿼리를 줄여도 응답 시간은 거의 안 변한다.
  const S = (uri, method, value) => ({ labels: { uri, method }, value });
  const fakeProm = {
    async series(q) {
      if (/http_server_queries_count/.test(q) && !/_sum/.test(q)) return [S('/a', 'GET', 10)];
      // 나눗셈은 Prometheus 가 한다 — 여기 값은 이미 "요청당" 이다.
      if (/http_server_queries_sum/.test(q)) return [S('/a', 'GET', 200)];
      if (/http_server_requests_seconds/.test(q)) return [S('/a', 'GET', 400)];
      if (/query_time_seconds_sum/.test(q) && /clamp_min/.test(q)) return [S('/a', 'GET', 40)];
      return [];
    },
    async instant() { return 0; },
  };
  const r = await querycost.collect(fakeProm, { to: new Date(), durationSec: 300 });
  const e = r.endpoints[0];
  assert.equal(e.queriesPerRequest, 200, '요청당 200 쿼리 — 그것만 보면 N+1 로 읽힌다');
  assert.equal(e.responseMsPerRequest, 400);
  assert.equal(e.dbSharePct, 10, '그런데 응답 400ms 중 DB 는 40ms — 원인은 DB 바깥이다');
});

test('응답 시간을 못 읽으면 DB 몫을 만들어내지 않는다', async () => {
  const S = (uri, method, value) => ({ labels: { uri, method }, value });
  const fakeProm = {
    async series(q) {
      if (/http_server_queries_count/.test(q) && !/_sum/.test(q)) return [S('/a', 'GET', 10)];
      if (/query_time_seconds_sum/.test(q) && /clamp_min/.test(q)) return [S('/a', 'GET', 40)];
      return [];
    },
    async instant() { return 0; },
  };
  const r = await querycost.collect(fakeProm, { to: new Date(), durationSec: 300 });
  assert.equal(r.endpoints[0].dbSharePct, null, '분모가 없으면 비율도 없다 — 0% 로 채우면 "DB 무관"으로 오독된다');
});

test('측정 구간에 안 불린 경로는 표에서 뺀다', async () => {
  const fakeProm = {
    async series(q) {
      if (/http_server_queries_count/.test(q) && !/_sum/.test(q)) {
        return [{ labels: { uri: '/idle', method: 'GET' }, value: 0 }];
      }
      return [];
    },
    async instant() { return null; },
  };
  const r = await querycost.collect(fakeProm, { to: new Date(), durationSec: 300 });
  assert.deepEqual(r.endpoints, [], '0 으로 나눈 평균이 표를 채우면 실제 부하 경로가 묻힌다');
});
