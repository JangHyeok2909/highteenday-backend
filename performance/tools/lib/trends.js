'use strict';
/**
 * trends — **여러 회차에 걸친 값**을 계산하는 단일 지점.
 *
 * 왜 별도 모듈인가
 * ----------------
 * 지금은 `history.js` 하나가 이력을 그리지만, 계열별 상세 이력이 곧 붙는다. 두 렌더러가
 * 각자 CV 를 계산하기 시작하면 같은 계열에 대해 **서로 다른 안정성 수치**를 말하게 된다.
 *
 * 이 저장소는 이미 그 사고를 겪었다 — `scripts/lib/sampling.js` 가 분리된 이유가 정확히
 * 이것이다. Zipf 근사식이 부하 생성과 시드 생성 두 곳에 글자까지 똑같이 복제돼 있었고,
 * index 0 을 못 뽑는 버그가 **양쪽에 동시에** 존재했다. 한쪽만 고쳤으면 "가장 인기 있는
 * 글에 댓글이 0건"인 모순이 생길 참이었다. 규칙은 하나만 존재해야 한다.
 *
 * 그래서 계산은 여기, 렌더는 각 도구가 한다.
 *
 * 무엇을 계산하는가 — 개별 실행 리포트가 **원리적으로** 못 만드는 값들이다
 * ------------------------------------------------------------------------
 *   stats()      같은 계열 N 회의 평균·표준편차·변동계수(CV)
 *   mde()        지금 이 계열에서 검출 가능한 최소 개선폭
 *   trendStat()  전반/후반 중앙값 비교 — 완만한 누적 저하 탐지
 *   regimeOf()   그 실행이 어떤 체제(포화/비포화)에서 측정됐는가
 *
 * 앞의 셋은 n=1 인 리포트가 만들 수 없다. 네 번째는 만들 수 있지만 지금까지 이력으로
 * 넘어오지 않아, 포화 회차와 비포화 회차가 같은 선 위에 그려지고 있었다.
 */

/** 표본이 이보다 적으면 전반/후반으로 나누는 것 자체가 의미가 없다. */
const MIN_TREND_SAMPLES = 4;

/**
 * MDE 상수 — (z_{1-α/2} + z_{1-β}) 의 합. α=0.05(양측), power=0.8 기준이다.
 *
 *   z_{0.975} = 1.9600
 *   z_{0.800} = 0.8416
 *
 * 정규 근사다. n 이 작을 때(<10) t 분포를 쓰면 실제 필요 표본은 이보다 조금 더 많다.
 * **즉 여기서 나온 MDE 는 낙관적인 하한이다** — "이 값보다 작은 개선은 확실히 못 잡는다"로
 * 읽어야 하고, "이 값보다 크면 반드시 잡는다"로 읽으면 안 된다.
 */
const MDE_K = 2.8016;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** null·NaN·Infinity 를 걷어내고 숫자 배열로 만든다. 결측은 0 이 아니라 없는 값이다. */
function numeric(values) {
  return values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
}

/**
 * 기술통계. **표본 표준편차(n-1)** 를 쓴다 — 우리가 가진 것은 모집단이 아니라 표본이고,
 * n 이 5~10 인 구간에서 n 으로 나누면 변동성을 체계적으로 과소평가한다.
 *
 * CV(변동계수) = 표준편차 ÷ 평균 × 100. 단위가 다른 지표끼리 "얼마나 흔들리는가"를
 * 비교하려면 절대 산포로는 안 되고 상대 산포여야 한다(ms 와 per_sec 을 나란히 놓아야 한다).
 *
 * 평균이 0 에 가까우면 CV 가 발산하므로 그 경우 cv 는 null 로 둔다 — 큰 수를 내놓는 것보다
 * "이 지표에는 CV 를 쓸 수 없다"가 정확하다.
 */
function stats(values) {
  const v = numeric(values);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1);
  const sd = Math.sqrt(variance);
  const cv = Math.abs(mean) > 1e-9 ? (sd / Math.abs(mean)) * 100 : null;
  return {
    n: v.length,
    mean,
    sd,
    cv,
    min: Math.min(...v),
    max: Math.max(...v),
    median: median(v),
    first: v[0],
    last: v[v.length - 1],
  };
}

