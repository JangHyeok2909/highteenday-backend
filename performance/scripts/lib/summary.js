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
import exec from 'k6/execution';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { trendStats, metricsByPhase } from './phases.js';

/**
 * 부하 프로파일 지문 — "이 실행이 어떤 부하를 걸기로 했는가"의 선언 값.
 *
 * 왜 VUS 환경변수가 아니라 여기서 꺼내는가
 *   VUS/HOLD 는 perf-run 이 넘긴 것만 담기므로, 시나리오 파일이 자체적으로 들고 있는
 *   stages(대부분이 그렇다)는 통째로 보이지 않는다. exec.test.options.scenarios 는 k6 가
 *   해석을 끝낸 최종 설정이라 executor·startVUs·stages·rate 를 전부 담고, ramping-vus 든
 *   arrival-rate 든 같은 방식으로 읽힌다.
 *
 * 왜 요약의 vusMax 를 쓰면 안 되는가
 *   그건 관측값이다. arrival-rate 는 서버가 느려지면 VU 를 더 할당하므로 vusMax 가
 *   성능에 따라 움직인다. 비교 가능성의 키에 결과값이 섞이면 판정이 순환한다
 *   (tools/lib/comparability.js 주석 참고).
 *
 * handleSummary 는 data.options 를 주지만 거기엔 summaryTrendStats/summaryTimeUnit/noColor
 * 3개뿐이라 부하 설정이 없다 — exec.test.options 여야 한다.
 */
function loadProfile() {
  const scenarios = (exec.test.options && exec.test.options.scenarios) || null;
  if (!scenarios) return null;
  const out = {};
  for (const [name, cfg] of Object.entries(scenarios)) {
    out[name] = dropNulls(cfg);
  }
  return out;
}

/**
 * null 필드를 걷어낸다. k6 는 설정하지 않은 옵션을 null 로 채워 넣는데, 그대로 두면
 * k6 버전이 올라가며 새 옵션이 하나 추가될 때마다 지문이 바뀌어 과거 계열이 통째로
 * 끊긴다. 값이 실제로 지정된 것만 남긴다.
 */
function dropNulls(value) {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    out[k] = dropNulls(v);
  }
  return out;
}

/** 실행 메타데이터는 전부 환경변수로 주입된다 (CI/로컬 공통 인터페이스). */
function metadata(scenario, state, phasePlan) {
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
    // 시드 데이터의 지문 — 프로파일 이름이 같아도 생성 규칙이 바뀌면 다른 값이 된다.
    // perf-run.js 가 datasets/generated/<name>/meta.json 에서 읽어 넘긴다. 이 변경 이전에
    // 만든 데이터셋에는 meta.json 이 없어 null 이 된다.
    datasetFingerprint: __ENV.PERF_DATASET_FINGERPRINT || null,
    baseUrl: __ENV.BASE_URL || 'http://localhost:18080',
    note: __ENV.PERF_NOTE || '',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec: Number(durationSec.toFixed(1)),
    // VU 설정은 시나리오가 __ENV로 받으므로 그대로 기록해 둔다. 재현에 필요한 값이다.
    vusConfigured: Number(__ENV.VUS || 0) || null,
    rampUp: __ENV.RAMP_UP || null,
    hold: __ENV.HOLD || null,
    // 비교 가능성의 키 — 기준선 선택이 이 값을 본다(tools/lib/comparability.js).
    loadProfile: loadProfile(),
    // warmup/measure/rampdown 을 k6 실행 계획의 1급 개념으로 선언한 값(T-03/S-08/S-17).
    // collect.js 는 이 값만으로 Prometheus 창을 계산한다 — CLI 재입력 없이 재수집해도
    // 같은 창이 재현된다. comparability.js 의 measurementProfile 조건도 이 값을 읽는다.
    phasePlan,
  };
}

// trendStats 는 scripts/lib/phases.js 에서 가져온다 (p(99) 미측정을 0으로 채우지 않는 이유
// 등 상세 설명도 그쪽에 있다) — 순수 로직이라 phases.js 에 두어야 Node 테스트가 직접
// 검증할 수 있다.

/**
 * `http_req_duration{feature:posts}` 같은 서브메트릭을 태그축별로 묶는다.
 *
 * k6는 threshold에 태그 필터를 써야만 서브메트릭을 만들어 준다.
 * config.js의 BREAKDOWN_THRESHOLDS가 그 목적으로 느슨한 임계값을 걸어 둔다.
 *
 * **지연과 요청 수는 서로 다른 메트릭에서 온다.** Trend(`http_req_duration`)의 values 에는
 * 이 k6 빌드에서 count 가 없어(v2.1.0 실측), 지연 축만 읽으면 요청 수 칸이 항상 빈다.
 * 실제로 그래서 S-04가 "선언한 페이지 비율대로 요청됐는가"에 답하지 못했다 — 페이지별
 * 지연은 다 나오는데 요청 수가 전부 `—` 였다. Counter(`http_reqs`) 서브메트릭을 같은
 * 축으로 합쳐야 그 질문에 답할 수 있다.
 */
