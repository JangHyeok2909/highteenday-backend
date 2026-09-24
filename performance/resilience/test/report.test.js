'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderReport, specOf, chart } = require('../lib/report');

function sampleRecord() {
  const plan = {
    id: 'redis-hang',
    question: 'Redis 가 멈추면?',
    load: { rate: 4, preVus: 100, maxVus: 1000 },
    phases: { preSec: 60, faultSec: 30, postSec: 60 },
    inject: [
      {
        at: 'fault.start',
        tool: 'toxiproxy',
        action: 'add',
        proxy: 'redis',
        toxic: { name: 'hang', type: 'timeout', stream: 'downstream', toxicity: 1.0, attributes: { timeout: 0 } },
      },
      { at: 'fault.end', tool: 'toxiproxy', action: 'remove', proxy: 'redis', toxicName: 'hang' },
    ],
    expect: ['모든 호출이 60초 대기한다'],
    requires: { proxy: true },
  };
  const t0 = new Date('2026-09-08T10:00:00Z');
  return {
    schemaVersion: 2,
    id: 'redis-hang-2026-09-08T10-00-00',
    plan,
    planFile: 'resilience/faults/redis-hang.json',
    note: '메모',
    run: {
      branch: 'feature/resilience',
      commit: 'abcdef1234567890',
      commitShort: 'abcdef12',
      buildNumber: 'local',
      executor: 'tester@box',
      scriptVersion: 'fingerprint0123456789',
      dataset: 'medium',
      datasetFingerprint: 'ds0123456789abcdef',
      baseUrl: 'http://localhost:18080',
      note: '메모',
    },
    appImage: {
      available: true,
      imageId: 'sha256:8fb9157900fe95158ec46056',
      imageRef: 'environment-app',
      imageCreated: '2026-09-01T00:00:00Z',
      labelCommit: null,
      stale: false,
      staleBySec: 0,
    },
    config: {
      assumedCount: 1,
      items: [
        { key: 'hikari.connectionTimeout', label: 'HikariCP 커넥션 획득 타임아웃', value: '30000ms', source: '설정 없음 → 프레임워크 기본값', assumed: true, why: '풀 고갈 시 여기까지 기다린다' },
        { key: 'redis.commandTimeout', label: 'Redis 명령 타임아웃 (Lettuce)', value: '2s', source: '컨테이너 환경변수 SPRING_DATA_REDIS_TIMEOUT', assumed: false, why: 'Redis 무응답 시 상한' },
        { key: 'health.pollTimeoutMs', label: '헬스 폴러 응답 상한 (관측 도구)', value: '4000ms', source: '관측 도구 설정 (resilience/lib/health.js)', assumed: false, why: '이 시간을 넘기면 무응답으로 기록된다' },
      ],
    },
    startedAt: t0.toISOString(),
    t0: t0.toISOString(),
    t0Source: 'k6-setup',
    endedAt: new Date(t0.getTime() + 150000).toISOString(),
    k6ExitCode: 0,
    env: { viaProxy: true, hikariMax: 10, tomcatMax: 400, baseUrl: 'http://localhost:18080', dbUrl: 'jdbc:mysql://toxiproxy:3306/highteenday', redisHost: 'toxiproxy', k6Version: 'k6 v0.49.0', k6Bin: 'k6', restore: null, flushRedis: false },
    k6: {
      phases: {
        pre: { durationSec: 60, httpReqs: 100, rps: 1.6, med: 10, p95: 50, p99: 80, max: 100, errorRate: 0, tps: 0.5 },
        fault: { durationSec: 30, httpReqs: 20, rps: 0.6, med: 60000, p95: 60001, p99: 60001, max: 60001, errorRate: 0.9, tps: 0.1 },
        post: { durationSec: 60, httpReqs: 90, rps: 1.5, med: 12, p95: 55, p99: 90, max: 200, errorRate: 0.01, tps: 0.5 },
      },
      failedLatency: { pre: { count: 0 }, fault: { count: 18, med: 60001, p90: 60001, p95: 60001, max: 60002 }, post: { count: 1, med: 5, p90: 5, p95: 5, max: 5 } },
      featureByPhase: { hot: { pre: { count: 10, p95: 20, errorRate: 0 }, fault: { count: 3, p95: 60001, errorRate: 1 }, post: { count: 9, p95: 21, errorRate: 0 } } },
      droppedIterations: 7,
      statusByPhase: { pre: { total: 0, byStatus: {} }, fault: { total: 15, byStatus: { '0': { count: 3, p95: 60000 }, '500': { count: 12, p95: 30001 } } }, post: { total: 0, byStatus: {} } },
      loadProfile: { fault_window: { executor: 'ramping-arrival-rate', maxVUs: 1000 } },
    },
    events: [
      { kind: 'inject', index: 0, tool: 'toxiproxy', action: 'add', target: 'redis', plannedAtSec: 60, actualAtSec: 60.2, ok: true, durationMs: 12, at: t0.toISOString(), detail: { name: 'hang', type: 'timeout' } },
      { kind: 'inject', index: 1, tool: 'toxiproxy', action: 'remove', target: 'redis', plannedAtSec: 90, actualAtSec: 90.1, ok: true, durationMs: 8, at: t0.toISOString(), detail: { removed: true } },
      { kind: 'cleanup', at: t0.toISOString(), reason: 'k6-exit', actions: ['toxic redis/hang 제거'] },
    ],
    health: [{ tSec: 0, status: 'UP', httpStatus: 200 }, { tSec: 65, status: 'DOWN', httpStatus: 503, components: { redis: 'DOWN', db: 'UP' } }],
    healthTransitions: [{ tSec: 0, status: 'UP', httpStatus: 200 }, { tSec: 65, status: 'DOWN', httpStatus: 503, components: { redis: 'DOWN', db: 'UP' } }],
    infra: {
      pre: { groups: [{ id: 'pool', label: 'Pool', metrics: [{ key: 'pool.tomcatBusy.max', label: 'busy max', value: 12, unit: 'count' }] }], flat: {}, errors: [] },
      fault: { groups: [{ id: 'pool', label: 'Pool', metrics: [{ key: 'pool.tomcatBusy.max', label: 'busy max', value: 400, unit: 'count' }] }], flat: {}, errors: [] },
    },
    series: { rps: [{ t: t0.getTime() / 1000 + 10, v: 1.5 }, { t: t0.getTime() / 1000 + 70, v: 0.2 }], tomcatBusy: [] },
    seriesErrors: [],
    healthByPhase: { pre: { count: 12, up: 12, down: 0, timeout: 0, unreachable: 0, latency: { p50: 8, p95: 20, max: 25 } }, fault: { count: 6, up: 0, down: 5, timeout: 1, unreachable: 0, latency: { p50: 4001, p95: 4005, max: 4010 } }, post: { count: 12, up: 12, down: 0, timeout: 0, unreachable: 0, latency: { p50: 9, p95: 30, max: 40 } } },
    faultMetrics: { outcomes: { pre: { items: [{ status: '200', outcome: 'SUCCESS', exception: null, count: 100 }], total: 100, failed: 0, otherCount: 0, otherKinds: 0 }, fault: { items: [{ status: '500', outcome: 'SERVER_ERROR', exception: null, count: 12 }], total: 12, failed: 12, otherCount: 0, otherKinds: 0 }, post: { items: [], total: 0, failed: 0, otherCount: 0, otherKinds: 0 } }, threads: { pre: { 'threads.runnable': 13, 'threads.blocked': 0, 'threads.waiting': 53, 'threads.timed-waiting': 20 }, fault: { 'threads.runnable': 10, 'threads.blocked': 0, 'threads.waiting': 53, 'threads.timed-waiting': 194 }, post: { 'threads.runnable': 20, 'threads.blocked': 0, 'threads.waiting': 10, 'threads.timed-waiting': 222 } }, errors: [], specs: [{ key: 'threads.runnable', label: 'JVM 스레드 runnable (max)', desc: '' }, { key: 'threads.timed-waiting', label: 'JVM 스레드 timed-waiting (max)', desc: '' }] },
  };
}

