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
 */
export function tags(feature, op, name) {
  const t = { feature, op, name: name || feature };
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

/** min~max 초 사이 균등분포 think time (VU 단위 사용자 행동 모사) */
export function thinkTime() {
  return THINK.min + Math.random() * (THINK.max - THINK.min);
}
