'use strict';
/**
 * faultmetrics — 장애 실험에서만 필요한 앱 내부 지표.
 *
 * 무엇을 채우는가
 * ---------------
 * 기존 보고서는 "요청의 몇 %가 실패했다"까지만 말하고 **왜 실패했는지**는 말하지 않았다.
 * 500(커넥션을 못 받음)과 503(헬스가 DOWN 이라 앞단이 뺌)과 연결 거부는 대응이 전혀 다른데
 * 오류율 하나로 뭉뚱그려져 있었다. 그리고 "스레드가 400개까지 찼다"는 보이지만 그 스레드가
 * 실행 중인지 무언가를 기다리는지도 구분되지 않았다.
 *
 * 두 가지를 채운다.
 *   1. 앱이 실제로 내보낸 응답을 상태 코드·결과·예외별로 — `http_server_requests_seconds_count`
 *   2. JVM 스레드의 상태 분포        — `jvm_threads_states_threads{state}`
 *
 * 둘 다 **앱 코드를 고치지 않아도 이미 나오고 있는 값**이다. Spring Boot Actuator 의
 * Micrometer 계측이 `exception` 라벨을 붙여 주고, JVM 스레드 상태는 기본 바인더가 낸다.
 * 지금까지는 Prometheus 에 쌓이기만 하고 아무도 읽지 않았다.
 *
 * 왜 공용 카탈로그(tools/lib/metrics-catalog.js)에 넣지 않는가
 * -----------------------------------------------------------
 * `collectInfra` 는 카탈로그의 `GROUPS` 를 **전부** 순회한다(tools/collect.js). 공용
 * 카탈로그에 넣으면 성능 회귀 보고서에도 이 그룹이 생겨서, 장애 실험 때문에 성능 쪽
 * 보고서의 모양이 바뀐다. 두 도구는 질문이 다르므로(resilience/README.md) 표도 섞지 않는다.
 * 대신 같은 `PromClient` 와 같은 구간 창(window)을 써서 수집 방식은 일치시킨다.
 *
 * 라벨 조합은 값이 열려 있다
 * --------------------------
 * `status × outcome × exception` 조합은 카디널리티 상한이 없다. 전부 표로 만들면 한 화면을
 * 넘기고 정작 많이 난 것이 묻힌다. 건수 기준 상위 몇 개만 남기고 나머지는 한 줄로 합친다 —
 * 버리는 게 아니라 합친 건수를 같이 보여 준다.
 */

const { toRangeSelector } = require('../../tools/lib/promql');
const { APP_JOB } = require('../../tools/lib/metrics-catalog');
const { PHASE_ORDER } = require('./plan');

/** 표에 개별 행으로 남길 응답 조합 수. 나머지는 "기타"로 합친다. */
const TOP_OUTCOME_ROWS = 8;

/**
 * JVM 스레드 상태 — 구간 안의 최댓값.
 *
 * `blocked` 는 모니터 락을 기다리는 스레드, `timed-waiting` 은 상한이 있는 대기(커넥션
 * 획득 타임아웃처럼), `waiting` 은 상한 없는 대기다. 의존성이 멈췄을 때 이 셋 중 어디가
 * 늘어나는지가 원인을 크게 좁힌다 — 소켓 read 로 매달린 스레드는 `runnable` 로 잡히므로,
 * "busy 는 400인데 runnable 도 400"이면 풀 대기가 아니라 무한 소켓 대기다.
 */
const THREAD_STATES = ['runnable', 'blocked', 'waiting', 'timed-waiting'];

function threadStateSpecs() {
  return THREAD_STATES.map((state) => ({
    key: `threads.${state}`,
    label: `JVM 스레드 ${state} (max)`,
    query: `max_over_time((sum(jvm_threads_states_threads{job="${APP_JOB}",state="${state}"}))[$RANGE:])`,
    reduce: 'max',
    unit: 'count',
    desc: state === 'runnable'
      ? '실행 가능 상태. 응답 없는 소켓에서 read 로 매달린 스레드도 여기 잡힌다.'
      : (state === 'blocked'
        ? '모니터 락 대기. 공유 자원 경합의 신호다.'
        : '대기 상태. timed-waiting 은 상한이 있는 대기(커넥션 획득 등)다.'),
  }));
}

