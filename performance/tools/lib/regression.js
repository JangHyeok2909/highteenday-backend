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
const cmp = require('./comparability');

const RULES_FILE = path.join(__dirname, '..', '..', 'regression', 'rules.json');

/**
 * 'k6.phases.measure.p95' 같은 점 경로로 값을 꺼낸다.
 *
 * 주의: infra.flat 은 **키 자체에 점이 들어간 평면 맵**이다('saturation.cpuPct').
 * 순수 중첩 탐색만 하면 infra.flat.* 규칙 전체가 undefined → SKIP 으로 빠진다
 * (실제로 그렇게 25개 규칙이 한 번도 평가되지 않은 채 지나갔다).
 * 그래서 각 단계에서 "남은 경로 전체"가 키로 존재하면 그쪽을 우선한다.
 */
function pick(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const rest = parts.slice(i).join('.');
    if (Object.prototype.hasOwnProperty.call(cur, rest)) return cur[rest];
    cur = cur[parts[i]];
  }
  return cur == null ? undefined : cur;
}

const DIRECTIONS = new Set(['lower_is_better', 'higher_is_better']);

/**
 * 규칙 파일 검증 — 잘못된 규칙을 조용히 건너뛰면 그 규칙은 영원히 평가되지 않는데,
 * 그걸 알아챌 방법이 없다. 오타·역전된 임계값은 즉시 실행을 멈추는 게 맞다.
 */
function validateRules(rules) {
  const problems = [];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  rules.forEach((r, i) => {
    const name = (r && r.key) || `rules[${i}]`;
    if (!r || typeof r.key !== 'string' || !r.key) {
      problems.push(`${name}: key 가 없다`);
      return;
    }
    if (r.direction != null && !DIRECTIONS.has(r.direction)) {
      problems.push(`${name}: 알 수 없는 direction '${r.direction}'`);
    }
    const warnPct = r.warn && r.warn.changePct;
    const failPct = r.fail && r.fail.changePct;
    if (warnPct != null && !isNum(warnPct)) problems.push(`${name}: warn.changePct 가 숫자가 아니다`);
    if (failPct != null && !isNum(failPct)) problems.push(`${name}: fail.changePct 가 숫자가 아니다`);
    if (isNum(warnPct) && isNum(failPct) && failPct < warnPct) {
      problems.push(`${name}: fail.changePct(${failPct}) < warn.changePct(${warnPct}) — 실패가 경고보다 먼저 걸린다`);
    }
    for (const k of ['noiseFloor', 'minBaseline']) {
      if (r[k] != null && !isNum(r[k])) problems.push(`${name}: ${k} 가 숫자가 아니다`);
    }
    for (const level of ['warn', 'fail']) {
      const cond = r.absolute && r.absolute[level];
      if (!cond) continue;
      for (const op of ['gt', 'lt']) {
        if (cond[op] != null && !isNum(cond[op])) problems.push(`${name}: absolute.${level}.${op} 가 숫자가 아니다`);
      }
    }
  });
  if (problems.length) {
    throw new Error(`rules.json 검증 실패:\n  ${problems.join('\n  ')}`);
  }
}

const DEFAULT_REQUIREMENTS = { infraRequiredEnvironmentPrefixes: [] };

/**
 * requirements 블록 검증 — 오타 하나로 인프라 필수 판정이 통째로 꺼지면 T-08을 고친 의미가
 * 없다. 형식이 틀리면 조용히 기본값(=아무것도 필수 아님)으로 떨어지지 않고 멈춘다.
 */
function validateRequirements(req) {
  if (req == null) return;
  if (typeof req !== 'object' || Array.isArray(req)) {
    throw new Error('rules.json 검증 실패:\n  requirements 는 객체여야 한다');
  }
  const prefixes = req.infraRequiredEnvironmentPrefixes;
  if (prefixes == null) return;
  if (!Array.isArray(prefixes) || prefixes.some((p) => typeof p !== 'string' || !p)) {
    throw new Error('rules.json 검증 실패:\n  requirements.infraRequiredEnvironmentPrefixes 는 비어 있지 않은 문자열 배열이어야 한다');
  }
}

/**
 * 규칙 파일 전체를 읽는다 — 규칙 목록과 requirements 블록은 함께 검증돼야 의미가 있다.
 */
function loadRuleSet(file = RULES_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rules = raw.rules || [];
  validateRules(rules);
  validateRequirements(raw.requirements);
  return {
    rules,
    requirements: { ...DEFAULT_REQUIREMENTS, ...(raw.requirements || {}) },
  };
}

