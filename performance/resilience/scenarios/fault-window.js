/**
 * fault-window — 장애 실험용 부하. 평시 부하를 일정하게 유지하고 장애만 변수로 둔다.
 *
 * 구간 셋: pre(장애 전) → fault(장애 중) → post(복구 뒤). 세 구간 모두 **같은 도착률**이다.
 * 기준은 다른 실행이 아니라 이 실행의 pre 구간이다(resilience/README.md).
 *
 * phase 이름의 사정
 * -----------------
 * scripts/lib 의 phase 기계(phases.js, config.js currentPhase, thresholds.js PHASE_AXES)는
 * warmup/measure/rampdown 세 이름을 고정으로 쓴다. 공유 코드를 건드리지 않으려고 그 세 칸을
 * 그대로 빌린다.
 *
 *   warmup  = pre      measure = fault      rampdown = post
 *
 * 단, ratesFor() 는 rampdown 을 0 으로 내리므로 쓰지 않는다 — post 구간도 같은 도착률이어야
 * 회복을 잴 수 있다. stages 는 여기서 직접 만든다. 이름 되돌리기(relabel)는 fault-run.js 가
 * 한다. k6 원본(k6.json)에는 warmup/measure/rampdown 그대로 남는다.
 *
 * 왜 open model 인가
 * ------------------
 * 기존 failover.js 는 150 VU 고정(closed model)이라 장애 효과와 포화 효과가 섞인다(포트폴리오
 * 6장: 200 VU 에서 p95 10초). 도착률을 고정하면 장애 중 시스템이 못 따라와도 부하가 줄지 않고
 * dropped_iterations 로 드러난다. 장애 중 VU 가 크게 늘어나는 것(요청이 60초씩 매달리므로)이
 * 정상이라 maxVUs 를 넉넉히 잡는다.
 *
 * 환경변수 (fault-run.js 가 넘긴다)
 *   FAULT_ID   장애 계획 id — 요약 파일 이름에 들어간다
 *   PRE / FAULT / POST   구간 길이(초)
 *   RATE       초당 iteration
 *   PRE_VUS / MAX_VUS
 *   RUNS_DIR   요약 파일 위치 — resilience/reports/staging (perf 의 reports/runs 와 분리)
 *   DRIVER_URL 실행기의 로컬 HTTP 주소 — setup() 이 여기에 "시작" 신호를 보내 주입 시각을 맞춘다
 */
import http from 'k6/http';
import { setActivePhasePlan } from '../../scripts/lib/config.js';
import { buildPhasePlan, toSeconds, buildSelector } from '../../scripts/lib/phases.js';
import { BREAKDOWN_THRESHOLDS, PHASE_DIAGNOSTIC_THRESHOLDS } from '../../scripts/lib/thresholds.js';
import { makeHandleSummary } from '../../scripts/lib/summary.js';
import { mixedIteration, PROFILE_NORMAL } from '../../scenarios/lib/workload.js';

const FAULT_ID = __ENV.FAULT_ID || 'unnamed';
const RATE = Number(__ENV.RATE || 4);
const PRE = toSeconds(__ENV.PRE, 300);
const FAULT = toSeconds(__ENV.FAULT, 60);
const POST = toSeconds(__ENV.POST, 300);

const PLAN = buildPhasePlan({
  mode: 'fault-window',
  warmupSec: PRE,
  measureSec: FAULT,
  rampdownSec: POST,
  gatePhase: null, // 판정 없음 — 세 구간은 전부 관측 대상이다
});
setActivePhasePlan(PLAN);

/**
 * 장애 실험에서만 필요한 집계 축.
 *
 * - `expected_response:false` × phase — **실패한 요청의 지연 분포.** "즉시 실패했나, 30초/60초
 *   기다린 뒤 실패했나"가 실패 지연 보장의 핵심인데, 성공·실패를 섞은 p95 로는 안 보인다.
 * - feature × phase — 폭발 반경. 장애 의존성을 안 쓰는 기능이 같이 죽는지를 구간별로 본다.
 *   summary.js 의 breakdown() 이 {feature, phase} 2태그를 scope 별로 묶어 준다.
 *
 * 값은 전부 느슨하다. 판정이 아니라 서브메트릭 생성이 목적이다(thresholds.js 의 관례).
 */
const FEATURES = [
  'auth', 'post', 'comment', 'board', 'reaction', 'scrap',
  'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot',
];
const PHASES = ['warmup', 'measure', 'rampdown'];

const FAULT_AXES = {};
for (const phase of PHASES) {
  FAULT_AXES[buildSelector('http_req_duration', { expected_response: 'false', phase })] = ['p(99)<600000'];
  FAULT_AXES[buildSelector('http_req_duration', { expected_response: 'true', phase })] = ['p(99)<600000'];
  FAULT_AXES[buildSelector('http_reqs', { expected_response: 'false', phase })] = ['count>=0'];
  for (const feature of FEATURES) {
    FAULT_AXES[buildSelector('http_req_duration', { feature, phase })] = ['p(99)<600000'];
    FAULT_AXES[buildSelector('http_reqs', { feature, phase })] = ['count>=0'];
    FAULT_AXES[buildSelector('http_req_failed', { feature, phase })] = ['rate<=1'];
  }
}

export const options = {
  scenarios: {
    fault_window: {
      executor: 'ramping-arrival-rate',
      startRate: RATE,
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
      // 세 구간 모두 같은 도착률. 경계는 phase 계산(경과 시간)이 맡으므로 stage 경계는
      // 정보용이다 — 그래도 계획과 같은 길이로 맞춰 둔다.
      stages: [
        { duration: `${PRE}s`, target: RATE },
        { duration: `${FAULT}s`, target: RATE },
        { duration: `${POST}s`, target: RATE },
      ],
    },
  },
  thresholds: {
    ...BREAKDOWN_THRESHOLDS,
    ...PHASE_DIAGNOSTIC_THRESHOLDS,
    ...FAULT_AXES,
  },
};

/**
 * 시작 신호. setup() 은 VU 가 돌기 직전에 한 번 실행되므로, 실행기는 이 시각을 t0 으로 잡아
 * 주입 타이머를 건다. k6 프로세스 spawn 시각을 쓰면 스크립트 로딩·VU 초기화(수 초)만큼
 * 어긋난다. 실패해도 실험은 계속한다 — 그 경우 실행기가 spawn 시각으로 폴백한다.
 */
export function setup() {
  if (__ENV.DRIVER_URL) {
    http.get(`${__ENV.DRIVER_URL}/started`, { timeout: '2s', tags: { name: 'driver' } });
  }
}

export default function () {
  mixedIteration(PROFILE_NORMAL);
}

export function teardown() {
  if (__ENV.DRIVER_URL) {
    http.get(`${__ENV.DRIVER_URL}/finished`, { timeout: '2s', tags: { name: 'driver' } });
  }
}

export const handleSummary = makeHandleSummary(`fault-${FAULT_ID}`, PLAN);
