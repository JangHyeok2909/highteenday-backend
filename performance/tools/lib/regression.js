/**
 * Regression Analyzer — 직전 실행 대비 성능 변화를 판정한다.
 *
 * 판정이 어려운 이유와 대응
 * --------------------------
 * 부하 테스트 수치는 본질적으로 노이즈가 있다. JIT 워밍업, 페이지 캐시 상태, 호스트의 다른
 * 프로세스, 컨테이너 스케줄링까지 전부 영향을 준다. 그래서 "직전보다 나빠졌다"를 그대로
 * 회귀로 부르면 오탐이 쏟아지고, 결국 아무도 결과를 안 본다(경보 피로).
 *
 * 이 엔진이 오탐을 줄이는 방법은 4가지다.
 *   1) 방향성      — 지표마다 "어느 쪽이 나쁜지"를 규칙에 명시한다. TPS는 올라야 좋고,
 *                    P95는 내려야 좋고, MySQL QPS는 (RPS가 그대로라면) 오르면 나쁘다.
 *   2) 노이즈 플로어 — 절대 변화가 작으면 상대 변화율이 아무리 커도 무시한다(2ms→3ms = +50%).
 *   3) 기준선 하한  — 기준값 자체가 너무 작으면 비율 비교를 아예 건너뛴다(0에 가까운 분모).
 *   4) 절대 게이트  — 직전 대비 개선됐어도 SLO를 넘으면 실패다. 상대 비교만 쓰면 성능이
 *                    매번 9%씩 나빠지며 영원히 통과하는 "삶은 개구리" 문제가 생긴다.
 *
 * 판정 결과는 PASS / WARN / FAIL 3단계다.
 *   FAIL — CI를 멈춘다(gate:true 인 규칙만).
 *   WARN — 기록하고 리포트에 띄우되 빌드는 통과. 관찰 대상.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const RULES_FILE = path.join(__dirname, '..', '..', 'regression', 'rules.json');

/** 'k6.overall.p95' 같은 점 경로로 중첩 객체에서 값을 꺼낸다. */
function pick(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function loadRules(file = RULES_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.rules.filter((r) => r && r.key);
}

/**
 * 하나의 규칙을 평가한다.
 * @param {object} rule
 * @param {number|null} current  현재 실행 값
 * @param {number|null} baseline 직전 실행 값 (없으면 절대 판정만 수행)
 */
function evaluateRule(rule, current, baseline) {
  const has = (v) => v != null && Number.isFinite(Number(v));
  const cur = has(current) ? Number(current) : null;
  const base = has(baseline) ? Number(baseline) : null;
  const lowerBetter = rule.direction !== 'higher_is_better';

  const out = {
    key: rule.key,
    label: rule.label || rule.key,
    unit: rule.unit || null,
    direction: rule.direction || 'lower_is_better',
    gate: !!rule.gate,
    current: cur,
    baseline: base,
    deltaAbs: null,
    deltaPct: null,      // 부호 있는 원시 변화율 (+면 값이 커졌다)
    badChangePct: null,  // "나쁜 방향으로" 얼마나 갔는가 (음수면 개선)
    verdict: 'PASS',
    reasons: [],
    skipped: null,
  };

  if (cur == null) {
    out.verdict = 'SKIP';
    out.skipped = '현재 값 없음';
    return out;
  }

  // ---- 1) 절대 게이트 — 기준선과 무관하게 항상 검사 ---------------------
  const abs = rule.absolute || {};
  for (const level of ['fail', 'warn']) {
    const cond = abs[level];
    if (!cond) continue;
    let hit = false;
    let desc = '';
    if (cond.gt != null && cur > cond.gt) { hit = true; desc = `${fmtNum(cur)} > 상한 ${fmtNum(cond.gt)}`; }
    if (cond.lt != null && cur < cond.lt) { hit = true; desc = `${fmtNum(cur)} < 하한 ${fmtNum(cond.lt)}`; }
    if (hit) {
      out.reasons.push({ type: 'absolute', level: level.toUpperCase(), desc });
      if (level === 'fail') out.verdict = 'FAIL';
      else if (out.verdict !== 'FAIL') out.verdict = 'WARN';
      break; // fail 이 걸리면 warn 은 볼 필요 없다
    }
  }

  // ---- 2) 상대 비교 -----------------------------------------------------
  if (base != null) {
    out.deltaAbs = cur - base;
    out.deltaPct = base !== 0 ? ((cur - base) / Math.abs(base)) * 100 : null;
    // 나쁜 방향 변화율: lower_is_better면 증가가 나쁨, 반대면 감소가 나쁨
    out.badChangePct = out.deltaPct == null ? null : (lowerBetter ? out.deltaPct : -out.deltaPct);

    const absDelta = Math.abs(out.deltaAbs);
    const belowNoise = rule.noiseFloor != null && absDelta < rule.noiseFloor;
    const baselineTooSmall = rule.minBaseline != null && Math.abs(base) < rule.minBaseline;

    if (belowNoise) {
      out.skipped = `변화 ${fmtNum(absDelta)} < 노이즈 하한 ${fmtNum(rule.noiseFloor)}`;
    } else if (baselineTooSmall) {
      out.skipped = `기준값 ${fmtNum(base)} < 비교 하한 ${fmtNum(rule.minBaseline)}`;
    } else if (out.badChangePct != null) {
      const failAt = rule.fail && rule.fail.changePct;
      const warnAt = rule.warn && rule.warn.changePct;
      if (failAt != null && out.badChangePct > failAt) {
        out.reasons.push({
          type: 'relative', level: 'FAIL',
          desc: `직전 대비 ${signed(out.badChangePct)} 악화 (허용 ${failAt}%)`,
        });
        out.verdict = 'FAIL';
      } else if (warnAt != null && out.badChangePct > warnAt) {
        out.reasons.push({
          type: 'relative', level: 'WARN',
          desc: `직전 대비 ${signed(out.badChangePct)} 악화 (경고 ${warnAt}%)`,
        });
        if (out.verdict !== 'FAIL') out.verdict = 'WARN';
      }
    }
  }

  return out;
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const x = Number(n);
  if (Math.abs(x) >= 1e6) return x.toExponential(2);
  if (Math.abs(x) < 0.01 && x !== 0) return x.toExponential(2);
  return Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2);
}

