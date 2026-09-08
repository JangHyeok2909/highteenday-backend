/**
 * 장애 계획(faults/*.json)의 순수 로직 — 검증, 주입 시각 계산, 구간 창, phase 이름 되돌리기.
 *
 * 부수효과가 없다. 실행기(fault-run.js)와 테스트(test/plan.test.js)가 같은 함수를 쓴다.
 * "시각을 판단으로 바꾸는" 계산은 여기 모아 두어 테스트가 붙는다.
 */
'use strict';

const TOOLS = new Set(['toxiproxy', 'docker', 'pumba', 'shell']);
const AT_PATTERN = /^(fault\.start|fault\.end|run\.start|run\.end)(?:([+-])(\d+(?:\.\d+)?))?$/;

/**
 * k6 phase 이름 → 실험 구간 이름.
 * scenarios/fault-window.js 가 warmup/measure/rampdown 세 칸을 빌려 쓴 사정은 그 파일 머리에.
 */
const PHASE_LABELS = { warmup: 'pre', measure: 'fault', rampdown: 'post' };
const PHASE_ORDER = ['pre', 'fault', 'post'];

function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['계획이 객체가 아니다'];
  if (!plan.id || !/^[a-z0-9][a-z0-9-]*$/.test(plan.id)) errors.push('id 는 소문자·숫자·하이픈이어야 한다');
  if (!plan.question) errors.push('question 이 없다 — 이 실험이 답하는 질문을 한 줄로');
  const ph = plan.phases || {};
  for (const k of ['preSec', 'faultSec', 'postSec']) {
    if (!Number.isFinite(ph[k]) || ph[k] < 0) errors.push(`phases.${k} 가 0 이상의 숫자가 아니다`);
  }
  if (Number.isFinite(ph.faultSec) && ph.faultSec === 0) errors.push('phases.faultSec 가 0 이면 장애 구간이 없다');
  const load = plan.load || {};
  if (!Number.isFinite(load.rate) || load.rate <= 0) errors.push('load.rate 는 양수(초당 iteration)여야 한다');
  if (!Array.isArray(plan.inject) || plan.inject.length === 0) errors.push('inject 가 비어 있다');
  (plan.inject || []).forEach((step, i) => {
    const where = `inject[${i}]`;
    if (!TOOLS.has(step.tool)) errors.push(`${where}.tool 을 모른다: ${step.tool}`);
    if (typeof step.at === 'number') {
      if (step.at < 0) errors.push(`${where}.at 이 음수다`);
    } else if (!AT_PATTERN.test(String(step.at))) {
      errors.push(`${where}.at 형식이 아니다: ${step.at} (fault.start | fault.end | run.start | run.end | 위에 +N/-N 초, 또는 숫자)`);
    }
    if (step.tool === 'toxiproxy') {
      if (!step.proxy) errors.push(`${where}: toxiproxy step 에 proxy 가 없다`);
      if (step.action === 'add' && !(step.toxic && step.toxic.name && step.toxic.type)) errors.push(`${where}: add 에는 toxic{name,type} 이 필요하다`);
      if (step.action === 'remove' && !step.toxicName) errors.push(`${where}: remove 에는 toxicName 이 필요하다`);
      if (!['add', 'remove', 'enable', 'disable'].includes(step.action)) errors.push(`${where}: toxiproxy action 을 모른다: ${step.action}`);
    }
    if (step.tool === 'docker' && !step.container) errors.push(`${where}: docker step 에 container 가 없다`);
    if (step.tool === 'pumba' && !Array.isArray(step.args)) errors.push(`${where}: pumba step 에 args 배열이 없다`);
    if (step.tool === 'shell' && !Array.isArray(step.argv)) errors.push(`${where}: shell step 에 argv 배열이 없다`);
  });
  if (!Array.isArray(plan.expect) || plan.expect.length === 0) errors.push('expect 가 비어 있다 — 가설 없는 실험은 관측이 아니라 구경이다');
  return errors;
}

/** 'fault.start+30' 같은 표현을 실행 시작 기준 초로 푼다. */
function resolveAt(at, phases) {
  if (typeof at === 'number') return at;
  const m = AT_PATTERN.exec(String(at));
  if (!m) throw new Error(`at 을 해석할 수 없다: ${at}`);
  const anchors = {
    'run.start': 0,
    'fault.start': phases.preSec,
    'fault.end': phases.preSec + phases.faultSec,
    'run.end': phases.preSec + phases.faultSec + phases.postSec,
  };
  const base = anchors[m[1]];
  const offset = m[3] ? Number(m[3]) * (m[2] === '-' ? -1 : 1) : 0;
  return base + offset;
}

/** 주입 절차를 실행 시각(초) 순으로 정렬한 배열로. 각 항목에 plannedAtSec 가 붙는다. */
function schedule(plan) {
  return plan.inject
    .map((step, index) => ({ ...step, index, plannedAtSec: resolveAt(step.at, plan.phases) }))
    .sort((a, b) => a.plannedAtSec - b.plannedAtSec || a.index - b.index);
}

