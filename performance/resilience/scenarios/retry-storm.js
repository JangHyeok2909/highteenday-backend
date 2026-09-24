/**
 * retry-storm — 응답이 유실된 뒤의 재시도가 데이터를 사용자 의도와 다르게 남기는지 본다.
 *
 * 이 파일은 부하의 **틀**만 갖는다. 구간·도착률·집계 축·액션 고르기가 여기 있고, 액션마다
 * 무엇을 어떤 전제로 보내는지는 `lib/` 의 모듈에 있다. 목록은 `lib/idempotency-actions.js`.
 *
 * 이 실험이 답하는 질문
 * ---------------------
 * 클라이언트는 응답을 못 받았을 때 "서버가 요청을 못 받았다"와 "서버가 처리했는데 응답이
 * 유실됐다"를 구분할 수 없다. 둘 다 재시도로 이어지고, 두 번째 경우에는 같은 요청이 서버에
 * 두 번 도착한다. 그때 무엇이 틀어지는지를 엔드포인트 종류별로 센다.
 *
 * 세 가지 결함이 각각 다른 모양으로 나타난다(performance/cases/retry-after-lost-response.md).
 *
 *   토글   재시도가 방금 한 일을 취소한다. 판정: 의도 − 행 증가분 > 0
 *   생성   재시도가 같은 것을 하나 더 만든다. 판정: 행 증가분 − 의도 > 0
 *   세션   재시도가 로그아웃시킨다. 판정: 재시도가 401 을 받은 횟수 > 0
 *
 * 빠진 것은 `POST /api/media` 하나다. 산출물이 S3 객체라 DB 행 증가분으로 셀 수 없고, 이
 * 실험의 판정식이 전부 행 증가분 위에 서 있다.
 *
 * 오라클 — 결과가 맞는지 판정하는 근거
 * ------------------------------------
 * 응답으로는 판정할 수 없다. 정상으로 켜진 경우도 뒤집혀 꺼진 경우도 200 이다. 서버도 판정할
 * 수 없다. 두 번째 요청이 재시도인지 새로 누른 것인지 구분할 수단이 계약에 없다. 그래서 부하
 * 발생기가 센 "무엇을 하려 했는가"와 DB 를 실행 전후로 세서 뺀 "무엇이 남았는가"를 비교한다.
 *
 * 이 비교가 성립하려면 참이어야 하는 조건(전제)이 있다. 깨져도 식은 숫자를 계산해 내므로,
 * 틀린 숫자가 오류 없이 나온다.
 *   1. 토글은 켜기만 한다. 섞으면 한 쌍이 잘못 꺼지고 다른 쌍이 잘못 켜져 차이가 0 이 된다
 *   2. 토글은 한 대상을 두 번 안 건드린다. 뒤집힌 것을 다시 켜면 없는 결함이 하나 생긴다
 *   3. 토글은 꺼져 있는 것만 의도에 넣는다
 *   4. 생성의 재시도는 바이트가 같은 요청이다. 본문이 다르면 그건 새 요청이다
 *   5. 같은 테이블에 행을 만드는 다른 부하가 없다. 그래서 혼합 워크로드를 못 쓴다
 * 1~4 는 각 액션 모듈이 지키고 5 는 이 파일이 지킨다. 전제가 지켜졌는지는 무고장 기준선
 * 실행(faults/retry-storm-baseline.json)에서 결함이 전부 0 으로 나오는지로 확인한다.
 *
 * 고장은 어디에 거나
 * ------------------
 * 앱 앞 toxiproxy 의 `stream: downstream` timeout toxic 이다(faults/retry-storm.json).
 * 요청은 앱까지 그대로 가고 응답만 막힌다. `@Transactional` 은 메서드가 반환할 때 커밋되고
 * 응답 직렬화는 그 뒤이므로, 응답이 막혀도 DB 변경은 남는다.
 *
 * phase 이름은 fault-window.js 와 같은 사정으로 warmup/measure/rampdown 을 빌린다.
 *
 * 환경변수 (fault-run.js 가 넘긴다)
 *   FAULT_ID / PRE / FAULT / POST / RATE / PRE_VUS / MAX_VUS / RUNS_DIR / DRIVER_URL / BASE_URL
 *   RETRY_DELAY / REQ_TIMEOUT   lib/attempt.js 참고
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { thinkTime, currentPhase, setActivePhasePlan } from '../../scripts/lib/config.js';
import { buildPhasePlan, toSeconds, buildSelector } from '../../scripts/lib/phases.js';
import { BREAKDOWN_THRESHOLDS, PHASE_DIAGNOSTIC_THRESHOLDS } from '../../scripts/lib/thresholds.js';
import { makeHandleSummary } from '../../scripts/lib/summary.js';
import { ensureSession } from '../../scripts/lib/session.js';
import { myUser } from '../../scripts/lib/data.js';
import { idemSkipped } from './lib/attempt.js';
import { ACTIONS, ACTION_KEYS } from './lib/idempotency-actions.js';

const FAULT_ID = __ENV.FAULT_ID || 'unnamed';
const RATE = Number(__ENV.RATE || 2);
const PRE = toSeconds(__ENV.PRE, 180);
const FAULT = toSeconds(__ENV.FAULT, 180);
const POST = toSeconds(__ENV.POST, 180);

const PLAN = buildPhasePlan({
  mode: 'retry-storm',
  warmupSec: PRE,
  measureSec: FAULT,
  rampdownSec: POST,
  gatePhase: null,
});
setActivePhasePlan(PLAN);

/**
 * 구간별 iteration 수. `PHASE_DIAGNOSTIC_THRESHOLDS` 가 이 이름에 임계를 걸므로 **등록하지
 * 않으면 k6 가 실행을 시작하지 못하고 중단한다** ("invalid threshold defined on
 * phase_iterations{phase:measure}"). 그 전제는 scripts/lib/thresholds.js 주석에 적혀 있다.
 * 다른 시나리오는 `scenarios/lib/workload.js` 를 로드하면서 얻는데, 이 시나리오는 혼합
 * 워크로드를 쓰지 않으므로 여기서 직접 등록하고 직접 센다.
 */
