'use strict';
/**
 * querycost — **어느 엔드포인트가 요청 하나에 쿼리를 몇 개 쓰는가**.
 *
 * 왜 필요한가 — 전역 평균은 귀속을 못 한다
 * ----------------------------------------
 * 지금까지 이 질문에 답하던 값은 `efficiency.queriesPerReq` 하나였다. 정의는 이렇다.
 *
 *     increase(mysql_global_status_queries[측정구간]) / 전체 HTTP 요청 수
 *
 * 분자는 **MySQL 서버가 처리한 모든 문장**이다 — 28개 엔드포인트 전부, `COMMIT`,
 * `SET autocommit`, 커넥션 검증, 스케줄러 배치, mysqld-exporter 의 수집 문장까지.
 * 분모는 comment_list 만이 아니라 전체 요청 수다. 즉 이 값은 **워크로드 전체의 평균**이지
 * 특정 경로의 비용이 아니다.
 *
 * 그런데 리포트는 이 값 하나를 "요청당 쿼리 수"라는 이름으로 보여주고 병목 가설 1순위로
 * 올렸다("요청 1건당 평균 205.6개 쿼리가 실행됐다. N+1 패턴 가능성이 높다"). 그 결과 실제
 * 조사에서 그 숫자가 **가장 느린 엔드포인트의 값으로 읽혔고**, 존재하지 않을 수도 있는
 * N+1 을 특정 API 에 귀속시킨 가설이 세워졌다. 전역 평균을 개별 경로에 귀속시킬 근거는
 * 어디에도 없다.
 *
 * 무엇으로 답하는가
 * -----------------
 * 앱이 이미 엔드포인트별로 내보내고 있다. `QueryCountFilter`(src/main/java/.../metrics/)가
 * 요청 경계에서 두 지표를 기록한다.
 *
 *   http.server.queries      요청 하나가 실행한 문장 수의 **분포** (uri·method 태그)
 *   http.server.query.time   요청 하나가 DB 에 쓴 시간            (uri·method 태그)
 *
 * `uri` 는 실제 경로가 아니라 URI 템플릿(`/api/posts/{id}/comments`)이다. 게시물 ID 마다
 * 시계열이 생기는 것을 막고, Micrometer 의 `http.server.requests` 와 같은 라벨이라
 * PromQL 에서 조인할 수 있다.
 *
 * 필터는 시큐리티 체인보다 바깥에 있어서 인증 필터의 토큰 조회와, open-in-view 때문에
 * 응답 직렬화 중에 풀리는 지연 로딩 SELECT 까지 요청 비용에 포함한다. 즉 "그 요청이 DB 에
 * 지운 실제 부하"다.
 *
 * 왜 평균과 함께 꼬리를 내는가
 * ----------------------------
 * 댓글이 수천 개인 게시물처럼 파라미터에 따라 비용이 극단적으로 갈리는 엔드포인트는
 * 평균이 꼬리를 완전히 가린다. 실제로 호출 수와 총 읽은 행의 상관이 r = 0.11 이었고,
 * 호출당 평균 비용을 곱한 추정치는 실측의 3배였다(E-51). 그래서 `DistributionSummary` 의
 * SLO 버킷(1·2·5·10·20·50·100·200·500·1000·5000)에서 분위수를 근사해 함께 싣는다.
 *
 * 버킷 근사의 한계는 그대로 밝힌다 — 값은 **버킷 경계로만** 나온다. p95 가 "200~500"
 * 구간이면 그 사실을 적지 임의로 350 이라고 쓰지 않는다.
 *
 * 검산 항목
 * ---------
 * `db.queries.outside.request` 는 요청 밖에서 나간 문장 수다(스케줄러·커넥션 검증·액추에이터).
 * 엔드포인트별 합계 + 이 값 ≈ MySQL 이 스스로 센 문장 수여야 계측을 신뢰할 수 있다.
 * 이 값이 없으면 "엔드포인트 합계가 전역 수치보다 훨씬 작다"가 계측 누락인지 원래 그런
 * 것인지 구분되지 않는다.
 */

