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
import exec from 'k6/execution';
import { check as k6check } from 'k6';
import { phaseAt } from './phases.js';

/**
 * threshold 선언은 ./thresholds.js 로 옮겼다(순수 데이터라 Node 테스트가 직접 검증한다).
 * 호출부는 계속 config.js에서 가져다 쓰도록 그대로 재수출한다 — 시나리오/스크립트 30여
 * 개의 import 경로를 바꿀 이유가 없다.
 */
export {
  BREAKDOWN_THRESHOLDS,
  COMMON_SLO_THRESHOLDS,
  DEFAULT_THRESHOLDS,
  PHASE_DIAGNOSTIC_THRESHOLDS,
  PHASED_THRESHOLDS,
  measureOnly,
  abortDelayAfterMeasure,
} from './thresholds.js';

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
 * 현재 활성화된 phase plan — 시나리오 파일이 init 컨텍스트에서 setActivePhasePlan()으로
 * 한 번 설정해 두면, 이후 매 요청/체크마다 currentPhase()가 그 시점의 phase를 다시 계산한다.
 * plan이 없는 시나리오(진단 전용 등)는 phase 태그를 아예 붙이지 않는다 — 잘못된 phase를
 * 조용히 붙이는 것보다, 붙이지 않는 편이 안전하다.
 */
let activePlan = null;

/** 시나리오 init 컨텍스트에서 한 번 호출한다. VU마다 실행되지만 값은 불변 객체라 안전. */
export function setActivePhasePlan(plan) {
  activePlan = plan;
}

/**
 * 지금이 어느 phase인지 매번 다시 계산한다 — iteration 시작 시 한 번만 계산해 캐시하면
 * iteration이 phase 경계를 넘는 경우(특히 짧은 warmup/rampdown)를 놓친다.
 */
export function currentPhase() {
  if (!activePlan) return null;
  return phaseAt(activePlan, exec.instance.currentTestRunDuration / 1000);
}

/**
 * 표준 태그 — 모든 요청은 feature / op / (활성화됐다면) phase 태그를 갖는다. Grafana 필터 축.
 * 세션 저장소도 여기서 함께 실어 보낸다 — 모든 요청이 이 함수를 파라미터로 쓰므로
 * 호출부를 고치지 않고 전 요청에 같은 저장소를 적용할 수 있다.
 *
 * `extra`는 특정 요청에만 필요한 분해축을 더한다(예: 게시판 목록의 `page`).
 * **값의 가짓수가 적은 축에만 쓸 것.** k6는 태그 조합마다 시계열을 만들므로 게시글 ID처럼
 * 값이 수만 개인 축을 넣으면 메모리와 리포트가 함께 무너진다. 많아야 수십 개로 묶은
 * 버킷을 쓴다. 그리고 여기서 태그를 실어도 `thresholds.js`에 해당 selector를 선언하지
 * 않으면 서브메트릭이 생기지 않아 리포트에는 나타나지 않는다 — 둘은 같이 가야 한다.
 */
export function tags(feature, op, name, extra) {
  const t = { feature, op, name: name || feature, ...extra };
  const phase = currentPhase();
  if (phase) t.phase = phase;
  return { tags: t, jar: vuJar };
}

/**
 * k6 네이티브 check()의 phase-aware 래퍼. 호출 시그니처는 동일하게 유지해
 * 기존 check(res, {...}) 호출부를 한 곳도 고치지 않고, import 경로만 './lib/config.js'로
 * 바꾸면 phase 태그가 자동으로 실린다.
 */
export function check(val, sets, extraTags) {
  const phase = currentPhase();
  return k6check(val, sets, phase ? { phase, ...extraTags } : extraTags);
}

/**
 * 응답 **내용** 검사를 켤지 여부. 장애 실행기(resilience/fault-run.js)가 `CONTENT_CHECKS=1`
 * 을 넘길 때만 켠다.
 *
 * 왜 항상 켜지 않는가. 성능 회귀 쪽 게이트는 `checks: ['rate>0.99']` 하나로 통과/실패를
 * 가른다(thresholds.js COMMON_SLO_THRESHOLDS). 여기에 내용 검사가 섞이면 그 게이트가
 * 재는 대상이 "상태 코드가 200인가"에서 "내용까지 맞는가"로 바뀌어, 지금까지 쌓은 실행과
 * 같은 기준으로 비교할 수 없게 된다(METHOD.md 의 Before/After 조건).
 *
 * 장애 실험은 게이트가 없고 세 구간을 서로 비교하므로(resilience/README.md) 이 검사가
 * 판정을 흔들지 않는다. 그래서 그쪽에서만 켠다.
 */
export const CONTENT_CHECKS = __ENV.CONTENT_CHECKS === '1';

/**
 * 응답 본문에서 배열을 꺼내 길이를 센다. 못 꺼내면 -1.
 *
 * 장애 중에는 본문이 JSON 이 아닐 수 있다(프록시 오류 페이지 등). 그때 예외가 나면 VU 의
 * iteration 이 통째로 중단돼 도착률이 무너지므로, 파싱 실패는 "길이를 셀 수 없음"으로
 * 접어서 검사 실패로만 남긴다.
 *
 * @param {object} res k6 응답
 * @param {string} [field] 배열이 객체 안에 있으면 그 필드 이름 (예: PageResponse 의 content)
 * @returns {number} 배열 길이, 또는 배열을 못 찾았으면 -1
 */
export function bodyArrayLength(res, field) {
  try {
    const body = JSON.parse(res.body);
    const arr = field ? body[field] : body;
    return Array.isArray(arr) ? arr.length : -1;
  } catch (e) {
    return -1;
  }
}

/**
 * 상태 코드가 아니라 **응답 내용**을 보는 check.
 *
 * 폴백은 예외를 삼키고 기본값(빈 리스트 등)을 돌려주므로 HTTP 200 으로 나간다. 즉 "인기글이
 * 하나도 안 나왔다"와 "인기글 10건이 정상으로 나왔다"가 오류율에서는 똑같이 0% 다. 그
 * 차이를 보는 것이 이 검사다.
 *
 * 200 이 아닌 응답은 건너뛴다. 그런 실패는 오류율과 상태 코드 표가 이미 세고 있어서, 여기서
 * 또 세면 같은 실패가 두 번 계상된다. 이 검사가 답해야 하는 질문은 "200 인데 내용이
 * 비었나" 하나다.
 *
 * `name` 은 threshold selector(`checks{check:...}`)에 그대로 들어가므로 ASCII 로 짓는다.
 * 선언한 selector 가 없으면 서브메트릭이 안 생겨 구간별로 분해되지 않는다 — 목록은
 * resilience/scenarios/fault-window.js 의 CONTENT_CHECK_NAMES 와 같아야 한다.
 */
export function contentCheck(res, name, predicate) {
  if (!CONTENT_CHECKS) return true;
  if (!res || res.status !== 200) return true;
  return check(res, { [name]: predicate });
}

/** min~max 초 사이 균등분포 think time (VU 단위 사용자 행동 모사) */
export function thinkTime() {
  return THINK.min + Math.random() * (THINK.max - THINK.min);
}
