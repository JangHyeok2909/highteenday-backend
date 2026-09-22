'use strict';
/**
 * appconfig — **실패 지연을 만드는 설정값이 무엇이었나**를 실행 기록에 남긴다.
 *
 * 왜 필요한가
 * -----------
 * 이 실험이 답하는 질문은 결국 "사용자가 몇 초를 기다린 뒤 실패를 보나"다. 그 몇 초를
 * 정하는 것은 장애 자체가 아니라 **타임아웃 설정**이다. MySQL 소켓이 멈춰도 커넥션 획득
 * 타임아웃이 30초면 30초 뒤 500이 나가고, 5초면 5초 뒤에 나간다. 장애는 같은데 결론이
 * 달라진다.
 *
 * 그런데 이 값들은 지금까지 어디에도 기록되지 않았다. 보고서의 해설문만 "HikariCP 기본
 * 30초", "Lettuce 기본 60초"라고 **단정**하고 있었다. 그건 실측이 아니라 가정이다.
 * 가정이 맞더라도, 다음에 누군가 타임아웃을 줄이는 개선을 넣고 다시 돌리면 두 보고서
 * 어디에도 "설정이 달랐다"는 사실이 남지 않는다. 그러면 두 실행을 비교할 수 없다.
 *
 * 어디서 읽는가 — 우선순위와 출처를 함께 남긴다
 * ---------------------------------------------
 * Spring 은 같은 설정을 여러 곳에서 받는다. 그래서 값 하나만 적으면 "그 값이 정말 적용된
 * 값인가"를 나중에 확인할 수 없다. 값과 **출처**를 같이 남긴다.
 *
 *   1. container-env   실행 중인 앱 컨테이너의 환경 변수. Spring 완화 바인딩 규칙에 따라
 *                      `spring.datasource.hikari.connection-timeout` 은
 *                      `SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT` 으로 들어온다.
 *                      실제로 컨테이너에 박혀 있는 값이므로 가장 믿을 만하다.
 *   2. jdbc-url        JDBC URL 의 쿼리 파라미터(`?socketTimeout=...`). Connector/J 의
 *                      소켓 타임아웃은 Spring 프로퍼티가 아니라 여기로만 들어온다.
 *   3. repo-file       저장소의 `application*.properties`. ⚠ 이미지 안의 파일이 아니라
 *                      **작업 트리의 파일**이다. 이미지가 낡았으면(appimage.stale) 실제
 *                      적용된 값과 다를 수 있다. 그래서 출처를 구분해 적는다.
 *   4. framework-default  아무 데도 없을 때의 프레임워크 기본값. 사람이 손으로 적은
 *                      상수이므로 `assumed: true` 를 붙여 실측과 구분한다.
 *
 * 판정하지 않는다
 * ---------------
 * "이 타임아웃은 너무 길다" 같은 말은 하지 않는다. 이 모듈은 값과 출처만 남긴다.
 * 해석은 resilience 보고서를 읽는 사람이 한다(resilience/README.md).
 */

const fs = require('fs');
const path = require('path');

/** 저장소 루트 — 이 파일은 performance/resilience/lib/ 아래에 있다. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * 프로퍼티 파일 조회 순서. 뒤에 오는 것이 이긴다 — perf 프로파일이 prod 위에 얹히고,
 * prod 가 기본 application.properties 위에 얹히는 실제 적용 순서와 같다.
 * (컨테이너는 `--spring.profiles.active=prod,perf` 로 뜬다. docker-compose.perf.yml 참고)
 */
const PROPERTY_FILES = [
  'src/main/resources/application.properties',
  'src/main/resources/application-prod.properties',
  'src/main/resources/application-perf.properties',
];

/**
 * 기록할 설정 항목.
 *
 * `prop` 만 적으면 환경 변수 이름은 Spring 완화 바인딩 규칙으로 자동 유도한다
 * (점·하이픈을 밑줄로 바꾸고 대문자화). 목록을 두 벌 관리하면 한쪽만 고쳐서 어긋난다.
 *
 * `urlParam` 이 있는 항목은 JDBC URL 의 쿼리 파라미터에서도 찾는다.
 * `fallback` 은 프레임워크 기본값이고, `why` 는 그 값이 관측에서 무엇으로 보이는지다 —
 * 보고서가 "30,000ms 근처면 이것"이라고 해설할 때 근거로 쓰인다.
 */
