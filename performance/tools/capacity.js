#!/usr/bin/env node
/**
 * capacity — 계단식 breakpoint 실행에서 용량 세 지점을 읽는다.
 *
 * 무엇을 답하는가
 * ---------------
 *   R_slo   전체 p95 가 SLO 를 넘는 첫 계단. 운영 기준 용량이다.
 *   R_knee  도달률(실제 iterations/s ÷ 목표)이 98% 아래로 떨어지는 첫 계단.
 *           부하 발생기가 계획한 부하를 더 못 넣었다는 뜻이고, 곧 처리율 상한이다.
 *   병목    그 계단에서 한계에 가장 가까웠던 자원.
 *
 * 왜 창 집계로는 안 되는가
 * ------------------------
 * `collectInfra` 는 실행 하나를 값 하나로 접는다. 계단 7개짜리 실행을 접으면 "CPU 최대 98%"
 * 만 남고 그게 몇 iterations/s 였는지가 사라진다. 그래서 `collectSeries` 가 남긴 5초 간격
 * 시계열을 계단 경계로 잘라 계단마다 따로 요약한다. 경계는 k6 가 기록한 stages 에서 복원하므로
 * 실행 뒤에 계단을 바꿔도 저장된 원자료를 다시 읽을 수 있다.
 *
 * 각 유지 구간의 앞 30초는 버린다. k6 지표는 30초 rate 창으로 계산되어 그동안은 앞 계단의
 * 값이 섞여 있기 때문이다. 유지 90초면 남는 60초에 5초 간격 표본 12개가 들어간다.
 *
 * 사용법
 *   node tools/capacity.js <runId>              reports/runs/<runId>/run.json
 *   node tools/capacity.js <경로/run.json>
 *   node tools/capacity.js <runId> --slo 500    SLO p95 (기본 500ms)
 *   node tools/capacity.js <runId> --json       표 대신 JSON
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** k6 지표의 rate 창. 이 길이만큼은 앞 계단 값이 섞여 있어 유지 구간 앞에서 잘라낸다. */
const RATE_WINDOW_SEC = 30;
/** 도달률이 이 아래로 떨어지면 무릎으로 본다. 기준은 lib/saturation.js 와 같은 값을 쓴다. */
const KNEE_PCT = 98;
/** 한계의 이 비율을 넘은 표본을 "포화"로 센다. 상한에 정확히 닿지 않아도 대기는 이미 생긴다. */
const SAT_RATIO = 0.95;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 시계열에서 [fromSec, toSec) 구간의 값만 고른다. t 는 초 단위 절대 시각이다. */
function slice(series, fromSec, toSec) {
  return (series || [])
    .filter((p) => p.t >= fromSec && p.t < toSec && Number.isFinite(p.v))
    .map((p) => p.v);
}

/** k6 duration 문자열("90s", "1m30s")을 초로 바꾼다. */
function durationSec(text) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(String(text).trim());
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

/**
 * stages 에서 유지 구간만 복원한다.
 *
 * 계단 하나는 `{전환, target}` + `{유지, target}` 두 stage 로 되어 있다. target 이 직전
 * stage 와 같은 stage 가 유지 구간이다. 전환 구간은 도착률이 변하는 중이라 정상 상태가
 * 아니므로 요약에서 뺀다.
 */
function holdWindows(scenario, t0Sec) {
  const stages = Array.isArray(scenario.stages) ? scenario.stages : [];
  const out = [];
  let at = t0Sec;
  let prevTarget = Number(scenario.startRate);
  for (const st of stages) {
    const sec = durationSec(st.duration);
    const target = Number(st.target);
    if (sec == null) return out;
    if (target === prevTarget) {
      out.push({ target, fromSec: at, toSec: at + sec, holdSec: sec });
    }
    at += sec;
    prevTarget = target;
  }
  return out;
}

