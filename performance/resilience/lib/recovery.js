/**
 * 회복 시간과 탐지 지연 — 이미 모아 둔 자료를 숫자로 읽는다.
 *
 * 부수효과가 없다. 입력은 `run.json` 에 이미 들어 있는 시계열(`series`)·헬스 표본(`health`)·
 * 주입 기록(`events`) 뿐이라, 새로 수집하지 않고 지난 실행에도 그대로 적용된다
 * (`render-report.js` 가 저장된 run.json 으로 다시 렌더링할 때 같은 값이 나온다).
 *
 * <h2>왜 필요한가</h2>
 *
 * 시간축 그래프만 있으면 "언제 평시로 돌아왔나"를 사람이 눈으로 읽는다. 같은 그래프를 두
 * 사람이 다르게 읽고, 같은 사람도 두 번 다르게 읽는다. 그러면 고치기 전과 후를 비교할 기준이
 * 사라진다. 회복 시간은 장애 실험의 결론 중 가장 자주 인용되는 한 숫자라 특히 그렇다.
 *
 * <h2>판정이 아니다</h2>
 *
 * 여기서 나오는 값은 계획의 가설과 대조되지 않고 통과·실패를 만들지 않는다(resilience/README.md).
 * 그래프를 읽는 규칙을 코드로 고정해 두 실행이 같은 규칙으로 읽히게 하는 것이 전부다.
 *
 * <h2>모르는 것을 0 으로 적지 않는다</h2>
 *
 * 회복 상태는 다섯 가지로 갈린다. 넷은 숫자가 아니고, 그 넷을 숫자로 뭉개면 보고서가
 * 거짓말을 한다.
 *
 *   recovered      대역으로 돌아와 유지됐다 — 초 단위 값이 있다
 *   not-recovered  실행이 끝날 때까지 대역 밖이다
 *   unproven       대역 안으로 들어왔지만 유지 구간을 증명할 표본이 모자란다 (post 가 짧다)
 *   no-impact      애초에 대역을 벗어난 적이 없다 — 회복할 것이 없다
 *   no-data        기준을 만들 표본이나 이후 표본이 없다 (수집 실패)
 */
'use strict';

const { healthCause } = require('./plan');

/**
 * 회복을 판단할 시계열과 그 대역 규칙. 키는 `fault-run.js collectSeries()` 의 이름과 같다.
 *
 * 대역은 `pre 기준값 × tolerance` 와 `pre 기준값 ± floor` 중 **느슨한 쪽**이다. 곱셈만 쓰면
 * 기준값이 0 에 가까운 지표(hikari pending, 오류율)에서 대역이 0 으로 붙어 잡음 하나에
 * "미회복"이 나온다. 덧셈만 쓰면 기준값이 큰 지표에서 대역이 지나치게 좁아진다.
 *
 * `smoothedSec` 는 그 지표가 PromQL 이동창 위에서 계산된다는 뜻이다. 이동창 안에 장애 중
 * 표본이 남아 있는 동안은 값이 실제보다 늦게 내려오므로, 회복 시간이 그만큼 **길게** 나온다.
 * 값을 보정하지 않고 보고서에 그대로 적는 대신 이 사실을 함께 표시한다.
 *
 * `direction` 이 `lower` 인 지표는 값이 큰 쪽이 정상이다(처리량). 나머지는 작은 쪽이 정상이다.
 */
const METRIC_SPECS = [
  { key: 'errorPct', label: '오류율', unit: '%', digits: 2, tolerance: 1.2, floor: 1, smoothedSec: 30, direction: 'upper' },
  { key: 'p95', label: '응답 p95', unit: 'ms', digits: 0, tolerance: 1.2, floor: 50, smoothedSec: 30, direction: 'upper' },
  { key: 'rps', label: '처리량 RPS', unit: '/s', digits: 2, tolerance: 0.9, floor: 0.5, smoothedSec: 30, direction: 'lower' },
  { key: 'tomcatBusy', label: 'Tomcat busy', unit: '개', digits: 1, tolerance: 1.2, floor: 2, smoothedSec: 0, direction: 'upper' },
  { key: 'hikariPending', label: 'Hikari pending', unit: '개', digits: 1, tolerance: 1.2, floor: 1, smoothedSec: 0, direction: 'upper' },
  { key: 'mysqlThreadsRunning', label: 'MySQL threads_running', unit: '개', digits: 1, tolerance: 1.2, floor: 2, smoothedSec: 0, direction: 'upper' },
];

