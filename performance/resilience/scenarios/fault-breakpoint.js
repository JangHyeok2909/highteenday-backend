/**
 * fault-breakpoint — 장애 중 용량 한계를 재는 부하. 장애를 켜 둔 채 도착률을 계단식으로 올린다.
 *
 * fault-window 와 무엇이 다른가
 * -----------------------------
 * fault-window 는 도착률을 고정하고 장애만 변수로 둔다. 그래서 "같은 부하에서 장애가 무엇을
 * 바꾸나"에 답한다. 이 시나리오는 반대로 장애를 켜 둔 채 도착률을 올려 "장애 중에는 어디까지
 * 버티나"에 답한다. 두 질문의 답이 모두 있어야 "장애가 용량을 얼마나 깎았나"를 뺄셈으로 말할
 * 수 있다.
 *
 * 무장애 상한은 scenarios/breakpoint.js 가 잰다. 계단 값과 전환·유지 길이를 그쪽과 같게 주지
 * 않으면 두 상한이 다른 부하에서 나온 값이 되어 뺄셈이 성립하지 않는다.
 *
 * 구간과 계단의 관계
 * ------------------
 * 구간은 fault-window 와 같이 셋이다(pre → fault → post). 계단은 **fault 구간 안에만** 둔다.
 * 주입은 실행기가 pre 끝에 걸고 fault 끝에 걷으므로, 계단이 fault 구간을 벗어나면 장애가
 * 없는 상태에서 잰 계단이 섞인다.
 *
 *   pre    기준 도착률 유지 — 같은 실행 안의 무장애 대조군
 *   fault  계단식 상승 — 전 구간 장애 유지
 *   post   기준 도착률로 복귀 — 회복 관측
 *
 * FAULT 길이는 계단 총합과 정확히 같아야 한다. 어긋나면 램프 도중에 장애가 걷히는데, k6 도
 * 실행기도 그걸 오류로 보지 않아 리포트가 정상으로 나온다. 그래서 여기서 먼저 막는다.
 *
 * phase 이름의 사정은 fault-window.js 와 같다. warmup=pre, measure=fault, rampdown=post 로
 * 세 칸을 빌려 쓰고, 되돌리기는 fault-run.js 가 한다.
 *
 * 환경변수 (fault-run.js 가 넘긴다)
 *   FAULT_ID   장애 계획 id — 요약 파일 이름에 들어간다
 *   PRE / FAULT / POST   구간 길이(초)
 *   RATE       pre·post 의 기준 도착률(초당 iteration)
 *   STEPS      fault 구간의 계단 목록, 쉼표 구분 (예: 30,40,50,60,70)
 *   STEP_RAMP / STEP_HOLD  계단 하나의 전환·유지 길이(초)
 *   PRE_VUS / MAX_VUS
 *   RUNS_DIR   요약 파일 위치 — resilience/reports/staging
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
const PRE = toSeconds(__ENV.PRE, 180);
const FAULT = toSeconds(__ENV.FAULT, 600);
const POST = toSeconds(__ENV.POST, 180);

const STEPS = String(__ENV.STEPS || '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const STEP_RAMP = toSeconds(__ENV.STEP_RAMP, 30);
const STEP_HOLD = toSeconds(__ENV.STEP_HOLD, 90);

if (!STEPS.length) {
  throw new Error('STEPS 가 비었다 — 계단 목록 없이는 장애 중 용량을 잴 수 없다');
}
const STEPS_TOTAL_SEC = STEPS.length * (STEP_RAMP + STEP_HOLD);
if (STEPS_TOTAL_SEC !== FAULT) {
  // 어긋나면 램프 도중에 장애가 걷히고, 그 뒤 계단은 무장애 상태에서 잰 값이 된다.
  // k6 도 실행기도 이걸 오류로 보지 않으므로 리포트는 정상으로 나온다 — 여기서 막는다.
  throw new Error(
    `FAULT(${FAULT}s) 와 계단 총합(${STEPS.length}단 × (${STEP_RAMP}+${STEP_HOLD})s = ${STEPS_TOTAL_SEC}s) 이 다르다`,
  );
}

const PLAN = buildPhasePlan({
  mode: 'fault-window',
  warmupSec: PRE,
  measureSec: FAULT,
  rampdownSec: POST,
  gatePhase: null, // 판정 없음 — 세 구간은 전부 관측 대상이다
});
setActivePhasePlan(PLAN);

/**
 * 장애 실험에서만 필요한 집계 축. 정의와 이유는 fault-window.js 와 같다.
 *
 * 목록을 여기 다시 두는 이유: 두 시나리오가 같은 축을 내야 fault-run.js 의 읽는 쪽
 * (WATCH_STATUS·CONTENT_CHECK_NAMES)과 리포트가 그대로 동작한다. 공용 모듈로 뺄지는
 * 아직 정하지 않았으므로, 지금은 어느 한쪽만 고치면 리포트에 빈 축이 생긴다는 점을 적어 둔다.
 */
const FEATURES = [
  'auth', 'post', 'comment', 'board', 'reaction', 'scrap',
  'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot',
];
const PHASES = ['warmup', 'measure', 'rampdown'];
const WATCH_STATUS = ['0', '401', '429', '500', '502', '503', '504'];
const CONTENT_CHECK_NAMES = [
  'board_list_nonempty', 'hot_daily_nonempty', 'post_list_nonempty', 'post_detail_has_id',
];

const FAULT_AXES = {};
for (const phase of PHASES) {
  for (const name of CONTENT_CHECK_NAMES) {
    FAULT_AXES[buildSelector('checks', { check: name, phase })] = ['rate>=0'];
  }
  FAULT_AXES[buildSelector('http_req_duration', { expected_response: 'false', phase })] = ['p(99)<600000'];
  FAULT_AXES[buildSelector('http_req_duration', { expected_response: 'true', phase })] = ['p(99)<600000'];
  FAULT_AXES[buildSelector('http_reqs', { expected_response: 'false', phase })] = ['count>=0'];
  for (const status of WATCH_STATUS) {
    FAULT_AXES[buildSelector('http_reqs', { phase, status })] = ['count>=0'];
    FAULT_AXES[buildSelector('http_req_duration', { phase, status })] = ['p(99)<600000'];
  }
  for (const feature of FEATURES) {
    FAULT_AXES[buildSelector('http_req_duration', { feature, phase })] = ['p(99)<600000'];
    FAULT_AXES[buildSelector('http_reqs', { feature, phase })] = ['count>=0'];
    FAULT_AXES[buildSelector('http_req_failed', { feature, phase })] = ['rate<=1'];
  }
}

export const options = {
  scenarios: {
    fault_breakpoint: {
      executor: 'ramping-arrival-rate',
      // pre 를 평평하게 만들려면 시작 도착률이 pre 목표와 같아야 한다. 낮게 두면 pre 가
      // 램프가 되어 대조군 구실을 못 한다.
      startRate: RATE,
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 2000),
      stages: [
        { duration: `${PRE}s`, target: RATE },
        ...STEPS.flatMap((target) => [
          { duration: `${STEP_RAMP}s`, target },
          { duration: `${STEP_HOLD}s`, target },
        ]),
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
 * 주입 타이머를 건다. 실패해도 실험은 계속한다 — 그 경우 실행기가 spawn 시각으로 폴백한다.
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