test('renderReport: 판정 단어 없이 가설·구간·실패 지연·헬스 전이를 담는다', () => {
  const html = renderReport(sampleRecord(), { siblings: [{ id: 'redis-hang-earlier', startedAt: '2026-09-07', commitShort: 'ffff0000' }] });
  assert.ok(html.includes('Redis 가 멈추면?'));
  assert.ok(html.includes('관측: (실행 뒤 채운다)'));
  assert.ok(html.includes('60,001') || html.includes('60001'));
  assert.ok(html.includes('DOWN'));
  assert.ok(html.includes('redis-hang-earlier'));
  assert.ok(html.includes('dropped_iterations'));
  assert.ok(!/PASS|FAIL|verdict|회귀/.test(html), '보고서에 판정 어휘가 있으면 안 된다');
});

test('renderReport: 프록시 필요한데 직결이면 경고를 띄운다', () => {
  const rec = sampleRecord();
  rec.env.viaProxy = false;
  const html = renderReport(rec);
  assert.ok(html.includes('프록시를 거치지 않는다'));
});

test('renderReport: 시계열이 비어도 렌더된다', () => {
  const rec = sampleRecord();
  rec.series = {};
  const html = renderReport(rec);
  assert.ok(html.includes('시계열 없음'));
});

test('renderReport: 주입한 toxic 의 종류와 속성이 보고서에 나온다', () => {
  const html = renderReport(sampleRecord());
  // 같은 "toxiproxy add" 라도 timeout(0) 과 latency 는 전혀 다른 장애다. 구분이 보여야 한다.
  assert.ok(html.includes('timeout'), 'toxic type 이 없다');
  assert.ok(html.includes('timeout=0'), 'toxic attributes 가 없다');
  assert.ok(html.includes('toxicity'), 'toxicity 가 없다');
  assert.ok(html.includes('"removed":true') || html.includes('removed'), '도구가 돌려준 실제 응답(detail)이 없다');
});