function breakdown(metrics) {
  const out = {};

  /** `http_req_duration{feature:post}` → {axis:'feature', value:'post'}. 아니면 null. */
  const axisOf = (key, metricName) => {
    const match = /^([a-z_]+)\{(.+)\}$/.exec(key);
    if (!match || match[1] !== metricName) return null;
    // 태그가 2개 이상인 서브메트릭({phase:...,op:...})은 단일 축 분해가 아니므로 제외한다.
    // 통짜 정규식으로 자르면 첫 콜론까지를 태그 키로 오인해 엉뚱한 축이 생긴다.
    const tags = match[2].split(',');
    if (tags.length !== 1) return null;
    const sep = tags[0].indexOf(':');
    if (sep < 0) return null;
    return { axis: tags[0].slice(0, sep), value: tags[0].slice(sep + 1) };
  };

  const cell = (axis, value) => {
    out[axis] = out[axis] || {};
    out[axis][value] = out[axis][value] || { count: null };
    return out[axis][value];
  };

  for (const [key, m] of Object.entries(metrics)) {
    const at = axisOf(key, 'http_req_duration');
    if (!at) continue;
    const c = cell(at.axis, at.value);
    Object.assign(c, trendStats(m.values));
    if (m.values && m.values.count != null) c.count = m.values.count;
  }

  // 요청 수를 덧입힌다. 지연 축이 없는 값에도 행을 만든다 — 요청이 실제로 갔다는 사실
  // 자체가 정보이고, 지연 축 선언을 빠뜨린 경우를 빈 축으로 감추면 안 된다.
  for (const [key, m] of Object.entries(metrics)) {
    const at = axisOf(key, 'http_reqs');
    if (!at) continue;
    const n = m.values && m.values.count;
    if (n != null) cell(at.axis, at.value).count = n;
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
 * @param {object} phasePlan scripts/lib/phases.js의 buildPhasePlan()으로 만든 계획.
 *   warmup/measure/rampdown을 k6 실행 계획의 1급 개념으로 만드는 것이 이번 변경의 핵심이라
 *   선택 인자로 두지 않는다 — 시나리오가 빠뜨리면 여기서 바로 알아챈다.
 */
export function makeHandleSummary(name, phasePlan) {
  if (!phasePlan) {
    throw new Error(`makeHandleSummary('${name}'): phasePlan이 필요하다 — scripts/lib/phases.js의 buildPhasePlan()으로 선언할 것`);
  }
  return function (data) {
    const m = data.metrics || {};
    const meta = metadata(name, data.state, phasePlan);
    const val = (k, f = 'count') => (m[k] && m[k].values ? m[k].values[f] : null);

    const dur = trendStats(m.http_req_duration && m.http_req_duration.values) || {};
    const iterationsCount = val('iterations', 'count') || 0;
    const durationSec = meta.durationSec || 1;

    // ---- 요구 지표 산출 -------------------------------------------------
    // RPS: 초당 HTTP 요청 수 (k6가 직접 준다)
    // TPS: 초당 완료된 "비즈니스 트랜잭션" = iteration. 한 iteration은 사용자 여정 1회이므로
    //      경영/용량 관점 지표는 RPS가 아니라 TPS다. 둘을 구분해 저장한다.
    const missingPercentiles = ['p90', 'p95', 'p99'].filter((p) => dur[p] == null);

    // 전체 구간(ramp-up + hold + ramp-down 전부 포함) — 진단용. 회귀 게이트는 이 값을
    // 쓰지 않는다(k6.phases.measure가 그 역할이다). 이름을 overall→all로 바꾼 것은
    // "이게 판정 기준이 아니라 참고용 전체 집계"임을 명확히 하기 위함이다.
    const all = {
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
        all,
        // warmup/measure/rampdown 별 요약 — 회귀 게이트와 report.js의 기본 표시는
        // phases[phasePlan.gatePhase]를 쓴다(보통 'measure'). warmup/rampdown은 버리지
        // 않고 진단 정보로 남긴다. gatePhase:null(진단 전용 시나리오)이거나 phase 태깅이
        // 비활성화된 경우 빈 객체가 된다 — 그 경우 회귀 규칙은 값이 없어 SKIP된다.
        phases: metricsByPhase(m, phasePlan),
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