function signed(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/**
 * 현재 실행 레코드를 직전 실행과 비교해 회귀 판정 결과를 만든다.
 *
 * @param {object} record       현재 run 레코드 (infra 보강 완료 상태)
 * @param {object|null} prevRun 직전 실행 — index 엔트리가 아니라 전체 run 레코드여야 한다
 *                              (infra.flat 값이 필요하므로)
 */
/**
 * 기준선이 "같은 스크립트로 잰 것"인지 판정한다.
 *
 * 오탐을 줄이는 다섯 번째 장치다. 앞의 넷(방향성·노이즈 플로어·기준선 하한·절대 게이트)은
 * 전부 값의 크기를 보지만, 이건 **두 수치가 애초에 비교 가능한가**를 본다.
 * 스크립트에서 요청을 하나 추가하기만 해도 여정당 요청 수가 달라져 TPS·RPS가 바뀌는데,
 * 그건 성능이 나빠진 게 아니라 다른 것을 잰 것이다.
 *
 * scriptVersion 은 스크립트 파일 내용의 SHA-256 앞 12자다(perf-run.js 가 주입).
 * 'unknown' 은 이관된 과거 실행이라 지문이 없다는 뜻이므로, 한쪽이라도 unknown 이면
 * 판정하지 않는다 — 전부 불일치로 잡히면 이 장치 자체가 무의미해진다.
 */
function baselineScriptChanged(record, prevRun) {
  const cur = record.run && record.run.scriptVersion;
  const base = prevRun && prevRun.run && prevRun.run.scriptVersion;
  if (!cur || !base || cur === 'unknown' || base === 'unknown') return false;
  return cur !== base;
}

function analyze(record, prevRun, rulesFile) {
  const rules = loadRules(rulesFile);
  const comparisons = rules.map((rule) =>
    evaluateRule(rule, pick(record, rule.key), prevRun ? pick(prevRun, rule.key) : null),
  );

  const failures = comparisons.filter((c) => c.verdict === 'FAIL');
  const warnings = comparisons.filter((c) => c.verdict === 'WARN');
  // CI를 멈추는 건 gate:true 인 FAIL 뿐이다. gate:false 는 정보 제공용.
  const gateFailures = failures.filter((c) => c.gate);

  let verdict = 'PASS';
  if (gateFailures.length) verdict = 'FAIL';
  else if (failures.length || warnings.length) verdict = 'WARN';

  // 스크립트가 바뀌었으면 게이트를 열어 준다. 기준선을 버리지는 않는다 — 주석 한 줄만
  // 고쳐도 지문이 바뀌므로, 불일치마다 이력을 끊으면 추세 분석이 상시 리셋된다.
  // 수치는 그대로 보여주되 "이 비교는 믿을 수 없다"고 표시하고 빌드는 통과시킨다.
  const scriptChanged = baselineScriptChanged(record, prevRun);
  let downgradedFrom = null;
  if (scriptChanged && verdict === 'FAIL') {
    downgradedFrom = 'FAIL';
    verdict = 'WARN';
  }

  return {
    baselineRunId: prevRun ? prevRun.run.id : null,
    baselineStartedAt: prevRun ? prevRun.run.startedAt : null,
    baselineCommit: prevRun ? prevRun.run.commitShort : null,
    baselineScriptVersion: prevRun && prevRun.run ? prevRun.run.scriptVersion || null : null,
    scriptVersion: (record.run && record.run.scriptVersion) || null,
    scriptChanged,
    downgradedFrom,
    hasBaseline: !!prevRun,
    verdict,
    gateFailed: gateFailures.length > 0 && !scriptChanged,
    counts: {
      total: comparisons.length,
      fail: failures.length,
      warn: warnings.length,
      gateFail: gateFailures.length,
      skipped: comparisons.filter((c) => c.verdict === 'SKIP').length,
    },
    comparisons,
    failures: failures.map((c) => c.key),
    warnings: warnings.map((c) => c.key),
  };
}

/**
 * 병목 힌트 — 규칙 위반들을 보고 "무엇이 원인일 가능성이 높은지" 한 줄로 지목한다.
 *
 * 왜 필요한가: 리포트에 30개 지표가 빨간색으로 뜨면 사람은 어디부터 봐야 할지 모른다.
 * 실무에서 성능 분석은 대개 "포화된 자원 찾기"로 시작하므로, 포화도가 높은 순서로
 * 후보를 제시해 조사 시작점을 만들어 준다. 단정하지 않고 '가설'로 표현한다.
 */
function bottleneckHints(record) {
  const f = (record.infra && record.infra.flat) || {};
  const k6 = (record.k6 && record.k6.overall) || {};
  const hints = [];
  const push = (score, title, detail) => hints.push({ score, title, detail });

  // 어떤 병목보다 먼저 봐야 하는 건 "이 측정을 믿어도 되는가"다.
  // k6 의 http_req_failed 는 비 2xx 를 실패로 세는데 check 는 스크립트가 정의한다.
  // 둘이 어긋나면 check 단정이 4xx 를 통과시키고 있다는 뜻이고, 그러면 기록된 지연은
  // 재려던 경로가 아니라 에러 경로의 값이다. 실측 사례: school 스크립트가 오류율 55.6%,
  // check 성공률 100% 를 동시에 보고했고, 급식 조회가 아니라 400 응답 시간을 재고 있었다.
  if (k6.errorRate > 0.05 && k6.checkRate > 0.99) {
    push(98, '측정 신뢰성 경고 — check가 실패를 놓치고 있다',
      `오류율 ${(k6.errorRate * 100).toFixed(1)}%인데 check 성공률은 ${(k6.checkRate * 100).toFixed(1)}%다. ` +
      `단정이 4xx를 통과시키고 있어, 기록된 지연은 정상 경로가 아니라 에러 경로의 값일 수 있다. ` +
      `아래 병목 가설을 보기 전에 스크립트의 check부터 확인할 것.`);
  }

  if (f['cpu.throttledPct'] > 1) {
    push(100, 'CPU throttling 발생',
      `cgroup이 CPU를 강제 회수한 주기가 ${f['cpu.throttledPct'].toFixed(1)}%다. CPU 한계(${f['cpu.limitCores']} core)를 올리거나 요청당 CPU 사용을 줄여야 p99가 안정된다.`);
  }
  if (f['pool.hikariPending.max'] > 0) {
    push(95, 'DB 커넥션 풀 대기 발생',
      `최대 ${f['pool.hikariPending.max']}개 스레드가 커넥션을 기다렸다. 풀 크기(${f['pool.hikariMax']})가 동시성 대비 부족하거나, 커넥션 보유 시간이 긴 쿼리가 있다.`);
  }
  if (f['saturation.hikariPct'] > 90) {
    push(85, 'DB 커넥션 풀 포화',
      `풀 사용률이 ${f['saturation.hikariPct'].toFixed(0)}%까지 올라갔다. 여유가 거의 없어 부하가 조금만 늘어도 대기가 생긴다.`);
  }
  if (f['saturation.cpuPct'] > 85) {
    push(80, 'CPU 포화',
      `CPU 사용이 한계의 ${f['saturation.cpuPct'].toFixed(0)}%에 도달했다.`);
  }
  if (f['gc.overheadPct.avg'] > 5) {
    push(78, 'GC 오버헤드 과다',
      `CPU 시간의 ${f['gc.overheadPct.avg'].toFixed(1)}%를 GC가 썼다. 할당률(${f['gc.allocRateBytesSec'] ? (f['gc.allocRateBytesSec'] / 1048576).toFixed(0) + 'MB/s' : '?'})을 줄이거나 힙을 늘려야 한다.`);
  }
  if (f['saturation.heapPct'] > 90) {
    push(75, 'Heap 포화',
      `힙 사용이 상한의 ${f['saturation.heapPct'].toFixed(0)}%다. Full GC 빈발 위험.`);
  }
  if (f['mysql.bufferPoolHitPct'] != null && f['mysql.bufferPoolHitPct'] < 99) {
    push(70, 'InnoDB Buffer Pool 미스',
      `적중률 ${f['mysql.bufferPoolHitPct'].toFixed(2)}% — 디스크에서 읽고 있다. 버퍼풀 크기 또는 작업셋 크기를 재검토해야 한다.`);
  }
  if (f['redis.evictedKeys'] > 0) {
    push(68, 'Redis Eviction 발생',
      `${f['redis.evictedKeys'].toFixed(0)}개 키가 메모리 부족으로 축출됐다. 캐시 적중률이 구조적으로 떨어진다.`);
  }
  if (f['saturation.tomcatPct'] > 80) {
    push(65, 'Tomcat 워커 스레드 포화',
      `busy/max = ${f['saturation.tomcatPct'].toFixed(0)}%. 여기 닿으면 요청이 수락 큐에서 대기한다.`);
  }
  if (f['mysql.slowQueries'] > 0 && record.k6 && record.k6.overall.httpReqs) {
    const per1k = (f['mysql.slowQueries'] / record.k6.overall.httpReqs) * 1000;
    if (per1k > 1) {
      push(60, 'Slow Query 다발',
        `요청 1000건당 ${per1k.toFixed(1)}건의 slow query(>100ms). 인덱스 또는 쿼리 계획 점검 대상.`);
    }
  }
  // RPS 대비 QPS 비율 — N+1의 직접 신호
  const rps = record.k6 && record.k6.overall.rps;
  if (rps > 0 && f['mysql.qps'] > 0) {
    const qpr = f['mysql.qps'] / rps;
    if (qpr > 10) {
      push(72, 'HTTP 요청당 쿼리 수 과다',
        `요청 1건당 평균 ${qpr.toFixed(1)}개 쿼리가 실행됐다. N+1 패턴 가능성이 높다.`);
    }
  }
  if (f['saturation.memoryPct'] > 90) {
    push(62, '컨테이너 메모리 포화',
      `메모리 사용이 한계의 ${f['saturation.memoryPct'].toFixed(0)}%다. OOM Kill 위험 구간.`);
  }

  return hints.sort((a, b) => b.score - a.score);
}

module.exports = { analyze, evaluateRule, loadRules, bottleneckHints, pick, RULES_FILE };
