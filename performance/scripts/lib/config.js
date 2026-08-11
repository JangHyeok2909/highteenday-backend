/**
 * 전역 설정 — 모든 스크립트/시나리오가 이 파일을 통해 환경을 주입받는다.
 *
 * 환경변수로 오버라이드:
 *   BASE_URL   대상 서버 (기본 http://localhost:18080 — docker-compose.perf.yml 호스트 포트)
 *   WS_URL     WebSocket 엔드포인트 (기본 BASE_URL 기반 자동 유도)
 *   DATASET    datasets/generated/<DATASET>/ 아래의 시드 데이터 사용 (기본 small)
 *   THINK_MIN / THINK_MAX  Think time 범위(초)
 */
import http from 'k6/http';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:18080';

export const WS_URL =
  __ENV.WS_URL ||
  BASE_URL.replace(/^http/, 'ws') + '/ws/websocket'; // SockJS raw websocket transport

export const DATASET = __ENV.DATASET || 'small';

// 시드 사용자의 공통 비밀번호 — datasets/generate.js 와 반드시 일치해야 한다.
export const SEED_PASSWORD = __ENV.SEED_PASSWORD || 'PerfTest123!';

export const THINK = {
  min: Number(__ENV.THINK_MIN || 1),
  max: Number(__ENV.THINK_MAX || 4),
};

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
 * VU 세션 쿠키 저장소 — iteration 경계를 넘어 로그인 상태를 유지한다.
 *
 * k6의 기본 저장소(`http.cookieJar()`)는 **iteration마다 리셋된다**(v2.1.0 실측 확인).
 * 그래서 기본 저장소를 쓰면 매 iteration이 로그인으로 시작하고, BCrypt 검증이
 * 전체 요청의 20%를 차지해 측정 대상을 가린다(S-01 — 실측: 요청 905건 중 로그인 187건).
 * 모듈 스코프에서 만든 저장소는 VU 단위로 유지되므로 실제 사용자처럼 한 번 로그인하고
 * 계속 쓴다. `myUser()`가 VU마다 계정을 고정 할당하므로 세션이 섞이지 않는다.
 */
export const vuJar = new http.CookieJar();

/**
 * 표준 태그 — 모든 요청은 feature / op 태그를 갖는다. Grafana 필터 축.
 * 세션 저장소도 여기서 함께 실어 보낸다 — 모든 요청이 이 함수를 파라미터로 쓰므로
 * 호출부를 고치지 않고 전 요청에 같은 저장소를 적용할 수 있다.
 */
export function tags(feature, op, name) {
  return { tags: { feature, op, name: name || feature }, jar: vuJar };
}

/** min~max 초 사이 균등분포 think time (VU 단위 사용자 행동 모사) */
export function thinkTime() {
  return THINK.min + Math.random() * (THINK.max - THINK.min);
}
