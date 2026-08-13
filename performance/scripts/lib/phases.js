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
    if (!durM && !reqsM && !failedM && !checksM && !iterM) continue;

    const dur = trendStats(durM && durM.values) || {};
    const iterCount = (iterM && iterM.values && iterM.values.count) || 0;

    out[phase] = {
      ...dur,
      durationSec: phaseSec,
      rps: (reqsM && reqsM.values && reqsM.values.rate != null) ? reqsM.values.rate : null,
      tps: phaseSec > 0 ? iterCount / phaseSec : null,
      errorRate: (failedM && failedM.values && failedM.values.rate != null) ? failedM.values.rate : null,
      httpReqs: (reqsM && reqsM.values && reqsM.values.count) || 0,
      iterations: iterCount,
      checkRate: (checksM && checksM.values && checksM.values.rate != null) ? checksM.values.rate : null,
      checksPassed: (checksM && checksM.values && checksM.values.passes) || null,
      checksFailed: (checksM && checksM.values && checksM.values.fails) || null,
    };
  }
  return out;
}