const { toRangeSelector } = require('./promql');

/** `serviceLevelObjectives` 로 선언된 버킷 경계. QueryCountFilter 의 QUERY_COUNT_BUCKETS 와 같아야 한다. */
const QUERY_COUNT_BUCKETS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];

/** 리포트에 싣는 엔드포인트 수. 요청 수 상위부터 자른다 — 안 불린 경로는 병목이 아니다. */
const TOP_ENDPOINTS = 20;

/**
 * 요청당 쿼리 수가 이 값을 넘으면 표에서 강조한다.
 *
 * 목록 조회 하나는 보통 한 자릿수 쿼리로 끝난다. 10 을 넘으면 의심, 50 을 넘으면 루프 안
 * 조회가 거의 확실하다. `report.js` 의 EFFICIENCY_THRESHOLDS 와 같은 기준을 쓴다 —
 * 전역 값과 엔드포인트별 값에 서로 다른 잣대를 대면 두 표를 나란히 읽을 수 없다.
 */
const PER_REQUEST_THRESHOLD = { warn: 10, fail: 50 };

const Q = {
  // 요청 수. `_count` 는 필터가 지표를 기록한 횟수이므로 곧 그 엔드포인트의 요청 수다.
  requests: 'increase(http_server_queries_count[$RANGE])',
  // 요청당 평균 문장 수 = 총 문장 수 / 요청 수.
  perRequest:
    'increase(http_server_queries_sum[$RANGE]) / clamp_min(increase(http_server_queries_count[$RANGE]), 1)',
  // 요청당 평균 DB 시간(ms). Timer 는 초 단위라 1000 을 곱한다.
  dbMsPerRequest:
    '1000 * increase(http_server_query_time_seconds_sum[$RANGE]) / clamp_min(increase(http_server_query_time_seconds_count[$RANGE]), 1)',
  // 구간 전체의 DB 시간 합(ms). 어느 엔드포인트가 DB 시간을 실제로 많이 썼는지는 평균이
  // 아니라 이 값이 답한다 — 평균이 커도 호출이 드물면 총량은 작다.
  dbMsTotal: '1000 * increase(http_server_query_time_seconds_sum[$RANGE])',
  // 누적 히스토그램 버킷. 꼬리 분위수를 여기서 근사한다.
  buckets: 'increase(http_server_queries_bucket[$RANGE])',
  // 요청에 귀속되지 않은 문장 수 — 검산용.
  outside: 'sum(increase(db_queries_outside_request_total[$RANGE]))',
  //
  // 같은 경로의 **응답 시간** 평균(ms). 이 값이 있어야 "DB 시간이 응답 시간의 몇 %인가"를
  // 계산할 수 있고, 그게 곧 **원인이 DB 안에 있는가 밖에 있는가**에 대한 답이다.
  //
  // 이게 없으면 리포트를 읽는 사람은 두 표를 눈으로 맞춰야 한다 — k6 Breakdown 은
  // `comment_list` 같은 시나리오 이름을 쓰고 이 표는 URI 템플릿을 쓰기 때문에 그 대조가
  // 애초에 정확할 수 없다. `http.server.requests` 는 `QueryCountFilter` 와 **같은 uri·method
  // 라벨**을 쓰므로(필터가 BEST_MATCHING_PATTERN 을 태그로 쓰는 이유가 이것이다) 정확히
  // 조인된다.
  //
  // `sum by (method, uri)` 로 접는 이유: `http_server_requests_seconds` 에는 status·outcome·
  // exception 라벨이 더 붙어 있어 한 경로가 여러 시계열로 쪼개진다. 접지 않으면 200 응답과
  // 500 응답이 별도 행으로 표에 뜬다.
  responseMs:
    '1000 * sum by (method, uri) (increase(http_server_requests_seconds_sum[$RANGE]))'
    + ' / clamp_min(sum by (method, uri) (increase(http_server_requests_seconds_count[$RANGE])), 1)',
};

