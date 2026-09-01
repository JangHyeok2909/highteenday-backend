'use strict';
/**
 * saturation — 이 실행이 **용량을 넘긴 상태였는지** 판정한다.
 *
 * 왜 필요한가 — 닷새를 날린 오류가 여기서 나왔다
 * ------------------------------------------------
 * 2026-08-15~19 에 저장된 `normal-day` 실행의 p95 는 10,000~17,000ms 였다. 이 값을 이
 * 저장소는 **애플리케이션 지연**으로 읽고, 왜 25~45% 씩 흔들리는지를 호스트·커널·전원
 * 관리·PMU 에서 찾았다.
 *
 * 실제로는 **큐 대기**였다. 같은 앱·같은 데이터셋·같은 커밋을 포화 이하(도착률 4/s)에서
 * 재면 **278ms** 다. 38배 차이이고, 차이의 정체는 코드가 아니라 대기줄이었다.
 *
 * 신호는 처음부터 전부 있었다.
 *   - `pool.hikariAcquireP95Ms` 6,364ms — 전체 p95 의 57%
 *   - `pool.hikariPending.avg` 145 — 커넥션 10개를 145개가 대기
 *   - `cpu.throttledPct` 99.86%, `cpu.cores.avg` 1.998/2.0
 *   - 시나리오 문서의 기대 45~55 RPS 대비 실측 17~28 RPS
 *
 * 문제는 **아무도 이 조합을 "측정 무효화 조건"으로 선언하지 않았다**는 것이다.
 * `measurementStatus`(T-08)는 지표 **결측**만 본다. 지표가 멀쩡히 다 있으면서 그 값의
 * 의미가 달라지는 경우는 보지 않는다. 그래서 경고 없이 닷새가 갔다.
 *
 * 이 모듈이 그 축을 추가한다.
 *
 * 무엇을 판정하는가
 * -----------------
 * 포화는 **판정(verdict)이 아니라 해석 조건**이다. 포화 자체가 실패는 아니다 —
 * `stress`·`breakpoint` 계열은 포화를 만드는 것이 목적이다. 그래서 게이트를 실패시키지
 * 않고, **"이 실행의 p95 를 애플리케이션 지연으로 읽으면 안 된다"** 를 표시한다.
 *
 *   HEADROOM   여유 있음 — p95 를 애플리케이션 지연으로 읽어도 된다
 *   NEAR_LIMIT 한계 근처 — 큐가 생기기 시작했다. 해석에 주의
 *   SATURATED  포화 — p95 는 대기 시간이다. 애플리케이션 지연으로 인용 금지
 *   UNKNOWN    판정에 필요한 지표가 없다
 *
 * 근거 문서: localDocs/findings/perf-findings-scripts.md S-27 (2026-08-20 보정 곡선)
 */

/**
 * 신호 정의. 각 신호는 값과 두 임계(주의/포화)를 갖는다.
 *
 * 임계값의 근거는 2026-08-20 보정 곡선이다(S-27). 도착률 4/s 에서 CPU 52%·대기 0·
 * 도달률 101% 였고, 5/s 에서 CPU 97%·대기 65·도달률 77% 로 절벽을 넘었다.
 */
const SIGNALS = [
  {
    key: 'hikariPending',
    label: 'DB 커넥션 대기 스레드',
    // 유일하게 비율이 아닌 신호다. 단위를 값과 함께 들고 다니지 않으면 화면마다
    // "40.67" 이 퍼센트인지 개수인지 다르게 읽힌다.
    unit: '개',
    read: (f) => f['pool.hikariPending.avg'],
    warn: 1,
    fail: 5,
    // 가장 직접적인 신호다. 대기가 있다는 것은 정의상 큐가 생겼다는 뜻이다.
    why: '커넥션 풀 앞에 대기줄이 생겼다. 요청 지연에 대기 시간이 포함된다.',
  },
  {
    key: 'cpuThrottled',
    label: '앱 CPU throttled 비율',
    unit: '%',
    read: (f) => f['cpu.throttledPct'],
    warn: 30,
    fail: 80,
    // nr_throttled/nr_periods 다. 벽시계 손실률이 아니라 "quota 에 걸린 주기의 비율"이며,
    // 높으면 앱이 사실상 매 주기 상한을 다 쓴다는 뜻이다.
    why: '앱이 CPU 상한을 거의 매 주기 소진했다. 처리율이 상한에 묶여 지연이 대기로 나타난다.',
  },
  {
    key: 'cpuUtil',
    label: '앱 CPU 사용률(상한 대비)',
    unit: '%',
    read: (f) => (f['cpu.cores.avg'] != null && f['cpu.limitCores']
      ? (f['cpu.cores.avg'] / f['cpu.limitCores']) * 100 : null),
    warn: 75,
    fail: 90,
    why: 'CPU 상한에 근접했다. 이 구간에서는 작은 용량 변화가 큰 지연 변화로 증폭된다.',
  },
  {
    key: 'acquireShare',
    label: '커넥션 획득이 p95 에서 차지하는 비율',
    unit: '%',
    read: (f, k) => (f['pool.hikariAcquireP95Ms'] != null && k && k.p95
      ? (f['pool.hikariAcquireP95Ms'] / k.p95) * 100 : null),
    warn: 20,
    fail: 40,
    // 이게 40% 를 넘으면 "지연의 절반이 대기"라는 뜻이라 애플리케이션 지연이라 부를 수 없다.
    why: '응답시간의 상당 부분이 커넥션 대기다. 애플리케이션 처리 시간이 아니다.',
  },
];