/** 값이 없으면 '—', 있으면 소수 자리를 맞춘 문자열. */
function num(v, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

/**
 * 계단별 요약을 만든다.
 *
 * @param {object} rec 저장된 실행 레코드(run.json).
 * @param {{sloP95Ms:number}} opts SLO 기준.
 */
function analyze(rec, opts) {
  const profile = (rec.run && rec.run.loadProfile) || (rec.k6 && rec.k6.loadProfile) || null;
  const scenario = profile
    ? Object.values(profile).find((s) => s && s.executor === 'ramping-arrival-rate')
    : null;
  if (!scenario) throw new Error('ramping-arrival-rate 시나리오가 없다 — 계단식 실행이 아니다');

  // 성능 실행은 run.startedAt, 장애 실행은 t0(k6 setup 신호로 잡은 부하 시작 시각)을 쓴다.
  const t0Sec = Date.parse((rec.run && rec.run.startedAt) || rec.t0) / 1000;
  if (!Number.isFinite(t0Sec)) throw new Error('run.startedAt 도 t0 도 없어 계단 경계를 세울 수 없다');

  const s = rec.series || {};
  if (!Object.keys(s).length) throw new Error('series 가 없다 — 시계열 수집 전에 저장된 실행이다');

  // 장애 실행의 infra 는 구간별로 나뉘어 있다({pre, fault, post}). 자원 한계는 구간과
  // 무관한 값이므로 어느 구간에서 읽어도 같다.
  const infra = rec.infra || {};
  const flat = infra.flat
    || (infra.fault && infra.fault.flat) || (infra.pre && infra.pre.flat) || {};

  // 장애 실행이면 계단 위에 pre/fault/post 구간이 겹친다. 장애 밖 계단을 용량 판정에
  // 섞으면 "장애 중 상한"이 아니라 두 조건의 평균을 재게 된다.
  const ph = (rec.plan && rec.plan.phases) || null;
  const faultFrom = ph ? t0Sec + ph.preSec : null;
  const faultTo = ph ? t0Sec + ph.preSec + ph.faultSec : null;
  const phaseOf = (w) => {
    if (!ph) return null;
    if (w.toSec <= faultFrom) return 'pre';
    if (w.fromSec >= faultTo) return 'post';
    return 'fault';
  };
  const limits = {
    cpuCores: flat['cpu.limitCores'],
    tomcatMax: flat['pool.tomcatMax'],
    hikariMax: flat['pool.hikariMax'],
    maxVUs: scenario.maxVUs,
  };

  const steps = holdWindows(scenario, t0Sec)
    // 앞 30초를 버리고 나면 표본이 남지 않는 stage 가 있다. 계단식 장애 계획에서 pre 의
    // 도착률과 첫 계단이 같으면 전환 stage 가 평평해져 이런 창이 생긴다.
    .filter((w) => w.toSec - (w.fromSec + RATE_WINDOW_SEC) >= 5)
    .map((w) => {
    // 앞 30초는 rate 창이 앞 계단을 물고 있어 버린다.
    const from = w.fromSec + RATE_WINDOW_SEC;
    const pick = (key) => slice(s[key], from, w.toSec);

    const iterations = pick('k6ts.iterations');
    const actualRate = median(iterations);
    const p95 = pick('k6ts.p95');
    const cpu = pick('cpu.cores');
    const tomcat = pick('pool.tomcatBusy');
    const hikari = pick('pool.hikariActive');
    const pending = pick('pool.hikariPending');
    const mysql = pick('mysql.threadsRunning');
    const vus = pick('k6ts.vus');
    const dropped = pick('k6ts.droppedIterations');
    const errorPct = pick('k6ts.errorPct');
    const heap = pick('heap.used');

    const max = (arr) => (arr.length ? Math.max(...arr) : null);
    const pct = (value, limit) => (Number.isFinite(value) && limit > 0 ? (value / limit) * 100 : null);
    // 최댓값만 보면 12개 표본 중 하나가 튄 계단과 일곱이 상한에 붙어 있던 계단이 똑같이
    // 100% 로 보인다. 앞은 순간 부하이고 뒤는 지속 포화라 대응이 다르므로 함께 센다.
    const satShare = (arr, limit) => (arr.length && limit > 0
      ? arr.filter((v) => v >= limit * SAT_RATIO).length / arr.length : null);
    const satCount = (arr, limit) => (arr.length && limit > 0
      ? arr.filter((v) => v >= limit * SAT_RATIO).length : 0);

    return {
      target: w.target,
      phase: phaseOf(w),
      samples: p95.length,
      actualRate,
      // 도달률은 iterations 축이 있어야 계산된다. 없으면 null 로 두고 표에 "미수집"으로 적는다.
      achievedPct: Number.isFinite(actualRate) ? (actualRate / w.target) * 100 : null,
      p95Median: median(p95),
      p95Max: max(p95),
      errorPctMax: max(errorPct),
      cpuPct: pct(max(cpu), limits.cpuCores),
      tomcatPct: pct(max(tomcat), limits.tomcatMax),
      hikariPct: pct(max(hikari), limits.hikariMax),
      tomcatSatShare: satShare(tomcat, limits.tomcatMax),
      tomcatSatCount: satCount(tomcat, limits.tomcatMax),
      hikariSatShare: satShare(hikari, limits.hikariMax),
      hikariSatCount: satCount(hikari, limits.hikariMax),
      cpuSatShare: satShare(cpu, limits.cpuCores),
      poolSamples: tomcat.length,
      hikariPendingMax: max(pending),
      mysqlThreadsMax: max(mysql),
      vusMax: max(vus),
      droppedMax: max(dropped),
      heapMax: max(heap),
      // 부하 발생기가 상한에 닿았으면 이 계단은 앱이 아니라 발생기를 잰 것이다.
      generatorBound: Number.isFinite(max(vus)) && limits.maxVUs > 0
        && max(vus) >= limits.maxVUs * 0.99,
      // 앱이 워커를 다 쓰면 /actuator/prometheus 도 같은 워커 풀에서 응답하므로 스크레이프가
      // 끊긴다. 그러면 Tomcat·Hikari·heap 이 정작 필요한 계단에서만 비는데, 그 계단을
      // "자원 여유 있음"으로 읽으면 정반대 결론이 된다. 표본이 절반 미만이면 무효로 본다.
      appScrapeSamples: tomcat.length,
      expectedSamples: Math.floor((w.toSec - from) / 5),
    };
  });

  // 발생기 한계에 닿았거나 앱 지표가 끊긴 계단은 앱을 잰 것이 아니므로 판정에서 뺀다.
  for (const st of steps) {
    st.valid = !st.generatorBound
      && (st.expectedSamples === 0 || st.appScrapeSamples >= st.expectedSamples / 2);
  }
  // 장애 실행이면 fault 구간의 계단만 판정에 쓴다. pre 는 같은 실행 안의 무장애 대조군이라
  // 표에는 남기되 상한 계산에서는 뺀다.
  const valid = steps.filter((st) => st.valid && (st.phase === null || st.phase === 'fault'));

  // 계단 간격이 넓으면 경계는 한 점이 아니라 구간이다. `40 iterations/s 간격에서
  // 60 은 통과하고 100 은 넘었다`가 관측이 말할 수 있는 전부이므로 그대로 돌려준다.
  // 한 값으로 못 박으면 다음 사람이 그 값을 잰 것으로 읽는다.
  const bracket = (hit) => {
    const i = valid.findIndex((st, idx) => hit(st, idx));
    if (i < 0) return null;
    return { step: valid[i], lastOk: i > 0 ? valid[i - 1] : null };
  };
  const rSlo = bracket((st) => Number.isFinite(st.p95Median) && st.p95Median > opts.sloP95Ms);
  // 도달률이 한 계단에서만 임계를 스치고 다음 계단에서 회복하면 그건 용량 한계가 아니라
  // 실행기 지터다. 실측에서 65 가 97.96% 로 걸렸다가 80 에서 99.59% 로 돌아온 적이 있다.
  // 뒤따르는 유효 계단이 하나라도 임계 위로 돌아오면 무릎으로 세지 않는다.
  const rKnee = bracket((st, i) => Number.isFinite(st.achievedPct) && st.achievedPct < KNEE_PCT
    && valid.slice(i + 1).every((later) => !Number.isFinite(later.achievedPct)
      || later.achievedPct < KNEE_PCT));

  // 병목은 무릎 계단이 아니라 **실제로 포화가 보인 계단**에서 고른다. 무릎 계단이
  // 여유로운데도 도달률만 살짝 못 미친 경우, 그 계단의 자원 사용률을 병목이라 부르면
  // "CPU 29%가 병목" 같은 답이 나온다.
  // 최댓값이 아니라 **지속 포화 비율**로 고른다. 한 표본이 튄 계단을 병목이라 부르면
  // 실제로 계속 차 있던 계단을 놓친다.
  const worst = valid
    .map((st) => ({ st, top: Math.max(st.cpuSatShare || 0, st.tomcatSatShare || 0, st.hikariSatShare || 0) }))
    .filter((x) => x.top > 0)
    .sort((a, b) => b.top - a.top || a.st.target - b.st.target)[0] || null;
  const bottleneck = worst
    ? {
      at: worst.st.target,
      samples: worst.st.poolSamples,
      ranked: [
        { name: 'CPU', pct: worst.st.cpuPct, share: worst.st.cpuSatShare, count: 0 },
        { name: 'Tomcat 스레드', pct: worst.st.tomcatPct, share: worst.st.tomcatSatShare, count: worst.st.tomcatSatCount },
        { name: 'HikariCP', pct: worst.st.hikariPct, share: worst.st.hikariSatShare, count: worst.st.hikariSatCount },
      ].filter((x) => Number.isFinite(x.pct)).sort((a, b) => (b.share || 0) - (a.share || 0) || b.pct - a.pct),
    }
    : null;

  // 목표를 아무리 올려도 실제 처리율이 더 오르지 않는 지점. 유효하지 않은 계단도 포함해
  // 본다 — 발생기가 모자란 계단이라도 앱이 실제로 낸 처리율은 관측값이다.
  const ceiling = steps.reduce((best, st) => (
    Number.isFinite(st.actualRate) && (!best || st.actualRate > best.actualRate) ? st : best), null);

  return { steps, valid, limits, rSlo, rKnee, bottleneck, ceiling, sloP95Ms: opts.sloP95Ms };
}

function printTable(result, runId) {
  const { steps, limits } = result;
  console.log(`\n계단별 용량 판정 — ${runId}`);
  console.log(`한계: CPU ${num(limits.cpuCores, 0)}코어 · Tomcat ${limits.tomcatMax} · Hikari ${limits.hikariMax} · maxVUs ${limits.maxVUs}\n`);

  const head = ['구간', '목표/s', '실제/s', '도달률%', 'p95(중앙)', 'p95(최대)', '오류%', 'CPU%', 'Tomcat%', 'T포화', 'Hikari%', 'H포화', 'Hikari대기', 'MySQL', 'VU', '앱표본', '유효'];
  const rows = steps.map((st) => [
    st.phase || '—',
    String(st.target),
    num(st.actualRate, 1),
    num(st.achievedPct, 1),
    num(st.p95Median, 0),
    num(st.p95Max, 0),
    num(st.errorPctMax, 2),
    num(st.cpuPct, 1),
    num(st.tomcatPct, 1),
    `${st.tomcatSatCount}/${st.poolSamples}`,
    num(st.hikariPct, 1),
    `${st.hikariSatCount}/${st.poolSamples}`,
    num(st.hikariPendingMax, 0),
    num(st.mysqlThreadsMax, 0),
    num(st.vusMax, 0) + (st.generatorBound ? '!' : ''),
    `${st.appScrapeSamples}/${st.expectedSamples}`,
    st.valid ? 'O' : 'X',
  ]);
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padStart(width[i])).join('  ');
  console.log(line(head));
  console.log(width.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));

  const span = (b, label) => {
    if (!b) return `${label}: 유효한 계단 안에서 걸리지 않았다`;
    if (!b.lastOk) return `${label}: 첫 계단 ${b.step.target} 에서 이미 걸렸다 — 더 낮은 계단이 필요하다`;
    return `${label}: ${b.lastOk.target} 과 ${b.step.target} 사이 (${b.lastOk.target} 통과, ${b.step.target} 걸림)`;
  };
  console.log('');
  console.log(span(result.rSlo, `R_slo  (p95 > ${result.sloP95Ms}ms)`));
  console.log(span(result.rKnee, `R_knee (도달률 < ${KNEE_PCT}%)`));
  if (result.ceiling) {
    console.log(`처리율 상한: 실측 최대 ${result.ceiling.actualRate.toFixed(1)} iterations/s (목표 ${result.ceiling.target} 계단)`);
  }
  if (result.bottleneck) {
    const r = result.bottleneck.ranked
      .map((x) => `${x.name} 최대 ${x.pct.toFixed(1)}%·포화 ${x.count}/${result.bottleneck.samples}`)
      .join(' · ');
    console.log(`지속 포화가 가장 넓은 계단 ${result.bottleneck.at} iterations/s: ${r}`);
  }
  const dead = result.steps.filter((st) => !st.valid && st.appScrapeSamples < st.expectedSamples / 2);
  if (dead.length) {
    console.log(`⚠ 계단 ${dead.map((st) => st.target).join(', ')} 은 앱 지표 스크레이프가 끊겼다 — 워커가 다 차면 /actuator 도 같은 풀에서 응답하지 못한다.`);
  }
  if (steps.some((st) => st.generatorBound)) {
    console.log('⚠ VU 에 ! 가 붙은 계단은 부하 발생기가 maxVUs 에 닿았다 — 앱이 아니라 발생기를 잰 것이므로 버린다.');
  }
  if (steps.every((st) => !Number.isFinite(st.achievedPct))) {
    console.log('⚠ k6ts.iterations 축이 비어 도달률을 계산하지 못했다 — remote-write 가 켜져 있었는지 확인한다.');
  }
  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('사용법: node tools/capacity.js <runId|경로> [--slo 500] [--json]');
    process.exit(2);
  }
  const sloIdx = args.indexOf('--slo');
  const sloP95Ms = sloIdx >= 0 ? Number(args[sloIdx + 1]) : 500;

  const file = target.endsWith('.json')
    ? target
    : path.join(__dirname, '..', 'reports', 'runs', target, 'run.json');
  if (!fs.existsSync(file)) {
    console.error(`run.json 을 못 찾았다: ${file}`);
    process.exit(2);
  }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = analyze(rec, { sloP95Ms });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else printTable(result, rec.id || path.basename(path.dirname(file)));
}

if (require.main === module) main();

module.exports = { analyze, holdWindows, durationSec, median, KNEE_PCT, RATE_WINDOW_SEC };