/** `GET /api/posts/{id}/comments` 형태의 표시용 키. */
function endpointKey(labels) {
  return `${labels.method || '?'} ${labels.uri || '?'}`;
}

/**
 * 누적 버킷에서 분위수를 근사한다.
 *
 * Prometheus 의 `histogram_quantile` 은 버킷 사이를 선형 보간하는데, 그러면 실제로 관측될
 * 수 없는 값이 나온다(쿼리 수는 정수인데 137.4 같은 값이 찍힌다). 여기서는 보간하지 않고
 * **분위수가 걸린 버킷 구간을 그대로 돌려준다.** 알 수 있는 것 이상을 말하지 않기 위해서다.
 *
 * @param {Array<{le:number, count:number}>} buckets 누적 버킷(le 오름차순)
 * @param {number} q 0~1
 * @returns {{atMost:number|null, moreThan:number|null}|null}
 *   atMost   — 분위수가 이 값 이하다. +Inf 버킷에 걸리면 null(경계를 넘었다는 뜻)
 *   moreThan — 바로 아래 버킷 경계. 첫 버킷이면 null
 */
function quantileBucket(buckets, q) {
  if (!buckets.length) return null;
  const total = buckets[buckets.length - 1].count;
  if (!(total > 0)) return null;
  const target = q * total;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count >= target) {
      return {
        atMost: Number.isFinite(buckets[i].le) ? buckets[i].le : null,
        moreThan: i > 0 ? buckets[i - 1].le : null,
      };
    }
  }
  return null;
}

/** 라벨 보존 조회 하나를 실행해 `엔드포인트 키 → 값` 맵으로 만든다. */
async function seriesMap(prom, query, window, onError) {
  const q = query.replace(/\$RANGE/g, toRangeSelector(window.durationSec));
  try {
    const rows = await prom.series(q, window.to);
    const map = new Map();
    for (const r of rows) {
      // uri 라벨이 없는 시계열은 이 지표가 아니다. 조용히 섞이면 표에 정체불명의 행이 뜬다.
      if (!r.labels.uri) continue;
      map.set(endpointKey(r.labels), r.value);
    }
    return map;
  } catch (e) {
    onError(e);
    return new Map();
  }
}

/**
 * 측정 구간의 엔드포인트별 쿼리 비용을 수집한다.
 *
 * 실패는 실행 전체를 죽이지 않는다. 앱 이미지에 `QueryCountFilter` 가 없으면 시계열 자체가
 * 존재하지 않는데, 그건 오류가 아니라 **사실**이다. 그 경우 `available:false` 와 사유를
 * 남겨 리포트가 "재지 않았다"고 말할 수 있게 한다 — 빈 표를 "문제 없음"으로 읽히게 두는
 * 것이 가장 나쁘다.
 */