/**
 * 도착률 달성도 — **open model 에서만 의미가 있다.**
 *
 * closed model 은 시스템이 느려지면 부하 발생기가 스스로 요청을 줄이므로(coordinated
 * omission) "목표 대비 실제"라는 개념 자체가 없다. 그래서 목표 도착률이 기록된 실행에만
 * 적용한다. 미달은 **가장 결정적인 포화 신호**다 — 부하 발생기가 계획한 부하를 넣지
 * 못했다는 직접 증거이기 때문이다.
 */
function achievedRate(record) {
  const sc = record.run && record.run.loadProfile && record.run.loadProfile.normal_day;
  const measure = record.k6 && record.k6.phases && record.k6.phases.measure;
  if (!sc || !measure || sc.executor !== 'ramping-arrival-rate') return null;
  const target = Array.isArray(sc.stages) && sc.stages.length
    ? Math.max(...sc.stages.map((s) => Number(s.target) || 0)) : null;
  if (!target || !measure.durationSec) return null;
  const actual = measure.iterations / measure.durationSec;
  return { target, actual, pct: (actual / target) * 100 };
}

/**
 * 실행 레코드에서 포화 상태를 판정한다.
 * @returns {{status:string, signals:Array, reasons:Array<string>, achievedRate:Object|null}}
 */
function assess(record) {
  const f = (record.infra && record.infra.flat) || {};
  const k = (record.k6 && record.k6.phases && record.k6.phases.measure) || (record.k6 && record.k6.all);

  const signals = [];
  for (const s of SIGNALS) {
    const value = s.read(f, k);
    if (value == null || !Number.isFinite(value)) {
      signals.push({ key: s.key, label: s.label, unit: s.unit, value: null, level: 'unknown' });
      continue;
    }
    const level = value >= s.fail ? 'fail' : value >= s.warn ? 'warn' : 'ok';
    signals.push({
      key: s.key, label: s.label, unit: s.unit, value: +value.toFixed(2),
      level, warn: s.warn, fail: s.fail, why: s.why,
    });
  }

  const rate = achievedRate(record);
  if (rate) {
    // 도달률은 낮을수록 나쁘므로 부호가 반대다.
    const level = rate.pct < 90 ? 'fail' : rate.pct < 98 ? 'warn' : 'ok';
    signals.push({
      key: 'achievedRate',
      label: '도착률 달성도',
      unit: '%',
      value: +rate.pct.toFixed(1),
      level,
      why: '부하 발생기가 계획한 도착률을 넣지 못했다. 시스템이 용량을 넘었다는 직접 증거다.',
    });
  }

  const known = signals.filter((s) => s.level !== 'unknown');
  if (!known.length) {
    return { status: 'UNKNOWN', signals, reasons: ['판정에 필요한 지표가 없습니다.'], achievedRate: rate };
  }

  const fails = known.filter((s) => s.level === 'fail');
  const warns = known.filter((s) => s.level === 'warn');
  const status = fails.length ? 'SATURATED' : warns.length ? 'NEAR_LIMIT' : 'HEADROOM';

  // 단위를 신호가 직접 들고 있으므로 예전처럼 key 로 특수 분기하지 않는다. 그 분기는
  // achievedRate 에만 % 를 붙여, CPU 사용률 40.67 을 단위 없이 내보내고 있었다.
  const reasons = [...fails, ...warns].map((s) => `${s.label} ${s.value}${s.unit || ''} — ${s.why}`);
  return { status, signals, reasons, achievedRate: rate };
}

/** 콘솔·리포트용 한 줄 경고. HEADROOM 이면 null 을 준다(줄을 늘리지 않는다). */
function banner(sat) {
  if (!sat) return null;
  if (sat.status === 'SATURATED') {
    return '❌ 포화 상태 — 이 실행의 p95 는 **애플리케이션 지연이 아니라 큐 대기**입니다. '
      + '애플리케이션 성능으로 인용하지 마십시오.';
  }
  if (sat.status === 'NEAR_LIMIT') {
    return '⚠  한계 근처 — 큐가 생기기 시작했습니다. p95 에 대기 시간이 섞여 있습니다.';
  }
  if (sat.status === 'UNKNOWN') return '·  포화 여부 판정 불가 (관련 지표 없음)';
  return null;
}

/**
 * 두 실행의 포화 상태가 다르면 상대 비교가 성립하지 않는다.
 *
 * 포화 영역의 p95 는 `R = N/X` 로 결정되고 비포화 영역의 p95 는 서비스 시간이다.
 * **서로 다른 물리량**이므로 증감률을 계산해도 의미가 없다.
 */
function regimeMismatch(current, baseline) {
  if (!current || !baseline) return null;
  const a = current.status;
  const b = baseline.status;
  if (a === 'UNKNOWN' || b === 'UNKNOWN' || a === b) return null;
  return `현재 실행은 ${a}, 기준선은 ${b} 입니다 — 포화 영역과 비포화 영역의 p95 는 `
    + '서로 다른 물리량이라 증감률에 의미가 없습니다.';
}

module.exports = { assess, banner, regimeMismatch, SIGNALS };
