/**
 * Threshold 선언 — "무엇을 어떤 구간에서 판정하는가"를 한 곳에 모은다.
 *
 * config.js에서 분리한 이유는 두 가지다.
 *   1. 여기 있는 값은 전부 순수 데이터 조립이라 k6 런타임 API가 필요 없다. phases.js와
 *      같은 성질이므로, Node 테스트가 `await import()`로 직접 로드해 키 구성을 검증할 수
 *      있다(tools/test/thresholds.test.js). config.js는 `k6/http` 등을 import하므로
 *      plain Node에서 로드 자체가 실패한다.
 *   2. "판정 기준"과 "k6 런타임 연결(tags/check/쿠키 저장소)"은 바뀌는 이유가 다르다.
 *
 * 기존 호출부(시나리오·스크립트 30여 개)는 계속 config.js에서 가져다 쓴다 — config.js가
 * 이 파일을 그대로 재수출한다.
 *
 * ── 평가 범위 요약 ───────────────────────────────────────────────────────────
 *   DEFAULT_THRESHOLDS  phase를 쓰지 않는 실행(단독 스크립트·진단 시나리오) → 전체 구간
 *   PHASED_THRESHOLDS   phase를 쓰는 시나리오                              → measure 구간
 * 두 경우 모두 기준값 자체는 COMMON_SLO_THRESHOLDS 하나에서 나온다.
 */
import { scopeThresholds, buildSelector } from './phases.js';

/**
 * 기능별 분해 지표를 "만들어 내기 위한" 임계값.
 *
 * k6는 threshold에 태그 필터가 걸린 항목에 대해서만 서브메트릭
 * (`http_req_duration{feature:post}`)을 생성한다. 즉 "어느 기능이 느린가"를 리포트에
 * 담으려면 그 축을 threshold로 선언해 두는 수밖에 없다.
 *
 * 그래서 판정에 영향을 주지 않을 만큼 느슨한 상한(p(99)<600000 = 10분)을 건다.
 * 목적은 통과/실패 판정이 아니라 **집계 축 생성**이다.
 * (리포트는 이 느슨한 항목을 SLO 목록에서 걸러낸다.)
 *
 * 값은 실제 tags() 호출의 첫 인자와 정확히 일치해야 한다 (단수형 — 'post', 'board').
 * 오타가 나면 조용히 빈 축이 생길 뿐 에러가 안 나므로, 아래 명령으로 대조한다:
 *   grep -rhoE "tags\('([a-z_-]+)'" scripts/ scenarios/ | sort -u
 */
const BREAKDOWN_FEATURES = [
  'auth', 'post', 'comment', 'board', 'reaction', 'scrap',
  'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot',
];

export const BREAKDOWN_THRESHOLDS = {
  ...BREAKDOWN_FEATURES.reduce((acc, f) => {
    acc[buildSelector('http_req_duration', { feature: f })] = ['p(99)<600000'];
    return acc;
  }, {}),
  // 인증은 도메인 쓰기 SLO에서 분리하되 별도 응답시간 분포는 리포트에 남긴다(S-02).
  [buildSelector('http_req_duration', { op: 'auth' })]: ['p(99)<600000'],
};

/**
 * 공통 SLO — 판정 기준 그 자체. 태그가 붙지 않은 순수한 형태로 선언해 둔다.
 * 근거: 커뮤니티 서비스 체감 기준 (Google RAIL: 응답 1s 이내 체감 양호)
 *  - 읽기 P95 300ms, 쓰기 P95 500ms, 오류율 1% 미만
 *
 * 여기에 phase 태그를 섞지 않는 이유: 같은 기준을 두 가지 범위로 써야 하기 때문이다.
 * phase가 없는 실행은 전체 구간에(DEFAULT_THRESHOLDS), phase가 있는 실행은 measure
 * 구간에만(PHASED_THRESHOLDS) 적용한다. 기준값 자체는 한 곳에서만 정의해 두 경로가
 * 갈라지지 않게 한다.
 */
export const COMMON_SLO_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{op:read}': ['p(95)<300', 'p(99)<800'],
  'http_req_duration{op:write}': ['p(95)<500', 'p(99)<1200'],
  checks: ['rate>0.99'],
};

/**
 * phase 태깅을 쓰지 않는 실행(단독 스크립트, 진단 전용 시나리오)의 threshold.
 * 공통 SLO가 실행 전체 구간에 적용된다 — phase 개념이 없으므로 잘라낼 구간도 없다.
 *
 * 분해축을 여기에 병합해 두는 이유: 모든 단독 스크립트가 이미 이 상수를 쓰고 있다.
 * 여기서 합쳐 두면 호출부를 한 줄도 안 고치고 전부에 분해 통계가 생긴다.
 * 실제 SLO 항목이 뒤에 오므로 키가 겹쳐도 SLO 쪽이 이긴다.
 */
export const DEFAULT_THRESHOLDS = {
  ...BREAKDOWN_THRESHOLDS,
  ...COMMON_SLO_THRESHOLDS,
};

/**
 * phase(warmup/measure/rampdown)별로 p95·오류율·체크율·RPS·TPS를 뽑아내기 위한 threshold.
 *
 * BREAKDOWN_THRESHOLDS와 같은 이유로 존재한다 — k6는 threshold가 참조한 태그 조합에만
 * 서브메트릭을 만들어 주므로, 판정에 영향 없는 느슨한 상한으로 세 phase 축을 전부 선언해
 * 둔다. 여기 있는 값은 판정이 아니라 집계 축 생성이 목적이므로 **어떤 값에도 통과**해야
 * 한다 — warmup이 아무리 나빠도 이 축 때문에 실행이 실패하면 안 된다.
 *
 * 오류율 축이 `rate<1`이 아니라 `rate<=1`인 이유: warmup 구간 요청이 전부 실패하면
 * (예: 기동 직후 커넥션 거부) rate가 정확히 1이 되어 `rate<1`은 FAIL이 된다. 실제로 k6로
 * 확인한 동작이며, 그러면 measure가 정상이어도 실행 전체가 실패한다. 상한을 1로 두되
 * 등호를 포함시켜 "무조건 통과하는 축"이라는 원래 의도를 지킨다.
 */