/**
 * 최소 검출 가능 효과 — "지금 이 계열에서 몇 % 이상 달라져야 통계적으로 구분되는가".
 *
 *   MDE(%) ≈ K × CV(%) × √(2/n)
 *
 * √(2/n) 의 2 는 **두 그룹 비교**(개선 전 n회 vs 개선 후 n회)라서 붙는다. 한 그룹의
 * 평균을 고정된 기준값과 비교하는 것이 아니라, 양쪽 다 표본이라 오차가 두 번 들어간다.
 *
 * 이 값이 중요한 이유: 요청당 쿼리를 229 → 200 으로 줄여 p95 가 12% 좋아져도, MDE 가
 * 17% 인 계열에서 n=5 로 재면 **"차이 없음"으로 결론난다.** 개선은 실재하는데 측정이
 * 그걸 볼 수 없다. 최적화를 시작하기 전에 반드시 확인해야 하는 값이고, 이력만이 준다.
 */
function mde(cv, n) {
  if (cv == null || !Number.isFinite(cv) || !(n >= 2)) return null;
  return MDE_K * cv * Math.sqrt(2 / n);
}

/**
 * 목표 개선폭을 검출하려면 조건당 몇 회가 필요한가 — mde() 를 n 에 대해 푼 것.
 *
 *   n = 2 × (K × CV ÷ 목표%)²
 *
 * 상한을 두는 이유: CV 가 40% 를 넘는 계열에서는 수백 회가 나오는데, 그건 "표본을 더
 * 모으라"가 아니라 **"표본을 더 모아서 될 일이 아니다"** 라는 뜻이다. 그 경우 할 일은
 * 반복이 아니라 변동원 제거(포화 회차 배제, 조건 고정)다.
 */
function runsNeededFor(targetPct, cv, cap = 200) {
  if (cv == null || !(targetPct > 0)) return null;
  const n = Math.ceil(2 * ((MDE_K * cv) / targetPct) ** 2);
  return { n: Math.min(n, cap), capped: n > cap, exact: n };
}

/**
 * 추세 통계 — 최근 N회를 앞/뒤 절반으로 나눠 중앙값을 비교한다.
 *
 * 왜 "첫 값 대비 마지막 값"이 아닌가: 개별 실행은 노이즈가 크다. 양 끝점 두 개만 쓰면
 * 하필 그 두 번이 이상치였을 때 완전히 틀린 결론이 나온다. 절반씩 묶어 중앙값을 비교하면
 * 이상치 하나에 흔들리지 않으면서 방향성은 그대로 드러난다.
 *
 * (history.js 에 있던 함수를 그대로 옮겼다 — 상세 이력이 같은 계산을 복제하지 않도록.)
 */
function trendStat(values) {
  const v = numeric(values);
  if (v.length < MIN_TREND_SAMPLES) return null;
  const mid = Math.floor(v.length / 2);
  const older = median(v.slice(0, mid));
  const newer = median(v.slice(mid));
  if (!older) return null;
  return {
    older,
    newer,
    changePct: ((newer - older) / Math.abs(older)) * 100,
    first: v[0],
    last: v[v.length - 1],
    min: Math.min(...v),
    max: Math.max(...v),
    n: v.length,
  };
}

