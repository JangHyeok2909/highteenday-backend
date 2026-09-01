'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const preflight = require('../preflight');

/**
 * 이 파일이 지키는 계약은 **"어긋난 상태를 통과시키지 않는다"** 이다.
 *
 * 관문 함수는 전부 순수 함수(사실 → 판정)라 실제 스택 없이 시험할 수 있다. 그래서
 * 여기서 재현하는 것은 도커 명령이 아니라 **과거에 실제로 겪은 어긋난 상태들**이다 —
 * 시드 오버라이드가 켜진 채로 측정(E-52 계열), 다른 프로파일 볼륨(E-52), 낡은
 * 이미지(T-42), 잔류 부하(E-46).
 */

const byId = (results, id) => results.find((r) => r.id === id);
const run = (facts) => preflight.evaluate(facts);

/** 모든 관문이 통과하는 사실 묶음. 각 시험은 여기서 한 군데만 어긋뜨린다. */
function baseFacts() {
  return {
    errors: [],
    profile: { arg: 'medium', env: 'medium', expectedVolume: 'perf-mysql-data-medium' },
    mountedVolume: 'perf-mysql-data-medium',
    state: { fingerprint: 'sha256:aaaa', core: { 'posts.count': 10 }, volatile: { 'views.sum': 1 } },
    snapshot: {
      snapshotId: 'medium-20260901-064738',
      state: 'sha256:aaaa',
      core: { 'posts.count': 10 },
      volatileAtCapture: { 'views.sum': 1 },
    },
    mysqlVars: {
      innodb_flush_log_at_trx_commit: '1',
      sync_binlog: '1',
      slow_query_log: '1',
      performance_schema: '1',
    },
    appLimits: { nanoCpus: 2e9, memBytes: 2560 * 1024 * 1024 },
    mysqlLimits: { nanoCpus: 2e9, memBytes: 2 * 1024 * 1024 * 1024 },
    expectedHikariMax: 10,
    image: {
      available: true,
      imageId: 'sha256:abcdef0123456789',
      imageRef: 'environment-app',
      imageCreated: '2026-09-01T05:00:00Z',
      stale: false,
      staleBySec: 0,
    },
    prom: {
      reachable: true,
      jobs: [
        { job: 'containers', up: true },
        { job: 'host', up: true },
        { job: 'mysql', up: true },
        { job: 'redis', up: true },
        { job: 'spring-app', up: true },
      ],
      error: null,
    },
    live: { hikariMax: 10, pending: 0, active: 0, appCores: 0.02 },
    rate: 4,
  };
}

test('정상 상태에서는 여섯 관문이 모두 통과한다', () => {
  const results = run(baseFacts());
  assert.equal(results.length, 6);
  for (const r of results) assert.equal(r.ok, true, `${r.id} 가 실패했다: ${r.lines.join(' / ')}`);
});

// ── G1 프로파일·볼륨 ────────────────────────────────────────────────────────

test('G1 — .env.perf 프로파일과 --dataset 이 다르면 막는다', () => {
  // E-52 의 형태다. `.env.perf` 는 large 인데 도구는 기본값으로 돌아 다른 볼륨을 건드렸다.
  const f = baseFacts();
  f.profile.env = 'large';
  const g = byId(run(f), 'G1');
  assert.equal(g.ok, false);
  assert.match(g.fix, /large/);
});

test('G1 — 마운트된 볼륨이 프로파일과 다르면 막는다', () => {
  const f = baseFacts();
  f.mountedVolume = 'perf-mysql-data-large';
  const g = byId(run(f), 'G1');
  assert.equal(g.ok, false);
  assert.match(g.fix, /perf-mysql-data-medium/);
});

test('G1 — 볼륨 이름을 읽지 못하면 통과시키지 않는다', () => {
  // "확인 불가"를 통과로 적으면 이 관문이 막으려던 상황이 그대로 지나간다.
  const f = baseFacts();
  f.mountedVolume = null;
  assert.equal(byId(run(f), 'G1').ok, false);
});