test('renderReport: 코드 신원(커밋·이미지·스크립트 지문)이 보고서에 나온다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('abcdef123456'), '커밋이 없다');
  assert.ok(html.includes('feature/resilience'), '브랜치가 없다');
  assert.ok(html.includes('8fb9157900fe'), '앱 이미지 해시가 없다');
  assert.ok(html.includes('fingerprint01234'), '부하 스크립트 지문이 없다');
  assert.ok(html.includes('medium') && html.includes('ds0123456789'), '데이터셋과 지문이 없다');
  assert.ok(html.includes('k6 v0.49.0'), 'k6 버전이 없다');
});

test('renderReport: 타임아웃 설정을 값·출처와 함께 보여 주고 가정한 값을 구분한다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('30000ms'));
  assert.ok(html.includes('SPRING_DATA_REDIS_TIMEOUT'), '실측 출처가 없다');
  assert.ok(html.includes('기본값 가정') || html.includes('프레임워크 기본값'), '가정한 값이라는 표시가 없다');
  // 해설은 상수가 아니라 이 실행에 기록된 값에서 나와야 한다.
  assert.ok(html.includes('2s'), 'Redis 타임아웃 실측값이 해설에 반영되지 않았다');
});

test('renderReport: 이미지가 소스보다 낡으면 경고한다', () => {
  const rec = sampleRecord();
  rec.appImage.stale = true;
  rec.appImage.staleBySec = 86400 * 3;
  const html = renderReport(rec);
  assert.ok(html.includes('옛 코드'), 'stale 경고가 없다');
});

test('renderReport: 커밋되지 않은 변경이 있으면 경고한다', () => {
  const rec = sampleRecord();
  rec.run.commit = 'abcdef1234567890+dirty';
  const html = renderReport(rec);
  assert.ok(html.includes('+dirty'));
  assert.ok(html.includes('재현되지 않는다'));
});

test('renderReport: 시계열 수집 실패를 "값 0" 과 구분해 표시한다', () => {
  const rec = sampleRecord();
  rec.series.hikariPending = [];
  rec.seriesErrors = ['hikariPending: connection refused'];
  const html = renderReport(rec);
  assert.ok(html.includes('수집 실패: connection refused'), '축별 수집 실패 표시가 없다');
  assert.ok(html.includes('모르는 상태'), '경고 블록에 수집 실패가 없다');
});

test('renderReport: 실행되지 않은 주입 단계를 표에 남긴다', () => {
  const rec = sampleRecord();
  rec.events = rec.events.filter((e) => e.index !== 1);
  const html = renderReport(rec);
  assert.ok(html.includes('실행 안 됨'), '누락된 주입 단계가 표에 없다');
});

test('renderReport: 옛 스키마(v1) 기록도 렌더되고 빠진 항목을 미기록으로 표시한다', () => {
  const rec = sampleRecord();
  delete rec.run;
  delete rec.appImage;
  delete rec.config;
  const html = renderReport(rec);
  assert.ok(html.includes('미기록'));
  assert.ok(html.includes('기록되지 않았다'), '설정 미기록 안내가 없다');
});

test('specOf: 도구별로 장애의 내용을 한 줄로 요약한다', () => {
  assert.match(specOf({ tool: 'toxiproxy', action: 'add', toxic: { name: 'slow', type: 'latency', attributes: { latency: 500, jitter: 50 } } }), /latency.*latency=500/s);
  assert.match(specOf({ tool: 'toxiproxy', action: 'remove', toxicName: 'slow' }), /slow/);
  assert.match(specOf({ tool: 'docker', action: 'kill', signal: 'SIGKILL' }), /kill.*SIGKILL/s);
  assert.match(specOf({ tool: 'pumba', args: ['stress', '--duration', '30s'] }), /stress/);
});

