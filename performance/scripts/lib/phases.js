/**
 * Phase plan — warmup/measure/rampdown을 k6 실행 계획의 1급 개념으로 선언한다.
 *
 * 이 파일은 순수 계산만 담는다(k6 런타임 API 의존 없음). `exec.instance.currentTestRunDuration`
 * 처럼 k6에서만 존재하는 API는 여기 두지 않는다 — Node 테스트가 `await import()`로 이 파일을
 * 직접 로드해 검증해야 하는데, k6 전용 모듈(`k6/execution` 등)을 import하면 plain Node에서
 * import 자체가 실패한다. k6 런타임과 맞닿는 부분(`currentPhase()`)은 scripts/lib/config.js가
 * 이 파일의 `phaseAt()`을 가져다 조립한다.
 *
 * ES 모듈 문법을 그대로 쓴다(scripts/lib 의 다른 파일과 동일 — k6는 이 문법만 받는다).
 * Node 테스트에서 `await import()`로 로드하려면 이 파일이 ESM으로 해석돼야 하므로,
 * `performance/scripts/package.json`에 `{"type":"module"}`을 선언해 둔다(k6 자체 로더는
 * package.json을 보지 않으므로 k6 실행에는 영향 없음).
 */

export const SCHEMA_VERSION = 1;

const UNIT_SECONDS = { ms: 0.001, s: 1, m: 60, h: 3600 };

/**
 * '5m' | '300s' | '300' | 300 → 초 단위 숫자로 정규화한다.
 *
 * null/undefined/'' 는 fallbackSec 로 빠진다(값이 명시되지 않았다는 뜻 — 0과 구분해야 한다).
 * 그 외 파싱 불가/음수는 조용히 기본값으로 빠지지 않고 throw 한다. warmup 설정 오류를
 * 조용히 삼키는 것 자체가 이번에 고치려는 문제(측정 구간이 조용히 틀어짐)와 같은 종류다.
 */
export function toSeconds(value, fallbackSec) {
  if (value === null || value === undefined || value === '') {
    if (fallbackSec === undefined) throw new Error('toSeconds: 값도 없고 fallback도 없다');
    return fallbackSec;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`toSeconds: 잘못된 숫자 값 '${value}'`);
    return value;
  }
  const s = String(value).trim();
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(s);
  if (!m) throw new Error(`toSeconds: 파싱할 수 없는 값 '${value}'`);
  const n = Number(m[1]);
  const unit = m[2] || 's';
  const sec = n * UNIT_SECONDS[unit];
  if (sec < 0) throw new Error(`toSeconds: 음수 구간은 허용되지 않는다 '${value}'`);
  return sec;
}

/**
 * 정규화된 phase plan을 만든다. warmupSec/measureSec/rampdownSec은 이미 초 단위 숫자여야
 * 한다(문자열 정규화는 호출부가 toSeconds로 미리 끝낸다) — 이 함수 자체는 순수 조립만 한다.
 */
export function buildPhasePlan({ mode, warmupSec, measureSec, rampdownSec, gatePhase = 'measure' }) {
  if (!Number.isFinite(warmupSec) || warmupSec < 0) throw new Error(`buildPhasePlan: warmupSec 이 잘못됨 (${warmupSec})`);
  if (!Number.isFinite(measureSec) || measureSec < 0) throw new Error(`buildPhasePlan: measureSec 이 잘못됨 (${measureSec})`);
  if (!Number.isFinite(rampdownSec) || rampdownSec < 0) throw new Error(`buildPhasePlan: rampdownSec 이 잘못됨 (${rampdownSec})`);
  if (gatePhase !== 'measure' && gatePhase !== null) throw new Error(`buildPhasePlan: gatePhase 는 'measure' 또는 null 만 허용 (${gatePhase})`);
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: mode || 'steady-state',
    warmupSec,
    measureSec,
    rampdownSec,
    measureStartOffsetSec: warmupSec,
    measureEndOffsetSec: warmupSec + measureSec,
    gatePhase,
  };
}

/** 경과 초(elapsedSec)가 어느 phase에 속하는지 계산한다 — 요청마다 다시 불러야 한다. */
export function phaseAt(plan, elapsedSec) {
  const e = Math.max(0, elapsedSec);
  if (e < plan.warmupSec) return 'warmup';
  if (e < plan.warmupSec + plan.measureSec) return 'measure';
  return 'rampdown';
}

/** plan으로부터 k6 ramping-vus stages 배열을 생성한다. 0초 구간은 stage 자체를 생략한다. */
export function stagesFor(plan, targetVus) {
  const stages = [];
  if (plan.warmupSec > 0) stages.push({ duration: `${plan.warmupSec}s`, target: targetVus });
  stages.push({ duration: `${plan.measureSec}s`, target: targetVus });
  if (plan.rampdownSec > 0) stages.push({ duration: `${plan.rampdownSec}s`, target: 0 });
  return stages;
}