/** 총 실행 길이(초). */
function totalSec(phases) {
  return phases.preSec + phases.faultSec + phases.postSec;
}

/**
 * 세 구간의 절대 시각 창. t0 = k6 부하가 시작된 시각(Date).
 * durationSec 는 최소 1 — collectInfra 의 $RANGE 치환이 0 을 못 받는다.
 */
function phaseWindows(t0, phases) {
  const start = t0.getTime();
  const bounds = {
    pre: [0, phases.preSec],
    fault: [phases.preSec, phases.preSec + phases.faultSec],
    post: [phases.preSec + phases.faultSec, totalSec(phases)],
  };
  const out = {};
  for (const name of PHASE_ORDER) {
    const [a, b] = bounds[name];
    if (b <= a) continue;
    out[name] = {
      from: new Date(start + a * 1000),
      to: new Date(start + b * 1000),
      durationSec: Math.max(1, b - a),
      mode: `fault-window:${name}`,
      incomplete: false,
    };
  }
  return out;
}

/** k6 요약의 phases{warmup,measure,rampdown} → {pre,fault,post}. 없는 구간은 생략. */
function relabelPhases(k6Phases) {
  const out = {};
  for (const [k6Name, label] of Object.entries(PHASE_LABELS)) {
    if (k6Phases && k6Phases[k6Name]) out[label] = k6Phases[k6Name];
  }
  return out;
}

/**
 * summary.js 의 breakdown 은 `out[axis][value] = {count, ...trendStats, byPhase:{<k6 phase>:{...}}}`
 * 구조다. byPhase 의 키만 pre/fault/post 로 바꾼다. 나머지는 건드리지 않는다.
 */
function relabelBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return breakdown;
  const out = {};
  for (const [axis, values] of Object.entries(breakdown)) {
    out[axis] = {};
    for (const [value, cellIn] of Object.entries(values || {})) {
      const cell = { ...cellIn };
      if (cell.byPhase) {
        const byPhase = {};
        for (const [k, v] of Object.entries(cell.byPhase)) byPhase[PHASE_LABELS[k] || k] = v;
        cell.byPhase = byPhase;
      }
      out[axis][value] = cell;
    }
  }
  return out;
}

/**
 * 폭발 반경 표 — 기능(feature) × 구간(pre/fault/post) 의 요청 수·p95·오류율.
 * breakdown() 은 오류율을 다루지 않으므로 rawMetrics 의 `http_req_failed{feature,phase}` 를
 * 직접 읽는다. 장애 의존성을 안 쓰는 기능의 오류율이 fault 구간에 오르면 폭발 반경이 그쪽까지다.
 */
function featureByPhase(rawMetrics, features) {
  const out = {};
  for (const feature of features) {
    const row = {};
    for (const [k6Name, label] of Object.entries(PHASE_LABELS)) {
      const dur = rawMetrics && rawMetrics[`http_req_duration{feature:${feature},phase:${k6Name}}`];
      const reqs = rawMetrics && rawMetrics[`http_reqs{feature:${feature},phase:${k6Name}}`];
      const failed = rawMetrics && rawMetrics[`http_req_failed{feature:${feature},phase:${k6Name}}`];
      const count = reqs && reqs.values ? reqs.values.count : null;
      if (!(count > 0)) { row[label] = { count: count || 0, p95: null, max: null, errorRate: null }; continue; }
      row[label] = {
        count,
        p95: dur && dur.values ? dur.values['p(95)'] : null,
        max: dur && dur.values ? dur.values.max : null,
        errorRate: failed && failed.values && failed.values.rate != null ? failed.values.rate : null,
      };
    }
    out[feature] = row;
  }
  return out;
}

/**
 * 실패 요청의 지연 분포 — k6 rawMetrics 의 `http_req_duration{expected_response:false,phase:X}`.
 * 실패 지연 보장("즉시 실패인가 60초 뒤 실패인가")의 직접 증거다.
 */
function failedLatencyByPhase(rawMetrics) {
  const out = {};
  for (const [k6Name, label] of Object.entries(PHASE_LABELS)) {
    const dur = rawMetrics && rawMetrics[`http_req_duration{expected_response:false,phase:${k6Name}}`];
    const cnt = rawMetrics && rawMetrics[`http_reqs{expected_response:false,phase:${k6Name}}`];
    const count = cnt && cnt.values ? cnt.values.count : null;
    if (!dur || !dur.values || !(count > 0)) { out[label] = { count: count || 0 }; continue; }
    const v = dur.values;
    out[label] = {
      count,
      med: v.med != null ? v.med : v['p(50)'],
      p90: v['p(90)'],
      p95: v['p(95)'],
      max: v.max,
    };
  }
  return out;
}

module.exports = {
  PHASE_LABELS, PHASE_ORDER, TOOLS,
  validatePlan, resolveAt, schedule, totalSec, phaseWindows,
  relabelPhases, relabelBreakdown, failedLatencyByPhase, featureByPhase,
};