/**
 * ── 체제(regime) 판정 ──────────────────────────────────────────────────────
 *
 * **권위 있는 판정은 `saturation.js` 가 내린 것 하나뿐이다.**
 *
 * 인덱스 지표(cpuMaxPct, hikariPendingMax)로 그 판정을 흉내 내고 싶은 유혹이 있는데,
 * 흉내 내면 안 된다 — saturation.js 는 `pool.hikariPending.avg` 와 `cpu.throttledPct` 를
 * 보는데 인덱스에는 **max** 만 있다. 같은 이름의 다른 값이 두 개 생기고, 어느 화면을
 * 보느냐에 따라 같은 실행이 포화였다 아니었다 한다. 이 모듈이 존재하는 이유와 정반대다.
 *
 * 그래서 판정이 없는 실행은 `UNASSESSED` 로 남긴다. 2026-08-20 에 saturation.js 가 붙었으므로
 * 그 이전 실행 63건이 여기 해당한다. **"판정 없음"은 "여유 있음"이 아니다.**
 *
 * 다만 판정과 별개로 `queued` 축을 하나 둔다. `hikariPendingMax > 0` 은 그 자체로 관측된
 * 사실이고(추정이 아니다), 표본에서 뺄지 말지를 사람이 정할 수 있어야 하기 때문이다.
 *
 * 실측 근거 — 계열 bfa06492dbb5(normal-day / arrival-rate / medium, 9회)의 p95:
 *
 *   전체 9회            CV 42.28%   MDE 55.8%
 *   대기 발생 1회 제외   CV 18.05%   MDE 25.3%
 *
 * **단 한 회차가 계열 전체의 변동성 추정을 두 배 넘게 부풀린다.** 그 회차(07:16, p95 784ms,
 * hikariPendingMax 21)는 다른 8회와 화면상 완전히 똑같은 점으로 그려지고 있었다.
 */
const REGIME_LABEL = {
  HEADROOM: '여유',
  NEAR_LIMIT: '한계 근처',
  SATURATED: '포화',
  UNKNOWN: '판정 불가',
  UNASSESSED: '미판정',
};

function regimeOf(entry) {
  const e = entry || {};
  const status = e.saturationStatus || 'UNASSESSED';
  return {
    status,
    label: REGIME_LABEL[status] || status,
    // 판정의 출처. 'assessed' 만이 saturation.js 가 실제로 본 결과다.
    source: e.saturationStatus ? 'assessed' : 'none',
    // 관측된 사실 — 판정과 독립이다. 미판정 실행에도 값이 있다.
    queued: e.hikariPendingMax != null && e.hikariPendingMax > 0,
    // 측정 자체가 온전했는가. 체제와 다른 축이라 따로 싣는다.
    unmeasured: e.measurementStatus === 'UNMEASURED',
    windowIncomplete: e.windowIncomplete === true,
    achievedRatePct: e.achievedRatePct != null ? e.achievedRatePct : null,
  };
}

/** 계열 안에서 체제가 섞여 있으면 그 계열의 추세·CV 는 서로 다른 물리량의 혼합이다. */
function regimeMix(rows) {
  const counts = {};
  let queued = 0;
  for (const r of rows) {
    const g = regimeOf(r);
    counts[g.status] = (counts[g.status] || 0) + 1;
    if (g.queued) queued++;
  }
  const distinct = Object.keys(counts).filter((k) => k !== 'UNASSESSED');
  return {
    counts,
    queued,
    // 판정된 체제가 두 종류 이상 섞였는가. 섞였으면 증감률에 의미가 없다.
    mixed: distinct.length > 1,
    allUnassessed: distinct.length === 0,
  };
}

/**
 * 표본 집합 — 같은 계열이라도 "무엇을 표본으로 볼 것인가"에 따라 CV 가 두 배 넘게 달라진다.
 * 하나의 답만 내놓지 않고 후보를 나란히 제시해, 어떤 표본을 근거로 삼았는지 말할 수 있게 한다.
 */
function sampleSets(rows) {
  const clean = rows.filter((r) => !regimeOf(r).queued);
  const sets = [{ key: 'all', label: '전체', rows }];
  if (clean.length && clean.length !== rows.length) {
    sets.push({ key: 'no-queue', label: '대기 발생 회차 제외', rows: clean });
  }
  if (rows.length > 5) {
    sets.push({ key: 'recent5', label: '최근 5회', rows: rows.slice(-5) });
  }
  return sets;
}

/**
 * 계열별 안정성 — 지표마다 CV 와 MDE 를 낸다.
 *
 * `keys` 는 "판정 축 후보"다. 회귀 게이트가 실제로 보는 k6 지표만 넣는다 — 인프라 지표의
 * CV 는 진단에는 쓰이지만 "개선을 검출할 수 있는가"라는 질문의 대상이 아니다.
 */