/** warmup 이 0이면 처음부터 목표 VU로 시작해야 measure stage 안에서 암묵적 램프가 안 생긴다. */
export function startVusFor(plan, targetVus) {
  return plan.warmupSec > 0 ? 0 : targetVus;
}

/**
 * open model(arrival-rate) 용 stage. `stagesFor` 와 같은 구간 구조를 도착률로 만든다.
 *
 * 왜 필요한가 — closed model(`ramping-vus`)에서는 **시스템이 느려지면 부하 발생기가
 * 스스로 요청을 줄인다.** 한 VU 는 이전 iteration 이 끝나야 다음을 시작하기 때문이다
 * (coordinated omission). 그 결과 두 가지가 생긴다.
 *
 *   1) "같은 부하에서 처리량이 25% 줄었다"고 말할 수 없다 — 도착률 자체가 달랐다.
 *   2) VU 가 고정이면 리틀의 법칙에 따라 응답시간이 `R = N / X` 로 **기계적으로** 정해진다.
 *      실측에서 `200/처리율` 과 p95 의 상관이 0.962 였다 — p95 가 처리량의 그림자였다.
 *      작은 호스트 변동이 큰 p95 차이로 증폭되는 것도 이 구조 탓이다.
 *
 * 도착률을 고정하면 이 되먹임이 끊긴다. 시스템이 못 따라오면 부하가 줄어드는 대신
 * **dropped_iterations 로 드러난다** — 숨지 않고 신호가 된다.
 *
 * 자세한 근거: localDocs/investigations/perf-session-drift.md 8-d.2, 8-d.5
 */
export function ratesFor(plan, targetRate) {
  const stages = [];
  if (plan.warmupSec > 0) stages.push({ duration: `${plan.warmupSec}s`, target: targetRate });
  stages.push({ duration: `${plan.measureSec}s`, target: targetRate });
  if (plan.rampdownSec > 0) stages.push({ duration: `${plan.rampdownSec}s`, target: 0 });
  return stages;
}

/** warmup 이 0이면 처음부터 목표 도착률로 시작한다(stagesFor 와 같은 이유). */
export function startRateFor(plan, targetRate) {
  return plan.warmupSec > 0 ? 0 : targetRate;
}

/**
 * 'http_req_duration{op:read}' 같은 threshold 키를 {metric, tags} 로 분해한다.
 * 태그가 없으면 tags 는 빈 객체.
 */
export function parseSelector(key) {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{(.*)\})?$/.exec(key);
  if (!m) throw new Error(`parseSelector: 파싱할 수 없는 selector '${key}'`);
  const metric = m[1];
  const tags = {};
  if (m[2]) {
    for (const part of m[2].split(',')) {
      const sep = part.indexOf(':');
      if (sep < 0) throw new Error(`parseSelector: 태그 형식이 잘못됨 '${part}' (in '${key}')`);
      tags[part.slice(0, sep)] = part.slice(sep + 1);
    }
  }
  return { metric, tags };
}

/** {metric, tags} 를 selector 문자열로 직렬화한다. 태그 키를 정렬해 순서 차이를 없앤다. */
export function buildSelector(metric, tags) {
  const keys = Object.keys(tags).sort();
  if (!keys.length) return metric;
  return `${metric}{${keys.map((k) => `${k}:${tags[k]}`).join(',')}}`;
}

/**
 * threshold 객체의 모든 키에 태그를 병합한 새 threshold 객체를 만든다.
 * 기존 selector에 이미 같은 태그 키가 있으면 새 값으로 덮어쓴다(명시적 우선순위 — 호출부가
 * 실수로 두 번 phase를 섞는 경우를 조용히 무시하지 않고 마지막 병합이 이긴다).
 */
export function scopeThresholds(thresholds, tagsToMerge) {
  const out = {};
  for (const [key, value] of Object.entries(thresholds)) {
    const { metric, tags } = parseSelector(key);
    const merged = buildSelector(metric, { ...tags, ...tagsToMerge });
    out[merged] = value;
  }
  return out;
}

/**
 * 지연 계열 통계 추출 — k6 Trend의 values 객체에서 avg/min/med/max/p90/p95/p99를 뽑는다.
 *
 * 없는 분위수를 0으로 채우지 않는다. k6는 --summary-trend-stats 없이는 p(99)를 계산하지
 * 않는데, 여기서 `?? 0`으로 메우면 "P99 = 0ms"라는 거짓 데이터가 만들어지고 그게 그대로
 * 회귀 판정과 보고서에 들어간다. 측정 안 된 값은 0이 아니라 없는 값이어야 한다.
 */