const KNOBS = [
  {
    key: 'hikari.connectionTimeout',
    label: 'HikariCP 커넥션 획득 타임아웃',
    prop: 'spring.datasource.hikari.connection-timeout',
    fallback: '30000ms',
    why: '풀이 고갈됐을 때 요청이 여기까지 기다린 뒤 실패한다. 실패 지연이 30,000ms 근처에 몰리면 이 값이다.',
  },
  {
    key: 'hikari.maximumPoolSize',
    label: 'HikariCP 최대 커넥션',
    prop: 'spring.datasource.hikari.maximum-pool-size',
    fallback: '10',
    why: 'DB 가 멈췄을 때 몇 개의 요청이 커넥션을 붙잡은 채 매달릴 수 있는지의 상한이다.',
  },
  {
    key: 'hikari.validationTimeout',
    label: 'HikariCP 커넥션 검증 타임아웃',
    prop: 'spring.datasource.hikari.validation-timeout',
    fallback: '5000ms',
    why: '풀이 빌려주기 전 커넥션이 살아 있는지 확인하는 데 쓰는 시간. DB 가 멈추면 여기서도 지연이 생긴다.',
  },
  {
    key: 'jdbc.socketTimeout',
    label: 'MySQL 소켓 읽기 타임아웃',
    prop: 'spring.datasource.hikari.data-source-properties.socketTimeout',
    urlParam: 'socketTimeout',
    fallback: '0 (무한)',
    why: '이미 실행 중인 쿼리가 응답 없는 소켓에서 풀려나는 시간. 0 이면 영원히 매달리며, 그 커넥션은 풀로 돌아오지 않는다.',
  },
  {
    key: 'jdbc.connectTimeout',
    label: 'MySQL 접속 타임아웃',
    prop: 'spring.datasource.hikari.data-source-properties.connectTimeout',
    urlParam: 'connectTimeout',
    fallback: '30000ms',
    why: '새 커넥션을 만들 때 TCP 연결에 쓰는 시간. 프록시가 연결을 끊은 뒤 재연결 시도에서 드러난다.',
  },
  {
    key: 'redis.commandTimeout',
    label: 'Redis 명령 타임아웃 (Lettuce)',
    prop: 'spring.data.redis.timeout',
    fallback: '60s (Lettuce RedisURI 기본)',
    why: 'Redis 가 응답하지 않을 때 명령 하나가 여기까지 매달린다. 실패 지연이 60,000ms 근처면 이 값이다.',
  },
  {
    key: 'redis.connectTimeout',
    label: 'Redis 접속 타임아웃 (Lettuce)',
    prop: 'spring.data.redis.connect-timeout',
    fallback: '10s (Lettuce 기본)',
    why: 'Redis 컨테이너가 죽은 뒤 재연결 시도가 실패로 확정되기까지의 시간이다.',
  },
  {
    key: 'tomcat.maxThreads',
    label: 'Tomcat 최대 워커 스레드',
    prop: 'server.tomcat.threads.max',
    fallback: '200',
    why: '한 의존성의 지연이 스레드를 모두 먹으면 무관한 엔드포인트까지 막힌다 — 폭발 반경의 상한이다.',
  },
  {
    key: 'tomcat.connectionTimeout',
    label: 'Tomcat 커넥션 타임아웃',
    prop: 'server.tomcat.connection-timeout',
    fallback: '20s',
    why: '스레드가 모두 묶였을 때 대기열의 연결이 서버 쪽에서 끊기는 시점이다.',
  },
];

/** Spring 완화 바인딩: `a.b-c` → `A_B_C`. 환경 변수 이름을 목록에 중복해 적지 않기 위해 유도한다. */
function envNameOf(prop) {
  return prop.replace(/[.-]/g, '_').toUpperCase();
}

/** `key=value` 형식의 프로퍼티 파일 한 개를 Map 으로. 주석과 빈 줄은 버린다. */
function readPropertyFile(rel) {
  const out = new Map();
  let text;
  try {
    text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  } catch {
    return out; // 없는 프로파일 파일은 그냥 없는 것이다 — 검사 하나가 실행을 막으면 안 된다
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    out.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());
  }
  return out;
}

