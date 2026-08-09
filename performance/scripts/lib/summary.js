/**
 * handleSummary 공통 구현 — 파이프라인 1단계 "Result Collector".
 *
 * 역할 범위
 * ---------
 * 이 파일은 **k6가 아는 것만** 기록한다. 운영 지표(CPU/GC/DB/Redis)는 여기서 만지지 않는다.
 *
 * 왜 여기서 Prometheus를 조회하지 않는가 (중요)
 *   1) 스크레이프 지연 — 테스트가 t=end에 끝나면 마지막 5초 스크레이프는 아직 Prometheus에
 *      들어와 있지 않다. 여기서 즉시 조회하면 부하가 가장 높았던 종료 직전 구간이 통째로 빈다.
 *   2) k6 런타임 제약 — handleSummary는 동기 함수다. 재시도/백오프가 필요한 네트워크 호출을
 *      제대로 감쌀 방법이 없고, 실패하면 20분짜리 테스트 결과를 통째로 잃는다.
 *   3) 관심사 분리 — 부하 생성기는 부하만 생성해야 한다. 수집기가 죽어도 원본은 남아야 하고,
 *      수집 로직이 바뀌어도 과거 원본으로 리포트를 다시 만들 수 있어야 한다(재현성).
 *
 * 그래서 여기서는 원본을 남기고, tools/collect.js 가 스크레이프 지연만큼 기다린 뒤
 * 같은 시간 구간을 Prometheus에 질의해 보강한다.
 *
 * 산출물 — 평면 파일로 쓴다 (reports/runs/<runId>.k6.json)
 *   k6는 존재하지 않는 디렉터리를 만들지 못한다. handleSummary 안에서 runId가 정해지므로
 *   <runId>/ 디렉터리를 미리 만들어 둘 수도 없다. 그래서 1단계는 평면 파일로 떨어뜨리고,
 *   디렉터리 구조는 전적으로 수집기(2단계)가 소유한다.
 */
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

/** 실행 메타데이터는 전부 환경변수로 주입된다 (CI/로컬 공통 인터페이스). */
function metadata(scenario, state) {
  const durationSec = state && state.testRunDurationMs ? state.testRunDurationMs / 1000 : 0;
  const endedAt = new Date();
  // k6는 시작 시각을 직접 주지 않는다. 종료 시각에서 실제 수행 시간을 빼는 게 가장 정확하다.
  const startedAt = new Date(endedAt.getTime() - durationSec * 1000);

  return {
    scenario,
    environment: __ENV.PERF_ENV || 'perf',
    branch: __ENV.PERF_BRANCH || 'unknown',
    commit: __ENV.PERF_COMMIT || 'unknown',
    commitShort: (__ENV.PERF_COMMIT || 'unknown').slice(0, 8),
    buildNumber: __ENV.PERF_BUILD || 'local',
    executor: __ENV.PERF_EXECUTOR || 'unknown',
    scriptVersion: __ENV.PERF_SCRIPT_VERSION || 'unknown',
    dataset: __ENV.DATASET || 'small',
    baseUrl: __ENV.BASE_URL || 'http://localhost:18080',
    note: __ENV.PERF_NOTE || '',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec: Number(durationSec.toFixed(1)),
    // VU 설정은 시나리오가 __ENV로 받으므로 그대로 기록해 둔다. 재현에 필요한 값이다.
    vusConfigured: Number(__ENV.VUS || 0) || null,
    rampUp: __ENV.RAMP_UP || null,
    hold: __ENV.HOLD || null,
  };
}

/**
 * 지연 계열 통계 추출.
 *
 * 없는 분위수를 0으로 채우지 않는 이유 (중요)
 *   k6는 기본적으로 avg/min/med/max/p(90)/p(95) 만 계산한다. p(99)는 계산하지 않는다.
 *   여기서 `?? 0`으로 메우면 "P99 = 0ms"라는 거짓 데이터가 만들어지고, 그게 그대로
 *   회귀 판정과 보고서에 들어간다. 측정 안 된 값은 0이 아니라 **없는 값**이어야
 *   하류 로직이 "비교 불가"로 올바르게 처리한다.
 *
 *   p(99)를 실제로 얻으려면 k6에 --summary-trend-stats 를 넘겨야 한다.
 *   tools/perf-run.js 가 항상 붙여 준다.
 */
function trendStats(v) {
  if (!v) return null;
  const g = (k) => (v[k] == null ? null : v[k]);
  return {
    avg: g('avg'),
    min: g('min'),
    med: v.med != null ? v.med : g('p(50)'),
    max: g('max'),
    p90: g('p(90)'),
    p95: g('p(95)'),
    p99: g('p(99)'),
  };
}

/**
 * `http_req_duration{feature:posts}` 같은 서브메트릭을 태그축별로 묶는다.
 *
 * k6는 threshold에 태그 필터를 써야만 서브메트릭을 만들어 준다.
 * config.js의 BREAKDOWN_THRESHOLDS가 그 목적으로 느슨한 임계값을 걸어 둔다.
 */