export function trendStats(v) {
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

function phaseDurationSec(plan, phase) {
  if (phase === 'warmup') return plan.warmupSec;
  if (phase === 'measure') return plan.measureSec;
  if (phase === 'rampdown') return plan.rampdownSec;
  return 0;
}

function counterCount(m, metric, phase) {
  const sub = m[buildSelector(metric, { phase })];
  const c = sub && sub.values ? sub.values.count : null;
  return typeof c === 'number' && c > 0 ? c : null;
}

/**
 * 한 phase 안에서 완료된 iteration 수 — 소스가 두 개고, 시나리오가 phase를 어떻게 나눴느냐에
 * 따라 둘 중 하나만 채워진다. 그래서 우선순위를 두고 폴백한다.
 *
 *   1) `phase_iterations{phase:X}` — workload.js가 iteration 끝에 직접 세는 커스텀 Counter.
 *      요청 시점 경과 시간으로 phase를 계산하는 일반 시나리오(setActivePhasePlan 호출)는
 *      이 경로로만 값이 잡힌다. k6 builtin `iterations`는 엔진이 기록하므로 스크립트가 요청
 *      단위로 붙인 동적 태그가 실리지 않는다.
 *   2) `iterations{phase:X}` — k6 builtin. cache-warm처럼 executor를 phase별로 나누고
 *      `scenarios.<name>.tags`로 정적 태깅하는 시나리오는 setActivePhasePlan을 부르지 않아
 *      1)이 항상 0이지만, 정적 태그는 builtin 메트릭에도 붙으므로 이쪽에 값이 남는다.
 *
 * 0은 유효한 값으로 보지 않고 다음 소스로 넘어간다. 두 소스 모두 비어 있으면 null —
 * "0건 처리했다"와 "세지 못했다"는 다른 사실이고, 여기서 0으로 확정하면 리포트의 TPS가
 * 조용히 0으로 찍힌다(cache-warm에서 실제로 그랬다).
 */
function iterationCountFor(m, phase) {
  return counterCount(m, 'phase_iterations', phase) ?? counterCount(m, 'iterations', phase);
}

/**
 * 표본이 0건인 phase의 지연 통계 — trendStats()와 같은 키를 전부 null로 채운다.
 * 키를 아예 빼지 않는 이유: 저장되는 run.json이 "이 값을 못 쟀다"를 명시적으로 남겨야
 * 나중에 그 파일만 보고도 결측을 재구성할 수 있다.
 */
const EMPTY_TREND = { avg: null, min: null, med: null, max: null, p90: null, p95: null, p99: null };

/**
 * plan이 선언한 phase(warmup/measure/rampdown) 각각의 요약 지표를 k6 raw metrics(`m`)에서
 * 뽑는다. `m`은 k6 handleSummary의 `data.metrics`(또는 그와 같은 구조의 값)여야 한다.
 *
 * config.js의 PHASED_THRESHOLDS가 `http_req_duration{phase:X}` 같은 bare per-phase
 * 서브메트릭을 만들어 두므로(op 등 다른 태그와 섞이지 않은 축), 여기서는 buildSelector로
 * 같은 키를 다시 만들어 조회하기만 한다 — S-17이 고치는 지점이다: cache-warm의
 * warmup/measurement가 하나의 overall로 섞이던 것을 여기서 완전히 분리한다.
 *
 * plan이 그 phase에 시간을 아예 배정하지 않았거나(예: cold-start의 warmupSec=0), 애초에
 * phase 태깅이 활성화되지 않은 시나리오(진단 전용, gatePhase:null)라면 해당 서브메트릭이
 * 존재하지 않으므로 버킷 자체를 만들지 않는다 — 빈 값을 0으로 채워 "측정했지만 0이었다"는
 * 거짓 데이터를 만들지 않는다.
 *
 * iteration 수(=TPS의 분자)만은 소스가 둘이라 iterationCountFor()로 폴백한다 — 시나리오가
 * phase를 동적 태그로 나누느냐(커스텀 Counter) 정적 executor 태그로 나누느냐(k6 builtin)에
 * 따라 값이 실리는 축이 달라진다. 자세한 우선순위는 그 함수 주석 참고.
 *
 * 표본이 0건인 phase는 통계를 전부 null로 남긴다 — noSamples 판정 주석 참고.
 */
export function metricsByPhase(m, plan) {
  if (!plan) return {};
  const out = {};
  for (const phase of ['warmup', 'measure', 'rampdown']) {
    const phaseSec = phaseDurationSec(plan, phase);
    if (!(phaseSec > 0)) continue;

    const durM = m[buildSelector('http_req_duration', { phase })];
    const reqsM = m[buildSelector('http_reqs', { phase })];
    const failedM = m[buildSelector('http_req_failed', { phase })];
    const checksM = m[buildSelector('checks', { phase })];
    const iterM = m[buildSelector('phase_iterations', { phase })];
    const builtinIterM = m[buildSelector('iterations', { phase })];
    if (!durM && !reqsM && !failedM && !checksM && !iterM && !builtinIterM) continue;

    const iterCount = iterationCountFor(m, phase);
    const reqCount = reqsM && reqsM.values && typeof reqsM.values.count === 'number' ? reqsM.values.count : null;

    /*
     * 표본 0건 판정 — "이 구간을 재지 못했다"를 값이 아니라 표본 수로 가른다(T-08).
     *
     * k6는 threshold가 참조한 서브메트릭을, 표본이 한 건도 없어도 0으로 채워 요약에 실어
     * 준다(k6 v2.1.0 실측: p(95)=0, rate=0, count=0). 그래서 조기 종료 등으로 measure
     * 구간이 통째로 비면 이 함수가 "P95 0ms, 오류율 0%, 체크 성공률 0%"라는 버킷을 만들고,
     * 회귀 게이트는 그걸 완벽한 실행으로 읽는다. 0은 null이 아니라서 SKIP되지도 않는다.
     *
     * 판정은 "표본이 없다는 적극적 증거"가 있을 때만 내린다 — http_reqs 서브메트릭이 요약에
     * 실제로 있고 그 count가 0일 때다. 서브메트릭 자체가 없는 것은 "0건"이 아니라 "그 축을
     * 선언하지 않았다"는 뜻이라 결측으로 단정하면 안 된다. phase 축을 쓰는 시나리오는
     * PHASE_DIAGNOSTIC_THRESHOLDS가 http_reqs{phase:X}를 항상 선언하므로(thresholds.js),
     * 실제 실행에서는 언제나 이 증거가 존재한다.
     *
     * iterations를 함께 보는 이유: WebSocket 위주 구간은 HTTP 요청이 0이어도 iteration은
     * 실제로 돈다. http_reqs만 보면 정상 구간을 결측으로 오판한다.
     *
     * httpReqs·iterations 값 자체는 0/null 그대로 남긴다 — "왜 결측인가"의 증거이자,
     * 상위 계층(tools/lib/regression.js의 measurementStatus)이 판정을 재구성할 근거다.
     */
    const noSamples = reqCount === 0 && !(iterCount > 0);
    const dur = noSamples ? EMPTY_TREND : (trendStats(durM && durM.values) || {});

    out[phase] = {
      ...dur,
      durationSec: phaseSec,
      /*
       * **k6 의 `rate` 를 쓰면 안 된다.** k6 는 카운터의 rate 를 언제나 **전체 테스트
       * 시간**으로 나눈다 — phase 태그가 붙은 서브메트릭이어도 그렇다. 그래서
       * `http_reqs{phase:measure}.rate` 는 "measure 구간의 요청 수 ÷ 전체 실행 시간"이라는,
       * 분자와 분모의 구간이 어긋난 값이 된다.
       *
       * 실측(EXP-001, measure 1200s / 전체 1649s): 요청 29,650건에 대해
       *   k6 rate      17.98  (29650 / 1649)   ← 틀림
       *   요청/구간     24.71  (29650 / 1200)   ← 맞음
       * 워밍업이 길수록 더 크게 어긋난다. 측정 300s / 전체 607s 설계에서는 참값의 49%였다.
       *
       * 바로 아래 tps 가 옳게 나오던 이유는 역설적이다 — `iterations` 에 phase 서브메트릭이
       * 없어 k6 rate 를 못 쓰고 직접 나눴기 때문이다. 정석대로 쓴 쪽이 틀렸다.
       */
      rps: !noSamples && reqCount != null && phaseSec > 0 ? reqCount / phaseSec : null,
      tps: iterCount != null && phaseSec > 0 ? iterCount / phaseSec : null,
      errorRate: !noSamples && failedM && failedM.values && failedM.values.rate != null ? failedM.values.rate : null,
      httpReqs: reqCount || 0,
      iterations: iterCount,   // null = 두 소스 모두 비어 있음(미집계) — 0으로 확정하지 않는다
      checkRate: !noSamples && checksM && checksM.values && checksM.values.rate != null ? checksM.values.rate : null,
      checksPassed: (checksM && checksM.values && checksM.values.passes) || null,
      checksFailed: (checksM && checksM.values && checksM.values.fails) || null,
    };
  }
  return out;
}