function loadRules(file = RULES_FILE) {
  return loadRuleSet(file).rules;
}

/**
 * 이 규칙이 이 실행에 적용되는가 — "값이 없다"의 세 가지 뜻 중 첫 번째를 가른다(T-08).
 *
 *   해당 없음  이 실행에는 그 지표라는 개념 자체가 없다 (여기서 걸러낸다)
 *   참고 결측  잴 수 있었어야 하는데 안 들어왔다. 판정은 유효하다
 *   필수 결측  잴 수 있었어야 하는데 안 들어왔고, 그래서 판정이 무의미하다
 *
 * measure 구간 규칙이 유일한 해당 없음 사례다. 진단 전용 시나리오(gatePhase !== 'measure')와
 * phasePlan이 없는 과거 실행은 measure 구간을 아예 선언하지 않았다. 이를 결측으로 세면
 * 그런 실행이 항상 "부분 측정"으로 표시돼, 정작 익스포터가 죽었을 때의 신호가 묻힌다.
 */
function isApplicable(rule, record) {
  if (rule.key.startsWith('k6.phases.measure.')) {
    const plan = record.run && record.run.phasePlan;
    return !!(plan && plan.gatePhase === 'measure');
  }
  return true;
}

/**
 * 이 실행에서 "없으면 판정 자체가 성립하지 않는" 지표인가(T-08).
 *
 * 별도의 `required` 필드를 두지 않고 `gate`를 그대로 쓴다. `gate:true`는 "이 지표가 나쁘면
 * 빌드를 세운다"는 선언인데, 그 지표가 없으면 빌드를 세울 방법이 없다 — 즉 gate 규칙은
 * 정의상 필수다. 필드를 따로 두면 `gate:true, required:false`("실패시키긴 하는데 없어도
 * 됨") 같은 모순 조합이 가능해질 뿐이다.
 *
 * 인프라 게이트만 환경 조건이 하나 더 붙는다 — Prometheus가 있어야 하는 환경에서만
 * 필수다. 익스포터가 없는 로컬 환경까지 강제하면 모든 실행이 영구히 막힌다. 그런 환경에서도
 * 결측 사실 자체는 참고 결측으로 남아 리포트에 표시된다.
 *
 * 환경 판정을 prefix 로 하는 이유: environment 는 `__ENV.PERF_ENV || 'perf'`(summary.js)라
 * 자유 문자열이고, 실제로 `perf-mi-smoke`·`perf-s02-ab` 처럼 목적을 덧붙인 이름이 쓰인다.
 * 정확히 일치로 걸면 그 변형들이 전부 면제돼 버린다.
 */
