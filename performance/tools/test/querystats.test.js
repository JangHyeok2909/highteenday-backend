'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const querystats = require('../lib/querystats');

/**
 * 이 파일이 고정하는 계약은 하나다 — **상위 목록이 N+1 을 가리면 안 된다.**
 *
 * 원래 구현은 읽은 행 수 하나로만 정렬해 상위 25개를 실었다. 행을 거의 안 읽으면서
 * 수없이 불리는 쿼리는 그 목록에 절대 못 들어오는데, N+1 이 정확히 그 모양이다.
 * 실측에서 앱 문장 60,763회 중 5,520회만 목록에 들어왔고 시간의 86%가 밖에 있었다.
 */

/** digest 표 한 행을 만든다. capture() 가 돌려주는 모양과 같아야 한다. */
function row(over = {}) {
  return {
    schema: 'highteenday', stmt: 'SELECT 1', calls: 0, rowsExamined: 0, rowsSent: 0,
    selectScan: 0, selectFullJoin: 0, noIndexUsed: 0, tmpDiskTables: 0, totalMs: 0,
    ...over,
  };
}

/** before 를 전부 0 으로 둔 캡처 쌍 — 델타가 곧 after 값이 된다. */
function capturePair(rowsByDigest) {
  return [
    { at: 't0', rows: {}, overflowCalls: 0 },
    { at: 't1', rows: rowsByDigest, overflowCalls: 0 },
  ];
}

test('행을 안 읽고 많이 불린 문장이 호출 수 목록에 들어온다', () => {
  const rows = {};
  // 행을 많이 훑는 문장 30개 — 행 기준 목록(상위 25)을 통째로 채운다.
  for (let i = 0; i < 30; i++) {
    rows[`scan${i}`] = row({ stmt: `SELECT scan ${i}`, calls: 2, rowsExamined: 10000 + i, totalMs: 5 });
  }
  // N+1 의 모양: 1행짜리 조회가 수천 번. 행 기준으로는 영원히 순위에 못 든다.
  rows.nplus1 = row({ stmt: 'SELECT user by id', calls: 4413, rowsExamined: 4413, totalMs: 891 });

  const s = querystats.summarize(querystats.diff(...capturePair(rows)));

  assert.equal(s.top.byRows.some((r) => r.stmt === 'SELECT user by id'), false,
    '행 기준 목록에는 안 들어오는 것이 정상이다 — 그래서 다른 축이 필요하다');
  assert.equal(s.top.byCalls[0].stmt, 'SELECT user by id',
    '호출 수 기준 목록의 1위여야 한다');
  assert.equal(s.top.byTime[0].stmt, 'SELECT user by id',
    '시간 기준 목록의 1위여야 한다');
});

test('coverage 가 목록이 설명하는 비율을 정직하게 말한다', () => {
  const rows = {
    big: row({ stmt: 'SELECT big', calls: 10, rowsExamined: 900, totalMs: 10 }),
    small: row({ stmt: 'SELECT small', calls: 90, rowsExamined: 100, totalMs: 90 }),
  };
  const s = querystats.summarize(querystats.diff(...capturePair(rows)), { topN: 1 });

  // topN=1 이므로 각 축이 1위 하나만 싣는다. 그 하나가 전체의 몇 %인지가 coverage 다.
  assert.equal(s.coverage.byRows.shown, 900);
  assert.equal(s.coverage.byRows.total, 1000);
  assert.equal(s.coverage.byRows.pct, 90);
  assert.equal(s.coverage.byCalls.shown, 90, '호출 축의 1위는 small(90회)이다');
  assert.equal(s.coverage.byCalls.pct, 90);
});

test('세 축 어디에도 없는 문장을 hidden 으로 보고한다', () => {
  const rows = {
    a: row({ stmt: 'A', calls: 100, rowsExamined: 100, totalMs: 100 }),
    b: row({ stmt: 'B', calls: 5, rowsExamined: 5, totalMs: 5 }),
  };
  const s = querystats.summarize(querystats.diff(...capturePair(rows)), { topN: 1 });

  // A 가 세 축 모두 1위라 B 는 어디에도 안 나온다.
  assert.equal(s.hidden.statements, 1);
  assert.equal(s.hidden.calls, 5);
  assert.equal(s.hidden.totalMs, 5);
});

test('합계는 목록이 아니라 전체로 낸다', () => {
  const rows = {};
  for (let i = 0; i < 40; i++) {
    rows[`d${i}`] = row({ stmt: `S${i}`, calls: 10, rowsExamined: 10, totalMs: 1 });
  }
  const s = querystats.summarize(querystats.diff(...capturePair(rows)));
  assert.equal(s.totals.app.calls, 400, '상위 25개만 더한 250 이 아니라 전체 400 이어야 한다');
  assert.equal(s.distinctStatements, 40);
});

test('계측 자신의 조회(self)는 총계와 목록에서 빠진다', () => {
  const rows = {
    self: row({ stmt: 'SELECT ... FROM performance_schema.events_statements_summary_by_digest', calls: 2, rowsExamined: 200, totalMs: 4 }),
    app: row({ stmt: 'SELECT app', calls: 1, rowsExamined: 1, totalMs: 1 }),
  };
  const s = querystats.summarize(querystats.diff(...capturePair(rows)));
  assert.equal(s.totals.self.calls, 2, 'self 몫은 따로 센다');
  assert.equal(s.totals.all.calls, 1, '총계에는 self 가 빠진다 — 계측이 자기 부하를 포함하면 그게 측정 오차다');
  assert.equal(s.top.byRows.some((r) => /events_statements_summary/.test(r.stmt)), false);
});

test('MySQL 재시작으로 카운터가 되감기면 rewound 로 보고한다', () => {
  const before = { at: 't0', rows: { d: row({ calls: 100, rowsExamined: 100 }) }, overflowCalls: 0 };
  const after = { at: 't1', rows: { d: row({ calls: 5, rowsExamined: 5 }) }, overflowCalls: 0 };
  assert.equal(querystats.diff(before, after).rewound, true);
});

test('지표 수집기 문장을 앱과 분리한다', () => {
  // 분리하지 않으면 수집기의 SHOW GLOBAL STATUS 가 앱의 풀스캔으로 읽힌다.
  assert.equal(querystats.classify({ stmt: 'SHOW GLOBAL STATUS', schema: '' }), 'exporter');
  assert.equal(querystats.classify({ stmt: 'SELECT * FROM information_schema.INNODB_METRICS', schema: '' }), 'exporter');
  assert.equal(querystats.classify({ stmt: 'SELECT * FROM comments', schema: 'highteenday' }), 'app');
  assert.equal(querystats.classify({ stmt: 'SELECT @@version', schema: '' }), 'other');
});