const phaseIterations = new Counter('phase_iterations');

const FEATURES = ['auth', 'post', 'comment', 'reaction', 'scrap', 'chat', 'friend'];
const PHASES = ['warmup', 'measure', 'rampdown'];

/** fault-run.js 의 WATCH_STATUS 와 같아야 한다. 어긋나면 그 코드가 표에서 사라진다. */
const WATCH_STATUS = ['0', '401', '429', '500', '502', '503', '504'];

/** readPost 가 부르는 내용 검사. 이름은 scripts/posts.js 와 fault-run.js 셋이 같아야 한다. */
const CONTENT_CHECK_NAMES = ['post_detail_has_id'];

const FAULT_AXES = {};
// k6 는 threshold 가 걸린 서브메트릭만 요약에 싣는다. 액션별 카운터를 여기서 선언하지 않으면
// 값은 쌓이는데 요약에 안 나와 판정이 통째로 "카운터가 없다" 가 된다. 액션 목록에서 바로
// 만들므로 액션을 추가해도 이 파일은 안 고친다.
for (const action of ACTION_KEYS) {
  for (const metric of ['idem_intent', 'idem_retried', 'idem_unknown', 'idem_skipped']) {
    FAULT_AXES[buildSelector(metric, { action })] = ['count>=0'];
  }
}
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
  // toxiproxy 의 `toxicity` 는 요청이 아니라 **연결** 단위 확률이다. keep-alive 로 연결을
  // 재사용하면 VU 하나가 연결 하나를 오래 쓰므로, 0.3 을 걸어도 실제로 응답을 잃는 요청의
  // 비율이 훨씬 낮아진다(실측: 20초 87요청에 실패 1건). 연결 재사용을 끄면 요청마다 새 연결이
  // 열려 toxicity 가 곧 요청 단위 확률이 되고, 계획 파일의 건수 계산이 그대로 성립한다.
  // 이 실험은 응답 시간을 재지 않으므로 핸드셰이크가 늘어나는 대가는 판정에 영향이 없다.
  noConnectionReuse: true,
  scenarios: {
    retry_storm: {
      executor: 'ramping-arrival-rate',
      startRate: RATE,
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.PRE_VUS || 50),
      maxVUs: Number(__ENV.MAX_VUS || 300),
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

export function setup() {
  if (__ENV.DRIVER_URL) {
    http.get(`${__ENV.DRIVER_URL}/started`, { timeout: '2s', tags: { name: 'driver' } });
  }
}

export default function () {
  // 로그인은 pre 구간에 끝나 있어야 한다. `ensureSession` 은 쿠키가 없을 때만 로그인하고,
  // pre 180초 × 2건/초 = 360 iteration 이면 VU 대부분이 그 사이에 세션을 갖는다. 장애 중에
  // 처음 로그인하는 VU 는 로그인 응답도 toxic 에 걸릴 수 있는데, 그때는 login() 이 fail() 로
  // iteration 을 끊으므로 의도에 들어가지 않는다 — 판정이 오염되지는 않는다.
  const user = ensureSession(myUser());

  // 액션을 같은 비중으로 고른다. 가중치를 다르게 두면 표본이 적은 액션의 판정이 먼저
  // 무의미해지는데, 어느 것이 더 중요한지는 이 실험이 답할 질문이 아니다.
  const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  if (!a.run(user)) idemSkipped.add(1, { action: a.key });

  sleep(thinkTime());
  const phase = currentPhase();
  if (phase) phaseIterations.add(1, { phase });
}

export function teardown() {
  if (__ENV.DRIVER_URL) {
    http.get(`${__ENV.DRIVER_URL}/finished`, { timeout: '2s', tags: { name: 'driver' } });
  }
}

export const handleSummary = makeHandleSummary(`fault-${FAULT_ID}`, PLAN);