/** JDBC URL 의 쿼리 파라미터를 Map 으로. URL 이 없거나 `?` 가 없으면 빈 Map. */
function jdbcParams(dbUrl) {
  const out = new Map();
  if (!dbUrl) return out;
  const q = dbUrl.indexOf('?');
  if (q < 0) return out;
  for (const pair of dbUrl.slice(q + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    out.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return out;
}

/**
 * 실행에 적용된 타임아웃·풀 설정을 출처와 함께 해석한다.
 *
 * @param {object} args
 * @param {Map<string,string>|object} args.containerEnv 앱 컨테이너의 환경 변수.
 * @param {string|null} args.dbUrl 컨테이너가 실제로 쓰는 JDBC URL.
 * @returns {{items: object[], assumedCount: number}}
 *   items 각 항목은 `{key, label, value, source, assumed, why}` 다.
 *   `assumed` 가 true 면 실측이 아니라 프레임워크 기본값을 적어 둔 것이다.
 */
/**
 * 관측 도구 자신의 상한.
 *
 * 앱 설정은 아니지만 같은 표에 있어야 한다. 2026-09-09 실행에서 헬스체크가 다섯 번
 * "무응답"으로 잡혔는데 전부 폴러의 4초 상한을 넘긴 것이었다 — 앱 장애가 아니라 **관측
 * 도구의 한계**였다. 그 상한이 어디에도 적혀 있지 않으면 보고서를 읽는 사람이 그 사실에
 * 도달할 수 없다. 앱 타임아웃과 나란히 두면 "무응답 4초"와 "커넥션 획득 30초"의 관계가
 * 한눈에 보인다.
 */
function pollerItems(poller) {
  if (!poller) return [];
  return [
    {
      key: 'health.pollTimeoutMs',
      label: '헬스 폴러 응답 상한 (관측 도구)',
      value: `${poller.timeoutMs}ms`,
      source: '관측 도구 설정 (resilience/lib/health.js)',
      assumed: false,
      why: '이 시간을 넘기면 표본이 "무응답"으로 기록된다. 앱이 죽었다는 뜻이 아니라 헬스 응답이 이 상한보다 느렸다는 뜻이다.',
    },
    {
      key: 'health.pollIntervalMs',
      label: '헬스 폴러 주기 (관측 도구)',
      value: `${poller.intervalMs}ms`,
      source: '관측 도구 설정 (resilience/lib/health.js)',
      assumed: false,
      why: '상태 전이 시각의 해상도다. 이 주기보다 짧은 장애는 표본 사이로 빠져나갈 수 있다.',
    },
  ];
}

function resolve({ containerEnv, dbUrl, poller } = {}) {
  const env = containerEnv instanceof Map
    ? containerEnv
    : new Map(Object.entries(containerEnv || {}));
  const params = jdbcParams(dbUrl);
  // 프로파일 순서대로 덮어쓴 최종 프로퍼티 뷰. 어느 파일에서 왔는지도 같이 들고 있는다.
  const props = new Map();
  for (const rel of PROPERTY_FILES) {
    for (const [k, v] of readPropertyFile(rel)) props.set(k, { value: v, file: rel });
  }

  const items = KNOBS.map((knob) => {
    const envName = envNameOf(knob.prop);
    const fromEnv = env.get(envName);
    if (fromEnv != null && fromEnv !== '') {
      return { ...pick(knob), value: fromEnv, source: `컨테이너 환경변수 ${envName}`, assumed: false };
    }
    if (knob.urlParam && params.has(knob.urlParam)) {
      return { ...pick(knob), value: params.get(knob.urlParam), source: `JDBC URL ?${knob.urlParam}`, assumed: false };
    }
    const fromFile = props.get(knob.prop);
    if (fromFile) {
      return { ...pick(knob), value: fromFile.value, source: `저장소 파일 ${fromFile.file}`, assumed: false };
    }
    return { ...pick(knob), value: knob.fallback, source: '설정 없음 → 프레임워크 기본값', assumed: true };
  });

  const all = items.concat(pollerItems(poller));
  return { items: all, assumedCount: all.filter((i) => i.assumed).length };
}

/** KNOBS 항목에서 기록에 남길 필드만 뽑는다. fallback 은 값으로 승격된 뒤에만 의미가 있다. */
function pick(knob) {
  return { key: knob.key, label: knob.label, why: knob.why };
}

module.exports = { resolve, KNOBS, PROPERTY_FILES, envNameOf, jdbcParams, readPropertyFile };