const PHASE_AXES = ['warmup', 'measure', 'rampdown'];

export const PHASE_DIAGNOSTIC_THRESHOLDS = PHASE_AXES.reduce((acc, phase) => {
  acc[buildSelector('http_req_duration', { phase })] = ['p(99)<600000'];
  acc[buildSelector('http_req_failed', { phase })] = ['rate<=1'];
  acc[buildSelector('checks', { phase })] = ['rate>=0'];
  acc[buildSelector('http_reqs', { phase })] = ['count>=0'];
  acc[buildSelector('phase_iterations', { phase })] = ['count>=0'];
  // k6 builtin iterations의 phase 축 — cache-warm처럼 executor를 phase별로 나눠 정적
  // 태깅하는 시나리오는 동적 phase 계산(setActivePhasePlan)을 켜지 않아 위의 커스텀
  // Counter가 비어 있다. 그 경우 phases.js가 이 축으로 폴백해 TPS를 계산한다.
  acc[buildSelector('iterations', { phase })] = ['count>=0'];
  return acc;
}, {});

/**
 * 시나리오 고유 SLO를 measure 구간으로 스코프한다.
 *
 * 시나리오가 PHASED_THRESHOLDS 위에 자기 기준(`http_req_duration{name:login}` 등)을 얹을
 * 때 이 함수를 통과시켜야 warmup/rampdown이 판정에 끼지 않는다. 태그 없는 키는
 * `{phase:measure}`가 붙고, 이미 태그가 있는 키는 거기에 phase가 병합된다. 키 문자열을
 * 손으로 조합하지 않는 것이 중요하다 — buildSelector()가 태그 이름을 정렬하므로,
 * 이 함수를 거쳐야 공통 게이트와 같은 키가 나와 값이 중복되지 않고 대체된다.
 *
 * 값(배열)은 그대로 통과하므로 abortOnFail·delayAbortEval 설정도 유지된다 — 중단 조건이
 * measure 구간의 데이터로만 평가된다는 점만 달라진다.
 */
export function measureOnly(thresholds) {
  return scopeThresholds(thresholds, { phase: 'measure' });
}

const MEASURE_GATED_THRESHOLDS = measureOnly(COMMON_SLO_THRESHOLDS);

/**
 * phase 태깅이 활성화된 시나리오(steady-state 회귀·cold-start·cache-warm)가 쓰는 집합.
 *
 * 실제 SLO는 measure 구간에만 건다 — 여기에 DEFAULT_THRESHOLDS(태그 없는 SLO)를 섞지
 * 않는 것이 핵심이다. 섞으면 같은 기준이 전체 구간과 measure 구간에 이중으로 걸려,
 * warmup의 JIT 컴파일·커넥션 풀 확장·캐시 미스로 생긴 느린 응답이나 오류가 measure
 * 구간 결과와 무관하게 실행 전체를 FAIL로 만든다. 그 구간을 판정에서 빼려고 warmup을
 * 선언한 것이므로 이중 적용은 그 선언을 무의미하게 만든다.
 *
 * 남는 두 축(BREAKDOWN_THRESHOLDS, PHASE_DIAGNOSTIC_THRESHOLDS)은 판정이 아니라 집계
 * 축 생성용이며 전체 구간에 그대로 남는다 — 기능별 분해와 phase별 요약이 그 축에서 나온다.
 *
 * 진단 전용 시나리오(stress/spike/breakpoint/chaos/failover)는 이걸 쓰지 않는다 —
 * 자체 abortOnFail threshold가 이미 판정 주체이고 phase 태깅 자체를 켜지 않는다.
 *
 * 전제: 이 상수를 쓰는 시나리오는 `phase_iterations` Counter를 등록하는 모듈
 * (scenarios/lib/workload.js)을 반드시 로드해야 한다. k6는 등록되지 않은 메트릭에 걸린
 * threshold를 만나면 실행을 시작하지 못하고 중단한다(실측 확인:
 * "invalid threshold defined on phase_iterations{phase:measure}").
 */
export const PHASED_THRESHOLDS = {
  ...BREAKDOWN_THRESHOLDS,
  ...PHASE_DIAGNOSTIC_THRESHOLDS,
  ...MEASURE_GATED_THRESHOLDS,
};

/**
 * abortOnFail의 평가 시작 시각을 measure 구간 시작 이후로 민다.
 *
 * k6의 delayAbortEval은 **테스트 시작 기준**이다. measure로 스코프된 threshold라도
 * 이 지연이 warmup보다 짧으면, measure 데이터가 거의 없는 상태(표본 몇 건)에서 평가가
 * 시작돼 이상치 하나로 실행이 중단될 수 있다. 그래서 "measure 시작 + 원래 의도했던
 * 관측 시간"으로 계산한다. 기준 수치 자체는 바꾸지 않는다 — 언제부터 보느냐만 옮긴다.
 *
 * @param {object} plan buildPhasePlan()이 만든 계획
 * @param {number} afterMeasureSec measure 시작 후 몇 초의 데이터를 모으고 평가할지
 * @returns {string} k6 delayAbortEval 값 (예: '420s')
 */
export function abortDelayAfterMeasure(plan, afterMeasureSec) {
  return `${plan.measureStartOffsetSec + afterMeasureSec}s`;
}