const JUDGEMENT_AXES = [
  { key: 'p95', label: 'P95 응답시간', unit: 'ms', gate: 'k6.phases.measure.p95' },
  { key: 'p99', label: 'P99 응답시간', unit: 'ms', gate: 'k6.phases.measure.p99' },
  { key: 'avg', label: '평균 응답시간', unit: 'ms', gate: 'k6.phases.measure.avg' },
  { key: 'tps', label: 'TPS', unit: 'per_sec', gate: 'k6.phases.measure.tps' },
  { key: 'rps', label: 'RPS', unit: 'per_sec', gate: 'k6.phases.measure.rps' },
];

function stabilityOf(rows, axes = JUDGEMENT_AXES) {
  return axes.map((a) => {
    const s = stats(rows.map((r) => r[a.key]));
    return {
      ...a,
      stats: s,
      mde: s ? mde(s.cv, s.n) : null,
    };
  }).filter((x) => x.stats);
}

/**
 * 어떤 축으로 판정해야 하는가 — MDE 가 가장 작은(=가장 예민한) 축을 고른다.
 *
 * 지연 축과 처리량 축은 성격이 다르므로 각각에서 하나씩 고른다. 도착률을 고정한 open model
 * 에서는 처리량 CV 가 0.5% 수준으로 내려가는데, 그건 "처리량이 안정적"이 아니라 **"처리량을
 * 우리가 고정했다"** 는 뜻이다. 그 축으로 개선을 재면 아무것도 안 보인다 — 그래서 지연 축을
 * 따로 고른다.
 */
function recommendAxis(stability) {
  const latency = stability.filter((s) => s.unit === 'ms' && s.mde != null);
  const throughput = stability.filter((s) => s.unit === 'per_sec' && s.mde != null);
  const pick = (arr) => (arr.length ? arr.reduce((a, b) => (a.mde <= b.mde ? a : b)) : null);
  return { latency: pick(latency), throughput: pick(throughput) };
}

/** 시나리오 + 실행 조건 해시로 계열을 나눈다. 조건이 다르면 같은 선에 이으면 안 된다. */
function seriesOf(runs) {
  const out = [];
  for (const r of runs) {
    const key = `${r.scenario}::${r.seriesHash || 'unknown'}`;
    let s = out.find((x) => x.key === key);
    if (!s) out.push((s = { key, scenario: r.scenario, hash: r.seriesHash, rows: [] }));
    s.rows.push(r);
  }
  return out;
}

/**
 * 이 계열에서 실제로 실패를 만든 게이트가 무엇인가 — 회차별 실패 키를 세어 순위를 낸다.
 *
 * 왜 필요한가: 이력 표는 `FAIL` 배지만 보여준다. 그래서 계열 9회가 전부 FAIL 인데도
 * **무엇이 실패시켰는지 화면 어디에도 없다.** 실측 사례에서 p95 평균 381ms(SLO 500 이내)로
 * 통과처럼 보이는 동안 실제 실패 축은 p99 2,028ms(SLO 1,200)였고, 그 사실이 논의에
 * 한 번도 등장하지 않았다.
 */
function failingAxes(rows) {
  const counts = {};
  for (const r of rows) {
    for (const k of r.gateFailures || []) {
      counts[k] = counts[k] || { key: k, runs: 0, absolute: 0 };
      counts[k].runs++;
    }
    for (const k of r.absoluteGateFailures || []) {
      counts[k] = counts[k] || { key: k, runs: 0, absolute: 0 };
      counts[k].absolute++;
    }
  }
  return Object.values(counts).sort((a, b) => b.runs - a.runs || b.absolute - a.absolute);
}

/**
 * ── 감시 레이어가 쓰는 축약 ────────────────────────────────────────────────
 *
 * 감시(history.html)와 조사(trends/<hash>.html)는 **같은 계산에서 서로 다른 양의 정보를**
 * 꺼내 쓴다. 감시는 "봐야 하는지"만 답하고, 조사는 "무엇인지"를 답한다.
 *
 * 축약이 감시 쪽 렌더러가 아니라 여기 있는 이유: 감시가 고른 권고 축과 조사가 표에 그리는
 * 권고 축이 다르면, 같은 계열에 대해 두 화면이 다른 말을 한다. 고르는 규칙도 계산이다.
 */

