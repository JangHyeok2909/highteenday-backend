/**
 * Threshold 선언 — 어떤 기준으로 무엇을 판정할지 한 곳에 모은다.
 *
 * config.js 에서 그대로 떼어 온 것이고 값은 하나도 바뀌지 않았다. 분리한 이유는
 * config.js 가 `k6/http` 등 k6 런타임 전용 모듈을 import 해서 plain Node 가 로드할 수
 * 없기 때문이다 — 이 파일은 순수 데이터 조립뿐이라 Node 테스트가 직접 검증할 수 있다
 * (phases.js 와 같은 성질).
 *
 * 호출부(시나리오·스크립트 30여 개)는 계속 config.js 에서 가져다 쓴다. config.js 가
 * 이 파일을 그대로 재수출한다.
 */
import { scopeThresholds, buildSelector } from './phases.js';

/**
 * 기능별 분해 지표를 "만들어 내기 위한" 임계값.
 *
 * k6는 threshold에 태그 필터가 걸린 항목에 대해서만 서브메트릭
 * (`http_req_duration{feature:posts}`)을 생성한다. 즉 "어느 기능이 느린가"를 리포트에
 * 담으려면 그 축을 threshold로 선언해 두는 수밖에 없다.
 *
 * 그래서 판정에 영향을 주지 않을 만큼 느슨한 상한(p(99)<600000 = 10분)을 건다.
 * 목적은 통과/실패 판정이 아니라 **집계 축 생성**이다.
 * (리포트는 이 느슨한 항목을 SLO 목록에서 걸러낸다.)
 */
/**
 * 값은 실제 tags() 호출의 첫 인자와 정확히 일치해야 한다 (단수형 — 'post', 'board').
 * 오타가 나면 조용히 빈 축이 생길 뿐 에러가 안 나므로, 아래 명령으로 대조한다:
 *   grep -rhoE "tags\('([a-z_-]+)'" scripts/ scenarios/ | sort -u
 */
const BREAKDOWN_FEATURES = [
  'auth', 'post', 'comment', 'board', 'reaction', 'scrap',
  'notification', 'friend', 'mypage', 'school', 'timetable', 'chat', 'hot',
];

const BREAKDOWN_THRESHOLDS = {
  ...BREAKDOWN_FEATURES.reduce((acc, f) => {
    acc[`http_req_duration{feature:${f}}`] = ['p(99)<600000'];
    return acc;
  }, {}),
  // 인증은 도메인 쓰기 SLO에서 분리하되 별도 응답시간 분포는 리포트에 남긴다(S-02).
  'http_req_duration{op:auth}': ['p(99)<600000'],
};

/**
 * 공통 SLO — 개별 시나리오는 필요 시 이 값을 덮어쓴다.
 * 근거: 커뮤니티 서비스 체감 기준 (Google RAIL: 응답 1s 이내 체감 양호)
 *  - 읽기 P95 300ms, 쓰기 P95 500ms, 오류율 1% 미만
 *
 * 분해축을 여기에 병합해 두는 이유: 23개 시나리오/스크립트가 이미 이 상수를 쓰고 있다.
 * 여기서 합쳐 두면 호출부를 한 줄도 안 고치고 전부에 분해 통계가 생긴다.
 * 실제 SLO 항목이 뒤에 오므로 키가 겹쳐도 SLO 쪽이 이긴다.
 */
export const DEFAULT_THRESHOLDS = {
  ...BREAKDOWN_THRESHOLDS,
  http_req_failed: ['rate<0.01'],
  'http_req_duration{op:read}': ['p(95)<300', 'p(99)<800'],
  'http_req_duration{op:write}': ['p(95)<500', 'p(99)<1200'],
  checks: ['rate>0.99'],
};

/**
 * phase(warmup/measure/rampdown)별로 p95·오류율·체크율·RPS·TPS를 뽑아내기 위한 threshold.
 *
 * BREAKDOWN_THRESHOLDS와 같은 이유로 존재한다 — k6는 threshold가 참조한 태그 조합에만
 * 서브메트릭을 만들어 주므로, 판정에 영향 없는 느슨한 상한으로 세 phase 축을 전부 선언해
 * 둔다(diagnostic). "http_req_duration{op:read}" 같은 실제 SLO 게이트만 measure phase로
 * 스코프해서 별도로 얹는다 — warmup/rampdown 구간은 진단용일 뿐 게이트가 아니다.
 */
const PHASE_AXES = ['warmup', 'measure', 'rampdown'];

const PHASE_DIAGNOSTIC_THRESHOLDS = PHASE_AXES.reduce((acc, phase) => {
  acc[buildSelector('http_req_duration', { phase })] = ['p(99)<600000'];
  acc[buildSelector('http_req_failed', { phase })] = ['rate<1'];
  acc[buildSelector('checks', { phase })] = ['rate>=0'];
  acc[buildSelector('http_reqs', { phase })] = ['count>=0'];
  acc[buildSelector('phase_iterations', { phase })] = ['count>=0'];
  // k6 builtin iterations의 phase 축 — cache-warm처럼 executor를 phase별로 나눠 정적
  // 태깅하는 시나리오는 동적 phase 계산(setActivePhasePlan)을 켜지 않아 위의 커스텀
  // Counter가 비어 있다. 그 경우 phases.js가 이 축으로 폴백해 TPS를 계산한다.
  acc[buildSelector('iterations', { phase })] = ['count>=0'];
  return acc;
}, {});

const MEASURE_GATED_THRESHOLDS = scopeThresholds(
  {
    'http_req_duration{op:read}': DEFAULT_THRESHOLDS['http_req_duration{op:read}'],
    'http_req_duration{op:write}': DEFAULT_THRESHOLDS['http_req_duration{op:write}'],
    http_req_failed: DEFAULT_THRESHOLDS.http_req_failed,
    checks: DEFAULT_THRESHOLDS.checks,
  },
  { phase: 'measure' },
);

/**
 * phase 태깅이 활성화된 시나리오(steady-state 회귀·cold-start)가 쓰는 threshold 집합.
 * DEFAULT_THRESHOLDS + phase별 진단 축 + measure phase로 스코프된 실제 게이트.
 * 진단 전용 시나리오(stress/spike/breakpoint/chaos/failover)는 이걸 쓰지 않는다 —
 * 자체 abortOnFail threshold가 이미 판정 주체이고 phase 태깅 자체를 켜지 않는다.
 */
export const PHASED_THRESHOLDS = {
  ...DEFAULT_THRESHOLDS,
  ...PHASE_DIAGNOSTIC_THRESHOLDS,
  ...MEASURE_GATED_THRESHOLDS,
};