test('renderReport: 클라이언트 상태 코드와 서버 기록을 모두 보여 주고 차이를 짚는다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('0 (응답 없음)'), '응답 없음(status 0) 행이 없다');
  assert.ok(html.includes('SERVER_ERROR'), '서버가 기록한 결과가 없다');
  assert.ok(html.includes('클라이언트가 본 실패'), '양쪽 대조가 없다');
  assert.ok(html.includes('구간 경계에서 갈렸다'), '차이의 두 번째 원인 설명이 없다');
});

test('renderReport: 예외 라벨이 비는 것이 정상이라는 설명을 붙인다', () => {
  // 이 앱은 GlobalExceptionHandler 가 도메인 오류를 잡으므로 exception 라벨이 none 으로 남는다.
  // 그 사정을 적어 두지 않으면 빈 열이 "수집 실패"로 읽힌다.
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('GlobalExceptionHandler'));
});

test('renderReport: JVM 스레드 상태를 구간별로 보여 준다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('timed-waiting'));
  assert.ok(html.includes('194'), 'fault 구간 값이 없다');
});

test('renderReport: 헬스 무응답을 앱 장애와 구분해 표시한다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('무응답 (폴러 상한 초과)') || html.includes('무응답'), '무응답 구분이 없다');
  assert.ok(html.includes('관측 도구가'), '무응답이 앱 장애가 아니라는 설명이 없다');
  assert.ok(html.includes('4,000ms') || html.includes('4000ms'), '폴러 상한 값이 인용되지 않았다');
});

// 아래 세 테스트가 지키는 것: 60초 타임아웃 한 점이 섞인 지연 시계열에서도 평소의 수십 ms
// 가 축 바닥과 구분되어야 하고, 정확한 값은 축이 아니라 마우스 오버로 읽을 수 있어야 한다.
const CHART_BASE = {
  t0: new Date('2026-09-08T10:00:00Z'),
  phases: { preSec: 60, faultSec: 30, postSec: 60 },
  events: [],
};

/** 폴리라인 `d` 에서 각 점의 y 좌표만 뽑는다. 뷰박스 기준이라 아래로 갈수록 값이 크다. */
function pathYs(html) {
  const m = /<path d="([^"]*)"/.exec(html);
  return m[1].trim().split(' ').map((s) => Number(s.replace(/^[ML]/, '').split(',')[1]));
}

function latencyPoints() {
  const base = CHART_BASE.t0.getTime() / 1000;
  return [{ t: base + 10, v: 30 }, { t: base + 70, v: 60000 }, { t: base + 130, v: 45 }];
}

test('chart: 로그 축은 자릿수가 다른 값을 축 바닥에 눌러붙이지 않는다', () => {
  const pts = latencyPoints();
  const BOTTOM = 122; // H(140) - B(18)
  const linear = pathYs(chart('p95', pts, { ...CHART_BASE, unit: 'ms' }));
  const log = pathYs(chart('p95', pts, { ...CHART_BASE, unit: 'ms', logScale: true }));
  assert.ok(BOTTOM - linear[0] < 1, `선형 축에서는 30ms 가 바닥에 붙는다 (y=${linear[0]})`);
  assert.ok(BOTTOM - log[0] > 8, `로그 축에서 30ms 가 여전히 바닥에 붙어 있다 (y=${log[0]})`);
  // 30ms 와 45ms 는 1.5배 차이다. 로그 축에서도 두 점의 높이가 달라야 "평소 구간이 평평한
  // 선"으로 뭉개지지 않는다.
  assert.ok(Math.abs(log[0] - log[2]) > 3, '로그 축에서 30ms 와 45ms 가 같은 높이다');
});

test('chart: 로그 축은 10배 눈금과 축 종류를 제목에 밝힌다', () => {
  const html = chart('p95', latencyPoints(), { ...CHART_BASE, unit: 'ms', logScale: true });
  assert.ok(html.includes('로그 축'), '축 종류가 제목에 없다 — 배수로 읽어야 하는지 알 수 없다');
  assert.ok(html.includes('>100k<') || html.includes('>10k<'), '10의 거듭제곱 눈금 라벨이 없다');
});

test('chart: 각 표본의 원값을 마우스 오버용으로 함께 싣는다', () => {
  const html = chart('p95', latencyPoints(), { ...CHART_BASE, unit: 'ms', logScale: true });
  const m = /data-pts="([^"]*)"/.exec(html);
  assert.ok(m, 'data-pts 가 없다 — 마우스를 올려도 읽을 값이 없다');
  const pts = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.equal(pts.length, 3);
  // [x, y, t0 이후 초, 원값] — 원값은 축 변환을 거치지 않은 그대로여야 한다.
  assert.equal(pts[1][3], 60000);
  assert.equal(pts[1][2], 70);
  assert.ok(html.includes('data-t0="') && html.includes('data-pre="60"'), '구간·시각 계산에 필요한 기준이 없다');
});

