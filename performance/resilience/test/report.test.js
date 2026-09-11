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
  for (const label of ['장애 중 오류율', '장애 중 p95', '실패까지 걸린 시간', '탐지 지연', '데이터 유실']) {
    assert.ok(html.includes(label), `${label} 타일이 없다`);
  }
  // 오류율 90% 는 눈에 띄어야 한다.
  assert.match(html, /class="kpi bad"/);
  // 타임아웃 상한은 분으로 접지 않는다 — 60,001ms 가 그대로 보여야 원인이 읽힌다.
  assert.match(html, /60,001ms/);
});

test('요약 그리드: 불변식을 안 고른 계획은 "안 쟀다" 로 남는다 — 0 건 유실이 아니다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  assert.match(html, /안 쟀다/);
});

test('인프라 원자료는 전부 접혀 있다 — 펼쳐 두면 포화도가 아래로 밀린다', () => {
  const html = renderReport(sampleRecord(), { siblings: [] });
  const infra = html.slice(html.indexOf('지표 원자료'), html.indexOf('<h2>11.'));
  assert.match(infra, /<details><summary class="sub">Pool — 지표 1개<\/summary>/);
});