function isRequired(rule, record, requirements) {
  if (!rule.gate) return false;
  if (!isApplicable(rule, record)) return false;

  if (rule.key.startsWith('infra.flat.')) {
    const env = (record.run && record.run.environment) || '';
    return requirements.infraRequiredEnvironmentPrefixes.some((p) => env.startsWith(p));
  }

  return true;
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
    // 이 지표에서 "변화라고 부를 수 있는 최소 절대량". 리포트가 화살표 대신 "노이즈 범위"
    // 라고 쓸 수 있게 판정 결과를 그대로 내보낸다(T-41). 예전에는 belowNoise 를 내부에서만
    // 쓰고 밖으로 알리지 않아, 노이즈 범위의 변화도 굵은 퍼센트로 표시됐다 — 그러면 읽는
    // 사람이 곧 변화율 전체를 무시하게 된다(경보 피로).
    noiseFloor: rule.noiseFloor != null ? rule.noiseFloor : null,
    withinNoise: false,
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
      out.withinNoise = true;
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
 * 오탐을 줄이는 다섯 번째 장치 — 비교 가능성.
 *
 * 앞의 넷(방향성·노이즈 플로어·기준선 하한·절대 게이트)은 전부 값의 **크기**를 보지만,
 * 이건 두 수치가 **애초에 비교 가능한가**를 본다. 데이터셋이나 부하가 다르면 그건 성능이
 * 나빠진 게 아니라 다른 것을 잰 것이다. 판정 기준은 comparability.js 가 선언적으로 갖는다.
 *
 * 기준선은 repository.findBaseline 이 이미 걸러 주지만 여기서 한 번 더 확인한다.
 * analyze 는 재분석·테스트에서 직접 호출되기도 하므로, 무엇을 넘겨받든 스스로 방어해야
 * 비교 불가능한 수치가 판정에 새어 들어가지 않는다.
 *
 * @param {object} record   현재 run 레코드 (infra 보강 완료 상태)
 * @param {object|null} prevRun 기준선 후보 — 인덱스 엔트리가 아니라 전체 run 레코드여야 한다
 *                              (infra.flat 값이 필요하므로)
 * @param {object} opts     { rulesFile, rejected, hadPriorCandidates }
 *                          rejected 는 기준선 탐색에서 탈락한 후보들,
 *                          hadPriorCandidates 는 애초에 과거 후보가 있었는지(findBaseline 이 알려준다)
 */
function analyze(record, prevRun, opts = {}) {
  const { rulesFile, rejected = [] } = opts;
  const conditions = cmp.conditionsOf(record);
  const comparability = prevRun ? cmp.compare(conditions, cmp.conditionsOf(prevRun)) : null;

  // 차단 등급 불일치가 있으면 기준선을 아예 쓰지 않는다. 이 경우 아래 evaluateRule 은
  // baseline=null 로 돌아 절대 게이트만 평가한다 — 상대 비교가 꺼져도 SLO 강제는 남는다.
  const baseline = comparability && comparability.comparable ? prevRun : null;

  const { rules, requirements } = loadRuleSet(rulesFile);
  const comparisons = rules.map((rule) => {
    const out = evaluateRule(rule, pick(record, rule.key), baseline ? pick(baseline, rule.key) : null);
    // 결측이 "해당 없음"인지 "참고 지표"인지 "판정 불가"인지는 규칙만으로 정해지지 않는다.
    // 이 실행의 phasePlan·environment까지 봐야 하므로 여기서 붙인다(isApplicable/isRequired).
    out.applicable = isApplicable(rule, record);
    out.required = isRequired(rule, record, requirements);
    return out;
  });

  const failures = comparisons.filter((c) => c.verdict === 'FAIL');
  const warnings = comparisons.filter((c) => c.verdict === 'WARN');
  // CI를 멈추는 건 gate:true 인 FAIL 뿐이다. gate:false 는 정보 제공용.
  const gateFailures = failures.filter((c) => c.gate);

  /*
   * 절대 사유로 실패한 게이트 — degraded 강등에서 제외할 대상이다(T-32).
   *
   * evaluateRule 의 절대 판정은 기준선을 아예 읽지 않는다. 그래서 "기준선을 믿을 수 있는가"가
   * 흔들려도 절대 판정은 그대로 유효하다. 이 구분이 없으면 강등이 실패 사유를 가리지 않고
   * 통째로 적용돼, 부하 스크립트에 주석 한 줄만 고쳐도 SLO 게이트가 꺼지는 우회로가 생긴다.
   */
  const isAbsoluteFail = (c) => c.reasons.some((r) => r.type === 'absolute' && r.level === 'FAIL');
  const absoluteGateFailures = gateFailures.filter(isAbsoluteFail);

  let verdict = 'PASS';
  if (gateFailures.length) verdict = 'FAIL';
  else if (failures.length || warnings.length) verdict = 'WARN';

  /*
   * degraded — 스크립트 지문만 다른 경우다. 기준선을 버리지는 않는다.
   * 주석 한 줄만 고쳐도 지문이 바뀌므로, 스크립트 변경마다 이력을 끊으면 추세 분석이 상시 리셋된다.
   * 수치는 그대로 보여주되 "이 비교는 믿을 수 없다"고 표시하고 빌드는 통과시킨다.
   *
   * **강등은 상대 비교 결과에만 적용한다**(T-32). 강등이 노리는 것은 "직전 대비 +30% 악화"
   * 같은 증감률인데, 그 값은 기준선이 다른 것을 잰 순간 의미를 잃는다. 반면 절대 게이트는
   * 기준선을 참조하지 않으므로 등급과 무관하게 유효하다.
   *
   * 나누지 않으면 판정 강도가 역전된다 — blocking 불일치(데이터셋 변경)는 상대 비교만 끄고
   * 절대 게이트를 유지하는데, 더 약한 degrading 불일치(주석 수정)는 절대 게이트까지 껐다.
   * 차이가 작을수록 SLO 강제가 약해지는 셈이라, 스크립트를 고치는 실행마다 게이트가 열렸다.
   */
  const degraded = !!(comparability && comparability.level === 'degraded');
  let downgradedFrom = null;
  if (degraded && verdict === 'FAIL' && absoluteGateFailures.length === 0) {
    downgradedFrom = 'FAIL';
    verdict = 'WARN';
  }

  /*
   * 측정 상태 — 성능 판정(verdict)과 나란한 두 번째 축이다(T-08).
   *
   * verdict 는 "서버가 괜찮은가"를 말하고, measurementStatus 는 "그 판단을 내릴 데이터가
   * 있었는가"를 말한다. 둘을 한 값에 섞으면 "느리다"와 "재지 못했다"가 구분되지 않는데,
   * 이 둘은 고쳐야 할 대상도 고칠 사람도 다르다(애플리케이션 vs 측정 인프라).
   *
   *   MEASURED   필수 지표가 모두 있고 측정 구간도 계획대로 채워졌다
   *   PARTIAL    필수는 있으나 선택 지표가 빠졌거나 측정 구간이 잘렸다 — 판정은 유효
   *   UNMEASURED 필수 지표가 없어 판정을 신뢰할 수 없다
   *
   * PARTIAL 을 남기는 이유: 필수 인프라 지표는 gate 규칙 3개뿐이라, Redis 익스포터가
   * 통째로 죽어도 상태는 MEASURED 가 된다. PARTIAL 과 missingOptional 목록이 그 조용한
   * 붕괴를 드러내는 유일한 신호다.
   */
  const skipped = comparisons.filter((c) => c.verdict === 'SKIP');
  const missingRequired = skipped.filter((c) => c.required).map((c) => c.key);
  const missingOptional = skipped.filter((c) => !c.required && c.applicable).map((c) => c.key);
  const notApplicable = skipped.filter((c) => !c.applicable).map((c) => c.key);
  // collect.js 가 조기 종료를 감지해 이미 기록해 둔 값이다(measureWindow). 지금까지는
  // 리포트에 표시만 됐고 판정 경로에는 연결되지 않았다.
  const windowIncomplete = !!(record.infra && record.infra.window && record.infra.window.incomplete);

  let measurementStatus = 'MEASURED';
  if (missingRequired.length) measurementStatus = 'UNMEASURED';
  else if (missingOptional.length || windowIncomplete) measurementStatus = 'PARTIAL';

  // 판정과 별개로 "무엇에 대고 비교했는가"를 항상 노출한다. 조건이 엄격해지면
  // 기준선 없는 실행이 흔해지는데, 그게 조용한 PASS 로 새면 고치기 전보다 나쁘다.
  //   compared     — 유효한 대조군과 비교했다
  //   incomparable — 과거 후보는 있었으나 자격 또는 조건 때문에 쓰지 못했다
  //   first-run    — 이 시나리오의 과거 실행이 아예 없다
  //
  // hadPriorCandidates 를 findBaseline 에서 받아 쓰는 이유(S-10): rejected 는 REJECTED_LIMIT
  // 로 잘리고, 과거에는 사전 필터에서 지워진 후보가 아예 담기지도 않았다. 그 길이로 first-run
  // 을 추측하면 "후보가 전부 탈락한 실행"이 "첫 실행"으로 보고된다 — 실제로 그렇게 보고됐다.
  // 직접 호출(재분석·테스트)에서 값을 안 넘기면 예전 추측 방식으로 폴백한다.
  const hadPriorCandidates = opts.hadPriorCandidates != null
    ? !!opts.hadPriorCandidates
    : !!(prevRun || rejected.length);
  const baselineStatus = baseline ? 'compared' : hadPriorCandidates ? 'incomparable' : 'first-run';

  /*
   * 기준선의 "당시 성능 상태" — 자격 조건이 아니라 표시용이다(S-10).
   *
   * threshold 실패 실행도 기준선이 될 수 있게 되면서, 리포트에 `p95 3800ms → 2200ms(-42%)`
   * 같은 초록색 개선이 뜨는데 둘 다 SLO 위반인 상황이 정상적으로 발생한다. 현재 실행의 절대
   * 게이트는 그대로 FAIL 을 내지만(evaluateRule 의 절대 판정은 기준선과 무관하다), 사람이
   * 증감률만 보고 "좋아졌으니 됐다"고 읽는 것은 막아야 한다.
   *
   * thresholdsPassed 는 measure SLO 하나가 아니라 전체 구간 threshold, 시나리오별 threshold,
   * abort threshold, 분해축 생성용 threshold 의 AND 다. 그래서 "SLO 실패"라고 단정하지 않고
   * "당시 k6 threshold 미통과"라고만 말한다. Node 판정(regression.verdict)은 별도 축이므로
   * 따로 노출한다. 값이 없는 과거 레코드는 null 이다.
   */
  const baselineThresholdsPassed = baseline && baseline.k6 && baseline.k6.thresholdsPassed != null
    ? baseline.k6.thresholdsPassed
    : null;
  const baselineVerdict = baseline && baseline.regression && baseline.regression.verdict
    ? baseline.regression.verdict
    : null;

  return {
    baselineRunId: baseline ? baseline.run.id : null,
    baselineStartedAt: baseline ? baseline.run.startedAt : null,
    baselineCommit: baseline ? baseline.run.commitShort : null,
    baselineStatus,
    hadPriorCandidates,
    baselineThresholdsPassed,
    baselineVerdict,
    conditions,
    seriesHash: cmp.seriesHash(conditions),
    comparability,
    rejectedBaselines: rejected,
    downgradedFrom,
    hasBaseline: !!baseline,
    verdict,
    measurementStatus,
    missingRequired,
    missingOptional,
    notApplicable,
    windowIncomplete,
    // 절대 사유로 실패한 게이트는 degraded 여도 CI를 멈춘다(T-32). 상대 사유만으로 실패한
    // 게이트는 기준선을 믿을 수 없으므로 degraded 일 때 열어 준다.
    gateFailed: absoluteGateFailures.length > 0 || (gateFailures.length > 0 && !degraded),
    // 어떤 게이트가 "기준선과 무관하게" 실패했는지 — 콘솔·리포트가 강등 여부를 설명할 때 쓴다.
    absoluteGateFailures: absoluteGateFailures.map((c) => c.key),
    counts: {
      total: comparisons.length,
      fail: failures.length,
      warn: warnings.length,
      gateFail: gateFailures.length,
      // skipped(평가 불가: 값 미수집)와 suppressed(판정 생략: 노이즈 하한/기준값 과소)는
      // 전혀 다른 상태다 — 전자는 측정하지 못한 것이고 후자는 의도적이로 노이즈를 배제한 것이다.
      // 이를 분리하여 "지표가 안 들어오고 있다"는 신호가 노이즈 억제 뒤에 숨는걸 막는다.
      skipped: comparisons.filter((c) => c.verdict === 'SKIP').length,
      suppressed: comparisons.filter((c) => c.verdict !== 'SKIP' && c.skipped != null).length,
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
  // measure 구간(k6.phases.measure)을 우선한다 — 병목은 정상 상태에서 진단해야 의미가
  // 있고, warmup/rampdown이 섞인 전체 구간은 왜곡될 수 있다. measure가 없는 실행
  // (진단 시나리오·과거 run.json)만 k6.all로 폴백한다.
  const k6 = (record.k6 && ((record.k6.phases && record.k6.phases.measure) || record.k6.all)) || {};
  const hints = [];
  const push = (score, title, detail) => hints.push({ score, title, detail });

  /**
   * 심각도 기반 점수 (T-40).
   *
   * **고치기 전 무엇이 문제였나.** 임계가 이 함수 안에 하드코딩돼 있었고 점수가 고정이었다.
   * 그래서 `cpu.throttledPct > 1` 이면 8.6% 든 71% 든 똑같이 100점(최고 순위)이 됐다.
   * 같은 리포트의 포화 판정은 같은 값을 `ok`(warn 30 / fail 80)라고 말했으므로, 두 섹션이
   * 정반대로 읽혔다 — 실사용자 반응이 *"포화가 아닌데도 왜 있는지 모르겠다"* 였다.
   * 두 진술이 어긋나면 읽는 사람은 **둘 다 믿지 않게 된다.**
   *
   * **지금 규칙.** 임계는 `saturation.js` 의 `SIGNALS` 와 같은 값을 쓰고, 점수는
   * `기본 우선순위 × 심각도` 로 매긴다. 심각도는 warn 에서 0, fail 이상에서 1 이다.
   *   - warn 미만이면 **아예 표시하지 않는다** (포화 판정이 `ok` 라고 한 것을 병목이라
   *     부르지 않는다)
   *   - fail 을 넘으면 기본 우선순위 그대로
   *
   * `base` 는 "이 종류의 병목이 얼마나 근본적인가"이고 임계와는 별개 축이다. 커넥션 대기가
   * CPU throttling 보다 base 가 낮은 이유는 덜 심각해서가 아니라, throttling 이 있으면
   * 그것이 대기의 원인일 수 있어 먼저 봐야 하기 때문이다.
   */
  const severity = (value, warnAt, failAt) => {
    if (value == null || !Number.isFinite(value) || value <= warnAt) return 0;
    if (value >= failAt) return 1;
    return (value - warnAt) / (failAt - warnAt);
  };
  const pushScaled = (base, value, warnAt, failAt, title, detail) => {
    const s = severity(value, warnAt, failAt);
    if (s <= 0) return;
    // 0.55~1.0 구간으로 눌러 둔다. warn 을 갓 넘은 항목이 0점에 수렴해 순서가 뒤집히는
    // 것을 막으면서, fail 을 넘은 항목이 확실히 위로 오게 한다.
    push(Math.round(base * (0.55 + 0.45 * s)), title, `${detail} (임계 warn ${warnAt} / fail ${failAt})`);
  };

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

  // 임계는 saturation.js SIGNALS 와 같은 값이다 — 같은 지표를 두 섹션이 다르게 판정하면
  // 안 된다(T-40).
  if (f['cpu.throttledPct'] != null) {
    pushScaled(100, f['cpu.throttledPct'], 30, 80, 'CPU throttling 발생',
      `cgroup이 CPU를 강제 회수한 주기가 ${f['cpu.throttledPct'].toFixed(1)}%다. CPU 한계(${f['cpu.limitCores']} core)를 올리거나 요청당 CPU 사용을 줄여야 p99가 안정된다.`);
  }
  if (f['pool.hikariPending.max'] != null) {
    pushScaled(95, f['pool.hikariPending.max'], 1, 5, 'DB 커넥션 풀 대기 발생',
      `최대 ${f['pool.hikariPending.max']}개 스레드가 커넥션을 기다렸다. 풀 크기(${f['pool.hikariMax']})가 동시성 대비 부족하거나, 커넥션 보유 시간이 긴 쿼리가 있다.`);
  }
  if (f['saturation.hikariPct'] != null) {
    pushScaled(85, f['saturation.hikariPct'], 80, 95, 'DB 커넥션 풀 포화',
      `풀 사용률이 ${f['saturation.hikariPct'].toFixed(0)}%까지 올라갔다. 여유가 거의 없어 부하가 조금만 늘어도 대기가 생긴다.`);
  }
  if (f['saturation.cpuPct'] != null) {
    pushScaled(80, f['saturation.cpuPct'], 75, 90, 'CPU 포화',
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
  if (f['mysql.slowQueries'] > 0 && k6.httpReqs) {
    const per1k = (f['mysql.slowQueries'] / k6.httpReqs) * 1000;
    // 1건/1000요청이면 드문 예외, 100건/1000요청이면 요청 10건 중 1건이 느린 쿼리를
    // 밟는다는 뜻이라 구조적 문제다. 실측에서 147/1000 이 나왔는데 고정 60점이라
    // 순위에 묻혔다 — "과다한 게 티가 안 난다"는 지적의 원인이 이것이다.
    pushScaled(88, per1k, 1, 100, 'Slow Query 다발',
      `요청 1000건당 ${per1k.toFixed(1)}건의 slow query(>100ms, 총 ${f['mysql.slowQueries'].toFixed(0)}건). 인덱스 또는 쿼리 계획 점검 대상.`);
  }
  // RPS 대비 QPS 비율 — N+1의 직접 신호
  const rps = k6.rps;
  if (rps > 0 && f['mysql.qps'] > 0) {
    const qpr = f['mysql.qps'] / rps;
    // 목록 조회 하나는 보통 한 자릿수 쿼리로 끝난다. 10을 넘으면 의심, 50을 넘으면
    // 루프 안 조회가 거의 확실하다. 실측 275 는 fail 을 한참 넘는다.
    pushScaled(92, qpr, 10, 50, 'HTTP 요청당 쿼리 수 과다',
      `요청 1건당 평균 ${qpr.toFixed(1)}개 쿼리가 실행됐다. N+1 패턴 가능성이 높다.`);
  }
  if (f['saturation.memoryPct'] != null) {
    pushScaled(62, f['saturation.memoryPct'], 85, 95, '컨테이너 메모리 포화',
      `메모리 사용이 한계의 ${f['saturation.memoryPct'].toFixed(0)}%다. OOM Kill 위험 구간.`);
  }

  return hints.sort((a, b) => b.score - a.score);
}

module.exports = {
  analyze, evaluateRule, loadRules, loadRuleSet, validateRules, validateRequirements,
  isApplicable, isRequired, bottleneckHints, pick, RULES_FILE,
};