// ── G2 데이터셋 상태 ────────────────────────────────────────────────────────

test('G2 — 상태 지문이 스냅샷과 다르면 막고 무엇이 변했는지 말한다', () => {
  const f = baseFacts();
  f.state = { fingerprint: 'sha256:bbbb', core: { 'posts.count': 517 }, volatile: { 'views.sum': 1 } };
  const g = byId(run(f), 'G2');
  assert.equal(g.ok, false);
  // "지문이 다릅니다"만으로는 다음 행동을 정할 수 없다. 차이가 보여야 한다.
  assert.ok(g.lines.some((l) => l.includes('posts.count')), g.lines.join(' / '));
  assert.match(g.fix, /snapshot\.js restore/);
});

test('G2 — 비교할 스냅샷이 없으면 막는다', () => {
  const f = baseFacts();
  f.snapshot = null;
  const g = byId(run(f), 'G2');
  assert.equal(g.ok, false);
  assert.match(g.fix, /snapshot\.js create medium/);
});

// ── G3 측정 스펙 ────────────────────────────────────────────────────────────

test('G3 — 시드 오버라이드가 켜진 채면 전부 잡아낸다', () => {
  // docker-compose.seed.yml 이 적용된 상태 그대로다.
  const f = baseFacts();
  f.mysqlVars = {
    innodb_flush_log_at_trx_commit: '2',
    sync_binlog: '0',
    slow_query_log: '0',
    performance_schema: '0',
  };
  f.appLimits = { nanoCpus: 6e9, memBytes: 4 * 1024 * 1024 * 1024 };
  f.mysqlLimits = { nanoCpus: 4e9, memBytes: 4 * 1024 * 1024 * 1024 };
  f.live.hikariMax = 50;

  const g = byId(run(f), 'G3');
  assert.equal(g.ok, false);
  const text = g.lines.join('\n');
  for (const key of Object.keys(preflight.MEASURE_SPEC.mysql)) {
    assert.ok(text.includes(key), `${key} 가 보고되지 않았다`);
  }
  assert.ok(text.includes('HikariCP 기대 10'), text);
  assert.ok(text.includes('앱 CPU 기대 2.0코어'), text);
});

test('G3 — 풀 크기 기대값은 .env.perf 를 따른다', () => {
  // 풀 크기는 EXP-006 의 실험 변수다. 10 을 하드코딩하면 풀 실험 자체를 막게 된다.
  const f = baseFacts();
  f.expectedHikariMax = 20;
  f.live.hikariMax = 20;
  assert.equal(byId(run(f), 'G3').ok, true);
});

test('G3 — 지표를 읽지 못하면 통과시키지 않는다', () => {
  const f = baseFacts();
  f.live.hikariMax = null;
  assert.equal(byId(run(f), 'G3').ok, false);
});

// ── G4 관측 경로 ────────────────────────────────────────────────────────────

test('G4 — 스크레이프 대상이 하나라도 빠지면 막는다', () => {
  const f = baseFacts();
  f.prom.jobs = f.prom.jobs.filter((j) => j.job !== 'mysql');
  const g = byId(run(f), 'G4');
  assert.equal(g.ok, false);
  assert.match(g.fix, /mysql/);
});

test('G4 — 대상이 down 이면 막는다', () => {
  const f = baseFacts();
  f.prom.jobs = f.prom.jobs.map((j) => (j.job === 'redis' ? { job: 'redis', up: false } : j));
  assert.equal(byId(run(f), 'G4').ok, false);
});

test('G4 — Prometheus 자체가 무응답이면 막는다', () => {
  const f = baseFacts();
  f.prom = { reachable: false, jobs: null, error: null };
  assert.equal(byId(run(f), 'G4').ok, false);
});

// ── G5 운용점·유휴 ──────────────────────────────────────────────────────────