function breakdown(metrics) {
  const out = {};
  for (const [key, m] of Object.entries(metrics)) {
    const match = /^([a-z_]+)\{(.+)\}$/.exec(key);
    if (!match || match[1] !== 'http_req_duration') continue;

    // 태그가 2개 이상인 서브메트릭({phase:...,op:...})은 단일 축 분해가 아니므로 제외한다.
    // 통짜 정규식으로 자르면 첫 콜론까지를 태그 키로 오인해 엉뚱한 축이 생긴다.
    const tags = match[2].split(',');
    if (tags.length !== 1) continue;
    const sep = tags[0].indexOf(':');
    if (sep < 0) continue;
    const tagKey = tags[0].slice(0, sep);
    const tagVal = tags[0].slice(sep + 1);

    out[tagKey] = out[tagKey] || {};
    out[tagKey][tagVal] = {
      ...trendStats(m.values),
      count: m.values && m.values.count != null ? m.values.count : null,
    };
  }
  return out;
}

/** check 결과를 그룹 구조에서 평탄화 */
function collectChecks(group, path = '', acc = []) {
  if (!group) return acc;
  for (const c of group.checks || []) {
    acc.push({
      name: path ? `${path} / ${c.name}` : c.name,
      passes: c.passes || 0,
      fails: c.fails || 0,
    });
  }
  for (const g of Object.values(group.groups || {})) {
    collectChecks(g, path ? `${path} / ${g.name}` : g.name, acc);
  }
  return acc;
}

function ts(date) {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * @param {string} name 시나리오 식별자 (예: 'normal-day')
 */
export function makeHandleSummary(name) {
  return function (data) {
    const m = data.metrics || {};
    const meta = metadata(name, data.state);
    const val = (k, f = 'count') => (m[k] && m[k].values ? m[k].values[f] : null);

    const dur = trendStats(m.http_req_duration && m.http_req_duration.values) || {};
    const iterationsCount = val('iterations', 'count') || 0;
    const durationSec = meta.durationSec || 1;

    // ---- 요구 지표 산출 -------------------------------------------------
    // RPS: 초당 HTTP 요청 수 (k6가 직접 준다)
    // TPS: 초당 완료된 "비즈니스 트랜잭션" = iteration. 한 iteration은 사용자 여정 1회이므로
    //      경영/용량 관점 지표는 RPS가 아니라 TPS다. 둘을 구분해 저장한다.
    const missingPercentiles = ['p90', 'p95', 'p99'].filter((p) => dur[p] == null);

    const overall = {
      ...dur,
      // 어떤 분위수가 측정되지 않았는지 기록해 둔다. 보고서가 "0"과 "미측정"을 구분해
      // 표시하려면 이 정보가 필요하다.
      missingPercentiles,
      rps: val('http_reqs', 'rate') || 0,
      tps: val('iterations', 'rate') || iterationsCount / durationSec,
      errorRate: val('http_req_failed', 'rate') || 0,
      // http_req_failed 는 Rate 메트릭이다: passes = 조건("요청이 실패했다")이 참인 표본
      // = 실패한 요청 수다. fails 를 읽으면 성공 요청 수가 나온다 — 이름에 속기 쉽다.
      failedRequests: val('http_req_failed', 'passes') || 0,
      httpReqs: val('http_reqs', 'count') || 0,
      iterations: iterationsCount,
      checkRate: val('checks', 'rate') || 0,
      checksPassed: val('checks', 'passes') || 0,
      checksFailed: val('checks', 'fails') || 0,
      vusMax: val('vus_max', 'max') || val('vus_max', 'value') || 0,
      dataReceivedBytes: val('data_received', 'count') || 0,
      dataSentBytes: val('data_sent', 'count') || 0,
      // 대기 계열 — 서버가 느린 건지 연결이 느린 건지 가르는 축
      waitingAvgMs: m.http_req_waiting ? m.http_req_waiting.values.avg : null,
      waitingP95Ms: m.http_req_waiting ? m.http_req_waiting.values['p(95)'] : null,
      blockedAvgMs: m.http_req_blocked ? m.http_req_blocked.values.avg : null,
      connectingAvgMs: m.http_req_connecting ? m.http_req_connecting.values.avg : null,
      iterationDurationAvgMs: m.iteration_duration ? m.iteration_duration.values.avg : null,
    };

    const thresholds = [];
    for (const [metricName, metric] of Object.entries(m)) {
      if (!metric.thresholds) continue;
      for (const [expr, res] of Object.entries(metric.thresholds)) {
        // k6 버전에 따라 boolean 또는 {ok:boolean}
        const ok = typeof res === 'object' ? !!res.ok : !!res;
        thresholds.push({ metric: metricName, expression: expr, ok });
      }
    }

    const record = {
      schemaVersion: 1,
      phase: 'k6',
      run: meta,
      k6: {
        overall,
        breakdown: breakdown(m),
        thresholds,
        thresholdsPassed: thresholds.every((t) => t.ok),
        checks: collectChecks(data.root_group),
        // 원본 전체 — 나중에 새 지표가 필요해져도 과거 실행을 다시 계산할 수 있어야 한다.
        rawMetrics: m,
      },
    };

    const stamp = ts(new Date());
    const runId = `${name}-${stamp}`;
    record.run.id = runId;

    const runsDir = __ENV.RUNS_DIR || 'reports/runs';
    const text = textSummary(data, { indent: ' ', enableColors: true });

    return {
      stdout: text,
      // 2단계(collect.js) 입력 — 평면 파일. 수집기가 <runId>/ 로 정리한다.
      // k6 원본 전체는 record.k6.rawMetrics 에 이미 들어 있으므로 별도 raw 사본은 남기지 않는다.
      [`${runsDir}/${runId}.k6.json`]: JSON.stringify(record, null, 2),
      [`${runsDir}/${runId}.summary.txt`]: textSummary(data, { indent: ' ', enableColors: false }),
    };
  };
}