/** 감시 헤드라인의 '여유' 칸 — 포화도 중 가장 높은 자원을 자동으로 고른다(병목이 옮겨 가면 칸도 따라간다). */
const HEADROOM_CANDIDATES = [
  { key: 'cpuMaxPct', label: 'CPU' },
  { key: 'hikariPct', label: 'HikariCP' },
  { key: 'heapPct', label: 'JVM Heap' },
];

function pickHeadroom(rows) {
  const last = rows[rows.length - 1] || {};
  let best = null;
  for (const c of HEADROOM_CANDIDATES) {
    const v = last[c.key];
    if (v == null || !Number.isFinite(v)) continue;
    if (!best || v > best.current) best = { ...c, current: v };
  }
  return best;
}

/**
 * 헤드라인 네 칸 — 지연 / 처리 / 비용 / 여유.
 *
 * 네 개인 이유는 감시 화면이 답해야 하는 질문이 네 개이기 때문이다. 지표를 몇 개 보여줄까가
 * 아니라 질문이 몇 개인가로 정한다 — 그래야 카탈로그가 157개로 자라도 이 칸이 안 늘어난다.
 *
 * '비용'이 한 칸을 차지하는 것이 이 설계의 핵심이다. CPU 포화 환경에서는 사용률이 신호가
 * 아니고 요청당 비용만 움직인다. 그 값이 지금까지 이력에 없었다.
 */
function headlineOf(rows) {
  const sets = sampleSets(rows);
  const primary = sets.find((s) => s.key === 'no-queue') || sets[0];
  const rec = recommendAxis(stabilityOf(primary.rows));
  const latency = rec.latency || JUDGEMENT_AXES[0];

  const slot = (title, key, label, unit, dir) => {
    const values = rows.map((r) => (r[key] == null ? null : r[key]));
    const st = stats(values);
    const tr = trendStat(values);
    const cur = [...values].reverse().find((v) => v != null);
    return {
      title, key, label, unit, dir, values, current: cur == null ? null : cur, stats: st, trend: tr,
    };
  };

  const headroom = pickHeadroom(rows);
  return [
    slot('지연', latency.key, latency.label, 'ms', 'lower'),
    slot('처리', 'tps', 'TPS', 'per_sec', 'higher'),
    slot('비용', 'stackCpuMsPerReq', '요청당 스택 CPU', 'ms', 'lower'),
    headroom
      ? slot('여유', headroom.key, `${headroom.label} 포화도`, 'percent', 'lower')
      : slot('여유', 'cpuMaxPct', 'CPU 포화도', 'percent', 'lower'),
  ];
}

/**
 * 감시용 한 줄 요약 — 조사 화면의 표를 대신한다.
 * 감시는 "지금 이 계열로 무엇을 검출할 수 있는가"에 한 문장으로 답하면 된다.
 */
function stabilityLine(rows, targetPct = 10) {
  const sets = sampleSets(rows);
  const primary = sets.find((s) => s.key === 'no-queue') || sets[0];
  const rec = recommendAxis(stabilityOf(primary.rows));
  if (!rec.latency) return null;
  const need = runsNeededFor(targetPct, rec.latency.stats.cv);
  return {
    sampleLabel: primary.label,
    n: primary.rows.length,
    axis: rec.latency,
    targetPct,
    need,
    excluded: rows.length - primary.rows.length,
  };
}

/** 감시용 실패 축 한 줄 — 지배적인 축 하나만. 전체 목록은 조사 화면이 낸다. */
function dominantFailure(rows) {
  const axes = failingAxes(rows);
  if (!axes.length) return null;
  const top = axes[0];
  return { ...top, total: rows.length, allRuns: top.runs === rows.length, others: axes.length - 1 };
}

module.exports = {
  MIN_TREND_SAMPLES, MDE_K, JUDGEMENT_AXES, REGIME_LABEL, HEADROOM_CANDIDATES,
  median, numeric, stats, mde, runsNeededFor, trendStat,
  regimeOf, regimeMix, sampleSets, stabilityOf, recommendAxis, seriesOf, failingAxes,
  headlineOf, stabilityLine, dominantFailure, pickHeadroom,
};