/**
 * 한 구간에 **앱이 실제로 내보낸 응답**을 상태 코드·결과·예외 클래스별로 읽는다.
 *
 * 왜 예외만 세지 않는가 — 실측으로 확인한 사정
 * --------------------------------------------
 * 처음에는 `exception!="none"` 만 세도록 만들었다. 그런데 2026-09-09 redis-crash 실행에서
 * 앱이 HTTP 500 을 16.5건 냈는데도 예외 표가 세 구간 모두 비었다. 수집 버그가 아니었다.
 * 이 앱은 모든 도메인 오류를 `GlobalExceptionHandler`(@RestControllerAdvice)가 잡아
 * 응답으로 바꾸므로, Micrometer 관점에서는 **처리된 예외**가 되어 라벨이 `none` 으로 남는다.
 * 즉 이 저장소에서 `exception` 라벨만 보면 표는 거의 언제나 비고, 비었다는 사실이 아무것도
 * 말해 주지 않는다.
 *
 * 그래서 `status` 와 `outcome` 을 같이 센다. 이러면 표가 항상 내용을 갖고, 무엇보다
 * **클라이언트가 본 것과 서버가 기록한 것을 대조**할 수 있다. k6 는 응답 없음(status 0)을
 * 35건 봤는데 서버 기록에는 그만큼의 실패가 없다면, 그 요청들은 앱에 닿지 못했거나 앱이
 * 응답을 끝내지 못한 것이다. 한쪽만 봐서는 절대 나오지 않는 결론이다.
 *
 * `uri` 가 `/actuator` 로 시작하는 것은 뺀다 — 헬스 폴러가 5초마다 찍는 200 이 표의 절반을
 * 차지하면 사용자 트래픽의 모양이 가려진다.
 *
 * `prom.series()` 를 쓰는 이유: `instant()` 는 여러 시계열을 스칼라 하나로 접기 때문에
 * "어느 상태 코드가" 라는 정보가 사라진다(그 함정의 실제 사례는 tools/lib/promql.js 주석에).
 *
 * @param {PromClient} prom
 * @param {{from: Date, to: Date, durationSec: number}} window 구간 창.
 * @returns {Promise<{items: object[], total: number, failed: number, otherCount: number, otherKinds: number}>}
 */
async function collectServerOutcomes(prom, window) {
  const range = toRangeSelector(window.durationSec);
  const query = `sum by (status,outcome,exception) (increase(http_server_requests_seconds_count{job="${APP_JOB}",uri!~"/actuator.*"}[${range}]))`;
  const rows = await prom.series(query, window.to);
  const all = rows
    // increase() 는 소수점을 낸다. 0.5 미만은 구간 경계의 보간 잔여물이라 세지 않는다.
    .map((r) => ({
      status: r.labels.status || '?',
      outcome: r.labels.outcome || '?',
      exception: r.labels.exception && r.labels.exception !== 'none' ? r.labels.exception : null,
      count: r.value,
    }))
    .filter((r) => r.count >= 0.5)
    .sort((a, b) => b.count - a.count);
  const items = all.slice(0, TOP_OUTCOME_ROWS);
  const rest = all.slice(TOP_OUTCOME_ROWS);
  return {
    items,
    total: all.reduce((s, r) => s + r.count, 0),
    // 서버가 스스로 실패로 기록한 건수. k6 가 본 실패 수와 다르면 그 차이가 정보다.
    failed: all.filter((r) => /ERROR/.test(r.outcome)).reduce((s, r) => s + r.count, 0),
    otherCount: rest.reduce((s, r) => s + r.count, 0),
    otherKinds: rest.length,
  };
}

/**
 * 구간별 예외 분포와 스레드 상태를 모은다.
 *
 * 실패해도 실험 전체를 버리지 않는다 — 항목 하나가 안 나오는 것과 보고서가 없는 것은
 * 손실의 크기가 다르다. 실패는 `errors` 에 모아 보고서가 "결측"으로 표시하게 한다.
 *
 * @param {PromClient} prom preflight 에서 연결을 확인한 클라이언트.
 * @param {object} windows plans.phaseWindows() 의 결과 — {pre, fault, post}.
 * @returns {Promise<{exceptions: object, threads: object, errors: string[]}>}
 */
async function collectFaultMetrics(prom, windows) {
  const outcomes = {};
  const threads = {};
  const errors = [];
  const specs = threadStateSpecs();

  for (const name of PHASE_ORDER) {
    const w = windows[name];
    if (!w) continue;
    try {
      outcomes[name] = await collectServerOutcomes(prom, w);
    } catch (e) {
      errors.push(`serverOutcomes/${name}: ${e.message.slice(0, 160)}`);
    }
    const row = {};
    for (const spec of specs) {
      try {
        row[spec.key] = await prom.evalSpec(spec, w);
      } catch (e) {
        row[spec.key] = null;
        errors.push(`${spec.key}/${name}: ${e.message.slice(0, 160)}`);
      }
    }
    threads[name] = row;
  }
  return { outcomes, threads, errors, specs: specs.map((s) => ({ key: s.key, label: s.label, desc: s.desc })) };
}

module.exports = { collectFaultMetrics, collectServerOutcomes, threadStateSpecs, THREAD_STATES, TOP_OUTCOME_ROWS };