test('renderReport: 그래프 판독 스크립트와 읽는 법 안내가 함께 나간다', () => {
  const html = renderReport(sampleRecord());
  assert.ok(html.includes('마우스를 올리면'), '마우스 오버로 값을 읽을 수 있다는 안내가 없다');
  assert.ok(html.includes("querySelectorAll('.chart[data-pts]')"), '판독 스크립트가 없다');
});

// ---------------------------------------------------------------------------
// 맨 위 요약 그리드와 자원 포화도
// ---------------------------------------------------------------------------

test('meter: 70/85/95 경계에서 색이 바뀐다', () => {
  const { meter } = require('../lib/report');
  assert.doesNotMatch(meter(69), /class="fill (w|s|c)"/);
  assert.match(meter(70), /class="fill w"/);
  assert.match(meter(85), /class="fill s"/);
  assert.match(meter(95), /class="fill c"/);
  // 못 읽은 값은 0% 막대가 아니라 빈 칸이다 — 0 으로 그리면 "자원이 놀았다"로 읽힌다.
  assert.match(meter(null), /—/);
  assert.doesNotMatch(meter(null), /<div class="meter">/);
});

test('포화도 표: 구간을 나란히 놓고 한계값을 함께 적는다', () => {
  const { saturationTable } = require('../lib/report');
  const html = saturationTable({
    pre: { flat: { 'saturation.hikariPct': 10, 'pool.hikariActive.max': 1, 'pool.hikariMax': 10 } },
    fault: { flat: { 'saturation.hikariPct': 100, 'pool.hikariActive.max': 10, 'pool.hikariMax': 10 } },
  });
  assert.match(html, /HikariCP/);
  assert.match(html, /class="fill c"/); // fault 100%
  assert.match(html, /10 \/ 10/); // 한계는 fault 구간 기준
});

test('요약 그리드: 먼저 봐야 할 값이 맨 위에 나오고 나쁜 값은 표시된다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  const grid = html.indexOf('<div class="kpis">');
  assert.ok(grid > 0 && grid < html.indexOf('<h2>1.'), '그리드가 1번 절보다 앞에 있어야 한다');
  for (const label of ['장애 중 오류율', '장애 중 p95', '실패까지 걸린 시간', '탐지 지연', '데이터 정확성']) {
    assert.ok(html.includes(label), `${label} 타일이 없다`);
  }
  // 오류율 90% 는 눈에 띄어야 한다.
  assert.match(html, /class="kpi bad"/);
  // 타임아웃 상한은 분으로 접지 않는다 — 60,001ms 가 그대로 보여야 원인이 읽힌다.
  assert.match(html, /60,001ms/);
});

test('요약 그리드: 유실과 불일치를 다른 제목으로 적는다', () => {
  /** S0 → S3 두 표본만 있는 최소 레코드. 프로브가 요구하는 값만 채운다. */
  function withIntegrity(probes, values0, values3, k6extra) {
    const rec = sampleRecord();
    const s = (label, values) => ({ label, at: '2026-09-08T10:00:00Z', tSec: 0, ok: true, values, elapsedMs: 1, error: null });
    rec.integrity = { probes, samples: [s('S0', values0), s('S3', values3)] };
    Object.assign(rec.k6, k6extra || {});
    return rec;
  }

  // counter-drift: 행은 5건 늘었는데 카운터는 3건만 늘었다 → 값이 틀린 것이지 사라진 게 아니다.
  const mismatch = renderReport(withIntegrity(
    ['counter-drift'],
    { sumLike: 100, sumDislike: 0, rowsLike: 100, rowsDislike: 0 },
    { sumLike: 103, sumDislike: 0, rowsLike: 105, rowsDislike: 0 },
  ), { siblings: [] });
  assert.match(mismatch, /데이터 불일치/);

  // viewcount-conservation: 올랐어야 할 500 중 300 만 올랐다 → 사라진 몫이 있다.
  const loss = renderReport(withIntegrity(
    ['viewcount-conservation'],
    { dbViews: 1000, bufSum: 0, bufKeys: 0, dedupKeys: 0 },
    { dbViews: 1300, bufSum: 0, bufKeys: 0, dedupKeys: 0 },
    { viewExpected: 500, viewUnknown: 0 },
  ), { siblings: [] });
  assert.match(loss, /데이터 유실/);
});

test('요약 그리드: 불변식을 안 고른 계획은 "안 쟀다" 로 남는다 — 0 건 유실이 아니다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  assert.match(html, /안 쟀다/);
});