const DEFAULTS = {
  // 대역 안에 이만큼 연속으로 머물러야 회복으로 본다. 스파이크 사이의 잠깐 정상을
  // 회복으로 읽으면 redis-crash 처럼 복구 뒤에 2차 스파이크가 오는 실험에서 값이 뒤집힌다.
  holdSec: 30,
  // pre 앞부분은 JIT·커넥션 풀·캐시가 데워지는 구간이라 기준값을 왜곡한다. 잘라 낸 뒤에도
  // 표본이 3개 미만이면(짧은 smoke 실행) 자르지 않고 pre 전체를 쓴다.
  warmupSkipSec: 30,
  // 유지 구간 안에 이보다 긴 표본 공백이 있으면 "계속 정상이었다"를 증명할 수 없다.
  // 수집 step 이 5초이므로 3배를 넘는 공백은 스크레이프가 빠진 것이다.
  maxGapSec: 15,
};

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 정상 대역의 경계값. 방향에 따라 상한이거나 하한이다. */
function bandLimit(base, spec) {
  return spec.direction === 'lower'
    ? Math.min(base * spec.tolerance, base - spec.floor)
    : Math.max(base * spec.tolerance, base + spec.floor);
}

function inBand(v, limit, spec) {
  return spec.direction === 'lower' ? v >= limit : v <= limit;
}

/** 방향에 맞는 최악값 — 상한 지표는 최대, 하한 지표는 최소. */
function worstOf(points, spec) {
  return points.reduce((acc, p) => {
    if (acc == null) return p.v;
    return spec.direction === 'lower' ? Math.min(acc, p.v) : Math.max(acc, p.v);
  }, null);
}

/** 연속한 표본 사이의 가장 긴 공백(초). 표본이 하나 이하이면 0. */
function maxGap(points) {
  let gap = 0;
  for (let i = 1; i < points.length; i += 1) gap = Math.max(gap, points[i].sec - points[i - 1].sec);
  return gap;
}

/**
 * 시계열 하나의 회복 상태를 만든다.
 *
 * @param {{t:number,v:number}[]} points Prometheus range 결과. `t` 는 unix 초.
 * @param {object} spec {@link METRIC_SPECS} 의 한 항목.
 * @param {{t0Sec:number, faultStartSec:number, faultEndSec:number}} marks 실행 기준 시각.
 * @param {{holdSec:number, warmupSkipSec:number, maxGapSec:number}} opts 판단 규칙.
 * @returns {object} `status` 와, 상태에 따라 `base`·`limit`·`worst`·`recoverySec` 등.
 */
function recoveryOf(points, spec, marks, opts) {
  const head = { key: spec.key, label: spec.label, unit: spec.unit, digits: spec.digits, smoothedSec: spec.smoothedSec, direction: spec.direction };
  const rel = (points || [])
    .filter((p) => p && Number.isFinite(p.v) && Number.isFinite(p.t))
    .map((p) => ({ sec: Math.round((p.t - marks.t0Sec) * 10) / 10, v: p.v }))
    .sort((a, b) => a.sec - b.sec);
  if (!rel.length) return { ...head, status: 'no-data', reason: '시계열이 비어 있다 — 수집 실패' };

  const preAll = rel.filter((p) => p.sec >= 0 && p.sec < marks.faultStartSec);
  const trimmed = preAll.filter((p) => p.sec >= opts.warmupSkipSec);
  const preUsed = trimmed.length >= 3 ? trimmed : preAll;
  const base = median(preUsed.map((p) => p.v));
  if (base == null) return { ...head, status: 'no-data', reason: 'pre 구간 표본이 없어 기준을 만들 수 없다' };

  const limit = bandLimit(base, spec);
  const after = rel.filter((p) => p.sec >= marks.faultStartSec);
  if (!after.length) return { ...head, status: 'no-data', base, limit, reason: '장애 시작 이후 표본이 없다' };

  const worst = worstOf(after, spec);
  const body = { ...head, base, limit, worst, preSamples: preUsed.length, warmupSkipped: preUsed !== preAll };

  // 장애 시작부터 실행 끝까지 한 번도 대역을 벗어나지 않았으면 회복할 대상이 없다.
  // post 구간에서만 튀는 경우(빈 캐시 스탬피드)도 여기서 영향으로 잡힌다.
  if (!after.some((p) => !inBand(p.v, limit, spec))) return { ...body, status: 'no-impact' };

  const tail = rel.filter((p) => p.sec >= marks.faultEndSec);
  const lastSec = rel[rel.length - 1].sec;
  let gapped = false;
  for (const cand of tail) {
    if (!inBand(cand.v, limit, spec)) continue;
    const windowEnd = cand.sec + opts.holdSec;
    // tail 은 오름차순이라, 이 후보로 유지 구간을 못 채우면 뒤의 후보도 못 채운다.
    if (lastSec < windowEnd) return { ...body, status: 'unproven', enteredAtSec: cand.sec, shortBySec: Math.round((windowEnd - lastSec) * 10) / 10 };
    const window = tail.filter((p) => p.sec >= cand.sec && p.sec <= windowEnd);
    if (window.some((p) => !inBand(p.v, limit, spec))) continue;
    if (maxGap(window) > opts.maxGapSec) { gapped = true; continue; }
    return {
      ...body,
      status: 'recovered',
      recoveredAtSec: cand.sec,
      recoverySec: Math.round((cand.sec - marks.faultEndSec) * 10) / 10,
      holdSamples: window.length,
    };
  }
  if (gapped) return { ...body, status: 'no-data', reason: `대역 안에 들어왔지만 표본 공백이 ${opts.maxGapSec}초를 넘어 유지를 증명할 수 없다` };
  return { ...body, status: 'not-recovered', lastValue: rel[rel.length - 1].v, lastSec };
}