test('G5 — 안전 운용점을 넘는 도착률은 막는다', () => {
  const f = baseFacts();
  f.rate = preflight.SAFE_RATE + 1;
  const g = byId(run(f), 'G5');
  assert.equal(g.ok, false);
  assert.ok(g.lines.some((l) => l.includes('안전 운용점')), g.lines.join(' / '));
});

test('G5 — 잔류 부하가 남아 있으면 막는다', () => {
  // 앞 실행이 안 끝난 채 다음 세트를 시작하면 첫 회차만 조용히 오염된다.
  const f = baseFacts();
  f.live = { hikariMax: 10, pending: 3, active: 9, appCores: 1.4 };
  const g = byId(run(f), 'G5');
  assert.equal(g.ok, false);
  assert.equal(g.lines.filter((l) => l.startsWith('⚠')).length, 3);
});

test('G5 — 도착률을 안 주면 운용점 검사만 건너뛰고 유휴 검사는 계속한다', () => {
  const f = baseFacts();
  f.rate = null;
  assert.equal(byId(run(f), 'G5').ok, true);

  const busy = baseFacts();
  busy.rate = null;
  busy.live.pending = 5;
  assert.equal(byId(run(busy), 'G5').ok, false);
});

// ── G6 코드 신원 ────────────────────────────────────────────────────────────

test('G6 — 이미지가 소스보다 낡으면 막는다', () => {
  const f = baseFacts();
  f.image = { ...f.image, stale: true, staleBySec: 3 * 86400, newestInput: '2026-09-01T00:00:00Z' };
  const g = byId(run(f), 'G6');
  assert.equal(g.ok, false);
  assert.match(g.fix, /--build app/);
});

test('G6 — 최신 여부를 판정하지 못하면 막는다', () => {
  // perf-run.js 는 경고만 하고 넘어간다. Before/After 비교는 "같은 바이너리인가"에
  // 전적으로 기대므로 여기서는 통과시키지 않는다.
  const f = baseFacts();
  f.image = { ...f.image, stale: null };
  assert.equal(byId(run(f), 'G6').ok, false);
});

test('G6 — 이미지를 조회하지 못하면 막는다', () => {
  const f = baseFacts();
  f.image = { available: false, reason: 'no such container' };
  assert.equal(byId(run(f), 'G6').ok, false);
});

// ── 판정기 자체의 안전성 ────────────────────────────────────────────────────

test('사실이 통째로 비어도 예외 대신 전부 실패로 보고한다', () => {
  // 스택이 안 떠 있는 상태에서 부르면 사실이 거의 비는데, 그때 스택 트레이스만 뱉으면
  // 사용자는 무엇을 고쳐야 하는지 알 수 없다.
  const results = preflight.evaluate({
    errors: [], profile: { arg: 'medium', env: null, expectedVolume: 'perf-mysql-data-medium' },
    live: {}, prom: { reachable: false }, image: null,
  });
  assert.equal(results.length, 6);
  for (const r of results) {
    assert.equal(r.ok, false);
    assert.ok(r.lines.length > 0, `${r.id} 가 사유를 남기지 않았다`);
  }
});

test('.env.perf 파싱은 값 안의 = 를 자르지 않는다', () => {
  // JWT_KEY 는 base64 라 끝에 = 가 붙는다. 첫 = 에서만 잘라야 한다.
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-')), '.env.perf');
  fs.writeFileSync(file, '# 주석\n\nDATASET_PROFILE=medium\nJWT_KEY=abc+/def==\n');
  const env = preflight.readEnvFile(file);
  assert.equal(env.DATASET_PROFILE, 'medium');
  assert.equal(env.JWT_KEY, 'abc+/def==');
});

test('없는 .env.perf 는 예외가 아니라 null 이다', () => {
  assert.equal(preflight.readEnvFile('/definitely/not/here/.env.perf'), null);
});