test('폴백 계측이 없는 옛 실행은 "0 번 돌았다"가 아니라 "모른다"로 남는다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  // sampleRecord 에는 redisFallbacks 도 contentChecks 도 없다 — 계측을 넣기 전 실행을 흉내낸다.
  assert.match(html, /Redis 폴백 카운터 미수집/);
  assert.match(html, /폴백 0 회를 뜻하지 않는다/);
  assert.match(html, /응답 내용 검사 미실시/);
});

/** 폴백이 돈 실행을 흉내낸다. 세 구간 모두 같은 메서드 목록을 갖되 fault 만 값이 있다. */
function withFallbacks(rec) {
  const methods = (fault) => Object.entries(fault).map(([method, count]) => ({ method, count }));
  const zero = {
    'RedisHotPostRanking.topPostIds': 0,
    'RedisPostsCache.getPostPrevs': 0,
    'RedisViewCountStore.tryMarkViewed': 0,
    'RedisViewCountStore.incrementCount': 0,
  };
  rec.faultMetrics.redisFallbacks = {
    pre: { items: methods(zero), fired: 0, total: 0 },
    fault: {
      items: methods({
        'RedisHotPostRanking.topPostIds': 98,
        'RedisPostsCache.getPostPrevs': 0,
        'RedisViewCountStore.tryMarkViewed': 312,
        'RedisViewCountStore.incrementCount': 0,
      }),
      fired: 2,
      total: 410,
    },
    post: { items: methods(zero), fired: 0, total: 0 },
  };
  return rec;
}

test('폴백 발동 표는 0 인 메서드도 행으로 남긴다 — 안 돈 폴백이 사라지면 대조할 것이 없다', () => {
  const html = renderReport(withFallbacks(sampleRecord()), { siblings: [] });
  assert.match(html, /RedisViewCountStore\.tryMarkViewed/);
  assert.match(html, /312/);
  assert.match(html, /410/, '구간 합계가 보여야 "몇 번 삼켰나"에 답이 된다');
  assert.match(html, /RedisPostsCache\.getPostPrevs/,
    'fault 구간에 한 번도 안 돈 메서드가 행에서 사라지면 "경로를 안 밟았나"와 "예외가 안 잡혔나"를 못 가른다');
  assert.match(html, /발동한 메서드 수/);
  assert.match(html, /<b>2<\/b> \/ 4개/,
    '메서드가 십수 개면 행을 세지 않는다 — 몇 개가 돌았는지를 표가 직접 적어야 한다');
});

test('경로 표는 메서드 이름과 검사 이름을 한 줄로 잇는다 — 독자가 코드로 연결하지 않아도 된다', () => {
  const rec = withFallbacks(sampleRecord());
  rec.k6.contentChecks = {
    hot_daily_nonempty: {
      pre: { total: 120, passes: 120, fails: 0, rate: 1 },
      fault: { total: 60, passes: 60, fails: 0, rate: 1 },
      post: { total: 110, passes: 110, fails: 0, rate: 1 },
    },
  };
  const html = renderReport(rec, { siblings: [] });
  const start = html.indexOf('<h2>7.');
  const sec = html.slice(start, html.indexOf('7-2.', start));

  assert.match(sec, /인기글/);
  assert.match(sec, /98회/, '그 경로의 메서드 발동 합이 경로 행에 나와야 한다');
  assert.match(sec, /60건 전부 채워짐/, '같은 행에서 응답 내용까지 읽혀야 한다');
  // 게시글 상세는 메서드 둘 중 tryMarkViewed 만 돌고 incrementCount 는 0 이다. 합계만
  // 내면 그 0 이 묻히는데, 그 0 이 바로 조회수가 사라진 자리다.
  assert.match(sec, /메서드 2개 중 <b>1개 발동<\/b>, 1개 안 돎/,
    '경로 안에서 몇 개가 돌고 몇 개가 안 돌았는지 적혀야 한다');
  assert.match(sec, /incrementCount <b>0<\/b>/, '안 돈 메서드의 이름과 0 이 같이 보여야 한다');
  // 폴백이 동작한 것과 손실이 없는 것은 다르다. 그 차이를 어디서 보는지까지 적혀야 한다.
  assert.match(sec, /viewcount-conservation/,
    '조회수 유실은 이 절 표로는 안 보이므로, 어느 절을 봐야 하는지 적혀 있어야 한다');
  assert.match(sec, /대조군/, 'Redis 를 안 쓰는 경로가 있어야 폭발 반경이 경계를 넘었는지 읽힌다');
});