/**
 * 계획상 특정 시각에 예약된 주입이 **실제로** 일어난 시각을 찾는다.
 *
 * 계획 시각(`t0 + 초`)이 아니라 실행 기록을 쓰는 이유는, 도커 명령이 1초 안팎 늦게 끝나기
 * 때문이다. 탐지 지연은 초 단위로 읽는 값이라 그 차이가 그대로 오차가 된다.
 *
 * @param {object[]} events `driver.events` — `kind` 가 `inject` 인 항목만 본다.
 * @param {number} targetSec 찾는 기준 시각(실행 시작 기준 초).
 * @param {number} t0Ms 부하 시작 시각(epoch ms).
 * @returns {{atMs:number, source:'event'|'plan', label:string}} 시각과 그 출처.
 */
function injectMoment(events, targetSec, t0Ms) {
  const hit = (events || [])
    .filter((e) => e && e.kind === 'inject' && Number.isFinite(Date.parse(e.at)))
    .map((e) => ({ ...e, sec: Number.isFinite(e.actualAtSec) ? e.actualAtSec : e.plannedAtSec }))
    .filter((e) => Number.isFinite(e.sec) && e.sec >= targetSec - 1)
    .sort((a, b) => a.sec - b.sec)[0];
  if (!hit) return { atMs: t0Ms + targetSec * 1000, source: 'plan', label: '계획 시각(주입 기록 없음)' };
  return { atMs: Date.parse(hit.at), source: 'event', label: `${hit.tool} ${hit.action || ''} ${hit.target || ''}`.trim() };
}

/**
 * 헬스체크가 장애를 알아채기까지 걸린 시간과, 정상으로 되돌아오기까지 걸린 시간.
 *
 * 알람 체계가 없는 지금 이 저장소에서 MTTD(탐지까지의 시간)를 대신할 수 있는 유일한 값이다.
 * 로드밸런서가 인스턴스를 빼거나 되돌리는 판단도 같은 신호를 쓴다.
 *
 * <b>표본의 한계.</b> 폴러는 고정 간격으로 찍으므로 실제 탐지 시각은 (측정값 − 간격, 측정값]
 * 안에 있다. 지연은 요청 **완료** 시각으로 잰다 — 무응답을 알아챈 시점은 요청을 보낸 때가
 * 아니라 상한까지 기다린 뒤이기 때문이다. 어느 표본을 장애 이후로 볼지는 요청 **시작** 시각으로
 * 가른다. 장애 직전에 시작된 폴링이 우연히 장애에 걸린 것을 탐지로 세지 않기 위해서다.
 *
 * @param {object} rec 저장된 실행 레코드(run.json).
 * @returns {object} 기준 시각·탐지 여부·지연 초·원인·해제 지연·폴링 간격.
 */
