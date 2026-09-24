/**
 * 멱등 실험의 공통 배관 — 카운터, 재시도 래퍼, 응답 파싱.
 *
 * 액션(post-like.js 등)은 "무엇을 어떤 전제로 보내는가"만 갖고, 세는 일과 다시 보내는 일은
 * 전부 여기서 한다. 액션마다 따로 세면 태그 키가 흩어져, 액션을 하나 추가했을 때 카운터
 * 이름만 살짝 다르게 적히고도 오류가 안 난다. 그 경우 그 액션은 요약에는 있는데 판정에서는
 * 빠지고, 결과는 "결함 없음"으로 보인다.
 *
 * 판정식과 전제는 `resilience/scenarios/retry-storm.js` 머리에 있다.
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { tags } from '../../../scripts/lib/config.js';
import { refreshToken } from '../../../scripts/lib/session.js';

/** 재시도까지 기다리는 초. 첫 요청의 커밋보다 뒤에 도착하기만 하면 된다. */
export const RETRY_DELAY = Number(__ENV.RETRY_DELAY || 0.2);

/**
 * 요청 하나의 상한. toxic 이 1초에 연결을 닫으므로 그보다 길게 둔다 — "언제 포기하는가"를
 * toxic 이 정해야 실행마다 값이 흔들리지 않는다.
 */
export const REQ_TIMEOUT = __ENV.REQ_TIMEOUT || '3s';

/**
 * 판정에 쓰이는 카운터. 서버는 "사용자가 무엇을 원했는가"를 모르므로 부하 쪽에서 센다.
 * `viewcount-conservation` 이 `view_expected` 를 쓰는 것과 같은 구조이고, 액션을 태그로
 * 갈라 한 실행에서 여러 종류를 따로 판정한다.
 *
 *   idem_intent   요청을 처음 보낸 횟수. 판정식의 한쪽이다
 *   idem_retried  응답을 못 받아 한 번 더 보낸 횟수. 훼손율의 분모다
 *   idem_unknown  마지막 응답이 2xx 가 아니라 최종 상태를 알 수 없는 횟수
 *   idem_skipped  전제를 못 맞춰 의도에 넣지 않은 횟수(이미 켜져 있음·목록이 비어 있음 등)
 */
export const idemIntent = new Counter('idem_intent');
export const idemRetried = new Counter('idem_retried');
export const idemUnknown = new Counter('idem_unknown');
export const idemSkipped = new Counter('idem_skipped');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** 본문 없는 요청의 옵션. `tags()` 가 쿠키 저장소도 함께 실어 준다. */
export function opts(feature, op, name) {
  return Object.assign({ timeout: REQ_TIMEOUT }, tags(feature, op, name));
}

/** JSON 본문 요청의 옵션. */
export function jsonOpts(feature, op, name) {
  return Object.assign({ timeout: REQ_TIMEOUT, headers: JSON_HEADERS }, tags(feature, op, name));
}

/** JSON 본문에서 불리언 하나를 꺼낸다. 못 읽으면 null 이고, 호출부가 그 대상을 건너뛴다. */
export function boolField(res, name) {
  if (!res || res.status !== 200) return null;
  try {
    const v = JSON.parse(res.body)[name];
    return typeof v === 'boolean' ? v : null;
  } catch (e) {
    return null;
  }
}

/** 응답이 2xx 인가. 최종 상태를 아는지 모르는지를 이걸로 가른다. */
export function ok2xx(res) {
  return !!res && res.status >= 200 && res.status < 300;
}

/**
 * 의도 한 번 — 같은 요청을 보내고, 응답을 못 받으면 한 번만 더 보낸다.
 *
 * 재시도를 한 번으로 묶는 이유: 두 번 이상 하면 토글이 다시 뒤집혀 홀짝이 되고, 결함 1건을
 * 1건으로 셀 수 없다.
 *
 * `scripts/*.js` 의 기존 래퍼를 쓰지 않는 이유가 둘이다. 그쪽은 `withAuth` 로 401 재시도를
 * 자동으로 해서 재시도 시점을 이쪽이 정할 수 없고, 응답을 못 받은 것(status 0)을 check 실패로
 * 세면 "장애가 만든 정상 관측"이 실패로 기록된다. 상태 코드별 집계는 WATCH_STATUS 축이 한다.
 *
 * @param {string} action 액션 키. 카운터 태그로 실리고, `lib/invariants.js` 의
 *   IDEMPOTENCY_ACTIONS 에 같은 값이 있어야 판정에 들어간다.
 * @param {function(): object} send 같은 바이트의 요청을 다시 보낼 수 있는 함수. 생성 계열은
 *   본문을 이 함수 **밖에서** 한 번 만들어야 한다 — 안에서 만들면 재시도마다 내용이 달라져
 *   서버가 구분할 수 있는 다른 요청이 되고, 그건 재시도가 아니다.
 * @param {function(object): void} [onRetryResult] 재시도 응답을 액션이 따로 봐야 할 때.
 * @returns {object} 마지막 응답.
 */
export function attempt(action, send, onRetryResult) {
  idemIntent.add(1, { action });
  let res = send();

  // 토큰 만료로 인한 재발급은 이 실험이 세는 재시도가 아니다. 401 은 서버가 아무것도 쓰지
  // 않고 거절한 것이라 상태를 바꾸지 못한다. 재발급 액션 자신은 이 분기를 타면 안 되므로
  // (같은 엔드포인트를 두 번 부르게 된다) 그 액션은 onRetryResult 로 직접 처리한다.
  if (res.status === 401 && action !== 'token_refresh') {
    refreshToken();
    res = send();
  }

  if (res.status === 0) {
    idemRetried.add(1, { action });
    sleep(RETRY_DELAY);
    res = send();
    if (onRetryResult) onRetryResult(res);
  }

  if (!ok2xx(res)) idemUnknown.add(1, { action });
  return res;
}