test('내용 검사가 깨진 구간은 오류율 0% 여도 빈 응답 건수를 드러낸다', () => {
  const rec = sampleRecord();
  rec.k6.contentChecks = {
    hot_daily_nonempty: {
      pre: { total: 120, passes: 120, fails: 0, rate: 1 },
      fault: { total: 60, passes: 0, fails: 60, rate: 0 },
      post: { total: 110, passes: 110, fails: 0, rate: 1 },
    },
  };
  const html = renderReport(rec, { siblings: [] });
  assert.match(html, /hot_daily_nonempty/);
  assert.match(html, /60건 빈 응답/, '200 인데 본문이 빈 응답 수가 그대로 보여야 한다');
  assert.match(html, /전부 채워짐/, 'pre 가 정상이어야 fault 의 실패를 폴백 탓으로 읽을 수 있다');
});

/**
 * DB 부담 표에 값을 넣는다. 실제 수집 구조와 같은 모양이어야 한다 —
 * infra[phase].groups[].metrics[] 의 각 항목이 {key, label, value, unit}.
 */
function withDbBurden(rec, over = {}) {
  const base = {
    'efficiency.dbTimeMsPerReq': [3.42, 4.20, 4.78],
    'efficiency.dbCpuMsPerReq': [5.54, 5.95, 7.70],
    'efficiency.rowsPerReq': [603.8, 716.4, 944.2],
    'efficiency.selectPerReq': [6.16, 7.02, 7.41],
    'efficiency.rowsPerSelect': [98.1, 102.0, 127.4],
    // 실측(redis-crash-2026-09-14T04-11-01)과 같은 모양이다. 버퍼풀을 64MB 로 줄여
    // 적중률이 99.6% 로 내려왔는데도 요청당 디스크 읽기는 세 구간 모두 0 이었다 —
    // 미스는 나지만 호스트 페이지 캐시가 받아내 블록 읽기까지 가지 않는다.
    'efficiency.diskReadPerReq': [0, 0, 0],
    'mysql.bufferPoolHitPct': [99.6, 99.6, 99.6],
    ...over,
  };
  const unit = (k) => (k.endsWith('MsPerReq') ? 'ms' : (k === 'mysql.bufferPoolHitPct' ? 'percent' : (k.endsWith('diskReadPerReq') ? 'bytes' : 'count')));
  ['pre', 'fault', 'post'].forEach((p, i) => {
    rec.infra = rec.infra || {};
    rec.infra[p] = {
      groups: [{
        id: 'efficiency',
        label: '효율',
        metrics: Object.entries(base).map(([k, v]) => ({ key: k, label: k, value: v[i], unit: unit(k) })),
      }],
    };
  });
  return rec;
}

test('DB 부담 표는 요청당 값으로 pre 대비 변화율을 낸다', () => {
  const html = renderReport(withDbBurden(sampleRecord()), { siblings: [] });
  assert.match(html, /요청당 MySQL CPU/);
  // 5.54 → 5.95 = (5.95-5.54)/5.54 = +7.4%
  assert.match(html, /\+7\.4%/, 'pre 대비 변화율이 있어야 "얼마나 더 힘들어졌나"가 읽힌다');
  assert.match(html, /SELECT당 읽은 행/);
});

test('요청당 DB 시간은 구성을 표준화한 값을 기준으로 보이고, 단순 평균과 다르면 경고한다', () => {
  const rec = withDbBurden(sampleRecord());
  // 두 엔드포인트 모두 느려졌지만 비싼 쪽(search)의 비중이 줄어 단순 평균은 내려간 상태.
  rec.faultMetrics.dbTime = {
    pre: {
      requests: 1000, rawMsPerReq: 16.4, standardizedMsPerReq: 16.4, mixWeightCovered: 1,
      byUri: { '/cheap': { count: 800, msPerReq: 2 }, '/search': { count: 200, msPerReq: 74 } },
    },
    fault: {
      requests: 1000, rawMsPerReq: 5.46, standardizedMsPerReq: 18.6, mixWeightCovered: 1,
      byUri: { '/cheap': { count: 980, msPerReq: 4 }, '/search': { count: 20, msPerReq: 77 } },
    },
  };
  const html = renderReport(rec, { siblings: [] });

  assert.match(html, /pre 구성으로 표준화/);
  assert.match(html, /18\.60ms/, '표준화한 값이 기준이므로 그대로 보여야 한다');
  assert.match(html, /5\.46ms/, '단순 평균도 같이 보여야 둘이 다르다는 사실이 드러난다');
  assert.match(html, /구간 간 요청 구성이 다르므로/,
    '두 값이 벌어지면 어느 쪽으로 읽어야 하는지 표가 직접 말해야 한다');
  // 16.4 → 18.6 = +13.4%
  assert.match(html, /\+13\.4%/);
  assert.match(html, /\/search/, '어느 엔드포인트가 얼마나 느려졌는지도 같이 보여야 한다');
});