async function collect(prom, window) {
  const errors = [];
  const onError = (e) => errors.push(String(e.message || e).slice(0, 200));

  const [requests, perRequest, dbMsPerRequest, dbMsTotal, responseMs] = await Promise.all([
    seriesMap(prom, Q.requests, window, onError),
    seriesMap(prom, Q.perRequest, window, onError),
    seriesMap(prom, Q.dbMsPerRequest, window, onError),
    seriesMap(prom, Q.dbMsTotal, window, onError),
    seriesMap(prom, Q.responseMs, window, onError),
  ]);

  // 버킷은 엔드포인트마다 여러 시계열(le 별)이라 따로 모은다.
  const bucketsByEndpoint = new Map();
  try {
    const q = Q.buckets.replace(/\$RANGE/g, toRangeSelector(window.durationSec));
    for (const r of await prom.series(q, window.to)) {
      if (!r.labels.uri || r.labels.le == null) continue;
      const key = endpointKey(r.labels);
      if (!bucketsByEndpoint.has(key)) bucketsByEndpoint.set(key, []);
      bucketsByEndpoint.get(key).push({ le: Number(r.labels.le), count: r.value });
    }
  } catch (e) {
    onError(e);
  }

  let outsideRequest = null;
  try {
    const q = Q.outside.replace(/\$RANGE/g, toRangeSelector(window.durationSec));
    outsideRequest = await prom.instant(q, window.to, 'sum');
  } catch (e) {
    onError(e);
  }

  const endpoints = [];
  for (const [key, reqCount] of requests) {
    // 측정 구간에 한 번도 안 불린 엔드포인트는 싣지 않는다. 0 으로 나눈 평균이 표를 채우면
    // 실제로 부하를 받은 경로가 그 사이에 묻힌다.
    if (!(reqCount > 0)) continue;
    const raw = (bucketsByEndpoint.get(key) || []).sort((a, b) => a.le - b.le);
    const dbMs = dbMsPerRequest.get(key);
    const respMs = responseMs.get(key);
    endpoints.push({
      endpoint: key,
      requests: reqCount,
      queriesPerRequest: perRequest.get(key) != null ? perRequest.get(key) : null,
      dbMsPerRequest: dbMs != null ? dbMs : null,
      dbMsTotal: dbMsTotal.get(key) != null ? dbMsTotal.get(key) : null,
      responseMsPerRequest: respMs != null ? respMs : null,
      // **원인이 DB 안인가 밖인가.** 이 값이 작으면 쿼리를 아무리 줄여도 응답 시간은
      // 거의 안 변한다 — 남은 시간은 왕복·결과 매핑·직렬화·CPU 대기에 있다.
      // 응답 시간이 0 에 가까우면(측정 구간에 사실상 안 불린 경로) 비율을 내지 않는다.
      dbSharePct: dbMs != null && respMs != null && respMs > 0
        ? +((100 * dbMs) / respMs).toFixed(1)
        : null,
      queriesP95: quantileBucket(raw, 0.95),
      queriesP99: quantileBucket(raw, 0.99),
    });
  }
  // 요청 수 상위부터. "가장 비싼 경로"가 아니라 "가장 많이 쓰이는 경로"를 먼저 보여주는
  // 이유는, 요청 1건짜리 경로의 극단값이 표 맨 위를 차지하면 사람이 그것을 병목으로 읽기
  // 때문이다. 비용 순위는 dbMsTotal 열로 직접 읽는다.
  endpoints.sort((a, b) => b.requests - a.requests);

  const totalRequests = endpoints.reduce((a, e) => a + e.requests, 0);
  const attributedStatements = endpoints.reduce(
    (a, e) => a + (e.queriesPerRequest != null ? e.queriesPerRequest * e.requests : 0), 0);

  return {
    available: endpoints.length > 0,
    reason: endpoints.length
      ? null
      : 'http_server_queries 시계열이 없다 — 앱 이미지에 QueryCountFilter 가 없거나(재빌드 필요) '
        + 'app.query-metrics.enabled=false 이다',
    buckets: QUERY_COUNT_BUCKETS,
    threshold: PER_REQUEST_THRESHOLD,
    totalRequests,
    // 엔드포인트에 귀속된 문장 수의 추정 합. outsideRequest 와 더하면 MySQL 전역 문장 수와
    // 맞아야 한다 — 안 맞으면 그 차이가 계측이 못 본 몫이다.
    attributedStatements: Math.round(attributedStatements),
    outsideRequestStatements: outsideRequest,
    endpoints: endpoints.slice(0, TOP_ENDPOINTS),
    truncated: Math.max(0, endpoints.length - TOP_ENDPOINTS),
    errors,
  };
}

module.exports = { collect, quantileBucket, endpointKey, QUERY_COUNT_BUCKETS, PER_REQUEST_THRESHOLD, TOP_ENDPOINTS };