function detectionLag(rec) {
  const t0Ms = Date.parse(rec.t0);
  const phases = (rec.plan && rec.plan.phases) || {};
  const faultStart = injectMoment(rec.events, phases.preSec, t0Ms);
  const faultEnd = injectMoment(rec.events, phases.preSec + phases.faultSec, t0Ms);
  const samples = (rec.health || [])
    .filter((s) => s && Number.isFinite(Date.parse(s.at)))
    .map((s) => ({ ...s, startMs: Date.parse(s.at), doneMs: Date.parse(s.at) + (Number.isFinite(s.latencyMs) ? s.latencyMs : 0) }))
    .sort((a, b) => a.startMs - b.startMs);

  const gaps = [];
  for (let i = 1; i < samples.length; i += 1) gaps.push((samples[i].startMs - samples[i - 1].startMs) / 1000);
  const resolutionSec = median(gaps);

  const out = {
    faultStart: { atMs: faultStart.atMs, source: faultStart.source, label: faultStart.label },
    faultEnd: { atMs: faultEnd.atMs, source: faultEnd.source, label: faultEnd.label },
    resolutionSec,
    samples: samples.length,
  };
  if (!samples.length) return { ...out, status: 'no-data', reason: '헬스 표본이 없다' };

  const afterStart = samples.filter((s) => s.startMs >= faultStart.atMs);
  const firstBad = afterStart.find((s) => healthCause(s) !== 'up');
  if (!firstBad) {
    out.status = 'undetected';
    out.checkedSamples = afterStart.length;
    return out;
  }
  // 마지막 정상 표본은 실제 탐지 시각의 하한이다 — 그때까지는 정상이라고 확인됐다.
  // 장애 시작 이전 표본까지 본다. 폴링 간격 안에서 장애가 나면 그 하한이 음수가 되고,
  // 그 음수가 곧 "이 실험이 탐지 시각을 몇 초 폭으로만 안다"는 뜻이다.
  const lastGood = samples.filter((s) => s.doneMs < firstBad.doneMs && healthCause(s) === 'up').pop();
  out.status = 'detected';
  out.lagSec = Math.round((firstBad.doneMs - faultStart.atMs) / 100) / 10;
  out.cause = healthCause(firstBad);
  out.httpStatus = firstBad.httpStatus;
  out.detectedAt = firstBad.at;
  out.downComponents = Object.entries(firstBad.components || {}).filter(([, v]) => v !== 'UP').map(([k]) => k);
  // 직전 정상 표본이 있으면 실제 탐지 시각의 하한이 된다 — 그때까지는 정상이었다.
  out.lastGoodBeforeSec = lastGood ? Math.round((lastGood.doneMs - faultStart.atMs) / 100) / 10 : null;

  // 해제 — 장애를 걷은 뒤 헬스가 다시 정상을 보고하기까지. 앱 지표가 먼저 돌아와도
  // 헬스가 늦으면 앞단이 인스턴스를 그만큼 늦게 되돌린다.
  const afterEnd = samples.filter((s) => s.startMs >= faultEnd.atMs);
  const firstGood = afterEnd.find((s) => healthCause(s) === 'up');
  out.clearLagSec = firstGood ? Math.round((firstGood.doneMs - faultEnd.atMs) / 100) / 10 : null;
  out.clearedAt = firstGood ? firstGood.at : null;
  out.badAfterEnd = afterEnd.filter((s) => healthCause(s) !== 'up').length;
  return out;
}

/**
 * 실행 레코드 하나에서 회복 시간표와 탐지 지연을 만든다.
 *
 * @param {object} rec 저장된 실행 레코드(run.json). `t0`·`plan.phases`·`series`·`health`·`events` 를 쓴다.
 * @param {{holdSec?:number, warmupSkipSec?:number, maxGapSec?:number}} [options] 판단 규칙 덮어쓰기.
 * @returns {{rules:object, marks:object, metrics:object[], detection:object}|null}
 *   `t0` 나 구간 정보가 없어 기준 시각을 세울 수 없으면 `null`.
 */
function analyze(rec, options) {
  const opts = { ...DEFAULTS, ...(options || {}) };
  const t0Ms = Date.parse(rec && rec.t0);
  const phases = (rec && rec.plan && rec.plan.phases) || null;
  if (!Number.isFinite(t0Ms) || !phases || !Number.isFinite(phases.preSec) || !Number.isFinite(phases.faultSec)) return null;
  const marks = {
    t0Sec: t0Ms / 1000,
    faultStartSec: phases.preSec,
    faultEndSec: phases.preSec + phases.faultSec,
    postSec: phases.postSec,
  };
  const series = rec.series || {};
  const metrics = METRIC_SPECS
    .filter((spec) => Array.isArray(series[spec.key]))
    .map((spec) => recoveryOf(series[spec.key], spec, marks, opts));
  return { rules: opts, marks, metrics, detection: detectionLag(rec) };
}

module.exports = { analyze, recoveryOf, detectionLag, injectMoment, bandLimit, median, METRIC_SPECS, DEFAULTS };