test('지연 증가를 DB 몫과 DB 밖 몫으로 가르고, DB 밖이 지배하면 그렇게 말한다', () => {
  const rec = withDbBurden(sampleRecord());
  // 2026-09-14 실행의 /api/posts/{postId}: 서버 7.1 → 108.5ms 인데 DB 는 2.7 → 2.6ms.
  rec.faultMetrics.dbTime = {
    pre: {
      requests: 1000, rawMsPerReq: 3.61, standardizedMsPerReq: 3.61, mixWeightCovered: 1,
      byUri: { '/api/posts/{postId}': { count: 900, msPerReq: 2.7, srvMsPerReq: 7.1 } },
    },
    fault: {
      requests: 250, rawMsPerReq: 4.30, standardizedMsPerReq: 4.17, mixWeightCovered: 1,
      byUri: { '/api/posts/{postId}': { count: 225, msPerReq: 2.6, srvMsPerReq: 108.5 } },
    },
  };
  const html = renderReport(rec, { siblings: [] });

  assert.match(html, /지연 증가의 출처/);
  // 108.5 - 7.1 = +101.4ms, 그중 DB 는 2.6 - 2.7 = -0.10ms, 나머지 101.5ms 가 DB 밖
  assert.match(html, /\+101\.4ms/);
  assert.match(html, /\+101\.5ms/, 'DB 밖 몫이 뺄셈으로 그대로 나와야 한다');
  assert.match(html, /지연 증가의 대부분이 DB 밖에서 발생했다/,
    'DB 몫이 1% 도 안 되는데 "DB 에 무리가 갔다"로 읽히면 안 된다');
});

test('지연 증가가 DB 때문이면 DB 밖 경고를 띄우지 않는다', () => {
  const rec = withDbBurden(sampleRecord());
  rec.faultMetrics.dbTime = {
    pre: {
      requests: 1000, rawMsPerReq: 3.6, standardizedMsPerReq: 3.6, mixWeightCovered: 1,
      byUri: { '/api/posts/{postId}': { count: 900, msPerReq: 3.0, srvMsPerReq: 7.0 } },
    },
    fault: {
      requests: 250, rawMsPerReq: 50, standardizedMsPerReq: 50, mixWeightCovered: 1,
      byUri: { '/api/posts/{postId}': { count: 225, msPerReq: 48.0, srvMsPerReq: 53.0 } },
    },
  };
  const html = renderReport(rec, { siblings: [] });
  // 53.0 - 7.0 = +46.0ms, 그중 DB 가 48.0 - 3.0 = +45.0ms (97.8%)
  assert.match(html, /\+45\.00ms/);
  assert.ok(!/지연 증가의 대부분이 DB 밖에서 발생했다/.test(html),
    'DB 가 원인인 실행에까지 경고를 띄우면 진짜 경고가 무시된다');
});

test('버퍼풀에 데이터가 다 들어가면 "영향이 작다"가 아니라 "잴 수 없었다"로 경고한다', () => {
  const html = renderReport(withDbBurden(sampleRecord()), { siblings: [] });
  assert.match(html, /캐시 상실 비용을 측정하지 못한다/);
  assert.match(html, /영향이 작다는 뜻이 아니라 <b>측정되지 않았다<\/b>/,
    '적중률 100% · 디스크 읽기 0 이면 실험 조건이 결론을 못 내게 만든 것이다');
});

test('버퍼풀 미스가 디스크까지 내려가면 그 경고를 띄우지 않는다', () => {
  const rec = withDbBurden(sampleRecord(), {
    'mysql.bufferPoolHitPct': [98.7, 96.2, 98.1],
    'efficiency.diskReadPerReq': [1200, 4800, 2100],
  });
  const html = renderReport(rec, { siblings: [] });
  assert.ok(!/캐시 상실 비용을 측정하지 못한다/.test(html),
    '디스크까지 내려간 실행에까지 경고를 띄우면 진짜 경고가 무시된다');
  // 1200 → 4800 = +300%
  assert.match(html, /\+300\.0%/);
});

test('인프라 원자료는 전부 접혀 있다 — 펼쳐 두면 포화도가 아래로 밀린다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  // 절 번호를 박지 않는다. 앞에 절이 하나 추가되면 번호가 전부 밀려, 검사하려던 내용과
  // 무관한 이유로 이 테스트가 깨진다(실제로 7번 절을 넣었을 때 깨졌다).
  const start = html.indexOf('지표 원자료');
  const infra = html.slice(start, html.indexOf('<h2>', start));
  assert.match(infra, /<details><summary class="sub">Pool — 지표 1개<\/summary>/);
});
