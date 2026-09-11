'use strict';

/**
 * appconfig — 실패 지연을 만드는 설정값을 어디서 읽었는지까지 남기는지 검증한다.
 *
 * 값만 맞으면 되는 모듈이 아니다. "이 30초가 실제 설정인가, 아무 데도 없어서 기본값을
 * 적어 둔 것인가"를 보고서가 구분해 보여 줘야 하므로 `source` 와 `assumed` 가 핵심이다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, envNameOf, jdbcParams } = require('../lib/appconfig');

test('envNameOf: Spring 완화 바인딩 규칙으로 환경변수 이름을 만든다', () => {
  assert.equal(envNameOf('spring.datasource.hikari.connection-timeout'), 'SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT');
  assert.equal(envNameOf('spring.data.redis.timeout'), 'SPRING_DATA_REDIS_TIMEOUT');
});

test('jdbcParams: JDBC URL 의 쿼리 파라미터를 읽는다', () => {
  const p = jdbcParams('jdbc:mysql://toxiproxy:3306/db?socketTimeout=5000&connectTimeout=2000');
  assert.equal(p.get('socketTimeout'), '5000');
  assert.equal(p.get('connectTimeout'), '2000');
  assert.equal(jdbcParams(null).size, 0);
  assert.equal(jdbcParams('jdbc:mysql://host:3306/db').size, 0);
});

test('컨테이너 환경변수가 있으면 그것을 쓰고 출처를 남긴다', () => {
  const { items } = resolve({
    containerEnv: { SPRING_DATA_REDIS_TIMEOUT: '2s' },
    dbUrl: 'jdbc:mysql://toxiproxy:3306/db',
  });
  const redis = items.find((i) => i.key === 'redis.commandTimeout');
  assert.equal(redis.value, '2s');
  assert.equal(redis.assumed, false);
  assert.match(redis.source, /컨테이너 환경변수/);
});

test('JDBC URL 파라미터는 소켓 타임아웃의 출처가 된다', () => {
  const { items } = resolve({ containerEnv: {}, dbUrl: 'jdbc:mysql://toxiproxy:3306/db?socketTimeout=5000' });
  const sock = items.find((i) => i.key === 'jdbc.socketTimeout');
  assert.equal(sock.value, '5000');
  assert.equal(sock.assumed, false);
  assert.match(sock.source, /JDBC URL/);
});

test('아무 데도 없으면 프레임워크 기본값을 쓰되 가정으로 표시한다', () => {
  const { items, assumedCount } = resolve({ containerEnv: {}, dbUrl: null });
  const sock = items.find((i) => i.key === 'jdbc.socketTimeout');
  assert.equal(sock.assumed, true);
  assert.match(sock.value, /무한/);
  assert.ok(assumedCount > 0, '가정한 값의 개수를 세지 않는다');
});

test('저장소의 프로퍼티 파일에 있는 값은 실측으로 다룬다', () => {
  // application.properties 에 server.tomcat.threads.max 가 실제로 있다.
  const { items } = resolve({ containerEnv: {}, dbUrl: null });
  const tomcat = items.find((i) => i.key === 'tomcat.maxThreads');
  assert.equal(tomcat.assumed, false);
  assert.match(tomcat.source, /저장소 파일/);
});

test('모든 항목이 값·출처·해설을 갖춘다', () => {
  const { items } = resolve({ containerEnv: {}, dbUrl: null });
  for (const i of items) {
    assert.ok(i.key && i.label, `키·라벨이 없다: ${JSON.stringify(i)}`);
    assert.ok(i.value != null && i.value !== '', `값이 비었다: ${i.key}`);
    assert.ok(i.source, `출처가 없다: ${i.key}`);
    assert.ok(i.why, `해설이 없다: ${i.key}`);
  }
});
