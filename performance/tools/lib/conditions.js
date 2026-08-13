/**
 * Comparability 조건 정의 — "이 실행의 대조군으로 유효한 실행은?"을 답하는 선언적 표.
 *
 * comparability.js 의 비교 알고리즘이 이 표를 읽어 기준선 선택·리포트·추세 계열 분리를
 * 전부 이 표 하나로부터 이끌어낸다. 새 조건을 추가하려면 CONDITIONS 에 한 줄을 더하면 된다.
 *
 * 조건 값은 전부 "선언된 의도"여야 한다 — 측정 결과는 하나도 들어가면 안 된다
 * ---------------------------------------------------------------------------
 * 처음 떠오르는 해법은 k6 요약의 vusMax 를 조건에 넣는 것인데, 이건 설정값이 아니라
 * **관측값**이다(vus_max 메트릭의 최대치). ramping-vus 시나리오에서는 설정 피크와
 * 같아서 문제가 안 보이지만, ramping-arrival-rate(scenarios/breakpoint.js)는 목표
 * 도착률을 유지하려고 VU 를 동적으로 할당하므로 **서버가 느려질수록 vusMax 가 올라간다**.
 * 조건으로 쓰면: 진짜 회귀 발생 → vusMax 변화 → 기준선 부적격 → 비교 생략 → 게이트 통과.
 * 회귀가 심할수록 면제되는, 스스로를 무력화하는 필터가 된다. 그것도 한계 탐색이 목적인
 * 유일한 시나리오에서.
 *
 * 그래서 부하는 exec.test.options.scenarios(k6 가 해석을 끝낸 선언 값)로 식별한다.
 * 같은 이유로 durationSec(관측된 수행 시간)도 조건이 아니다 — 선언된 stages 가 조건이고,
 * 실제로 얼마나 걸렸는지는 결과다.
 *
 * 등급(materiality) — 불일치의 성격이 필드마다 다르다
 * ---------------------------------------------------
 *   blocking  : 수치가 **무의미**해진다. 기준선 자격을 박탈하고 상대 비교를 생략한다.
 *               (절대 게이트는 계속 돈다 — regression.js 의 안전 바닥)
 *   degrading : 수치가 **의심스럽다**. 비교는 하되 경고를 띄우고 FAIL 을 WARN 으로 낮춘다.
 *
 * 데이터셋이 다른 두 실행의 P95 를 나란히 놓는 것은 "믿을 수 없는 비교"가 아니라
 * 애초에 비교가 아니다. 반면 스크립트 지문 변화는 대개 주석 한 줄이고 수치는 대체로
 * 유효하다. 그래서 전자는 blocking, 후자는 degrading 이다.
 */
'use strict';

/** 조건 스키마 버전 — 필드 구성이 바뀌면 올린다. seriesHash()가 해시에 섞어 과거
 *  계열과 섞이지 않게 한다(comparability.js). */
const SCHEMA_VERSION = 1;

/**
 * 비교 가능성을 이루는 조건들.
 *
 * `read`는 run 레코드에서 값을 꺼낸다. 인덱스 엔트리는 이미 평탄화된 conditions 를
 * 들고 있으므로 conditionsOf() 가 그쪽을 우선한다(수백 개 run.json 을 열지 않기 위함).
 */
const CONDITIONS = [
  {
    key: 'scenario',
    label: '시나리오',
    materiality: 'blocking',
    read: (r) => r.run && r.run.scenario,
  },
  {
    key: 'environment',
    label: '환경',
    materiality: 'blocking',
    read: (r) => r.run && r.run.environment,
  },
  {
    key: 'dataset',
    label: '데이터셋',
    materiality: 'blocking',
    read: (r) => r.run && r.run.dataset,
  },
  {
    key: 'loadProfile',
    label: '부하 프로파일',
    materiality: 'blocking',
    read: (r) => r.run && r.run.loadProfile,
    format: formatLoadProfile,
  },
  {
    key: 'scriptVersion',
    label: '부하 스크립트',
    materiality: 'degrading',
    read: (r) => r.run && r.run.scriptVersion,
    // 이관된 과거 실행은 지문이 없다. 한쪽이라도 unknown 이면 판정하지 않는다 —
    // 전부 불일치로 잡히면 이 장치 자체가 무의미해진다.
    isUnknown: (v) => !v || v === 'unknown',
  },
  {
    key: 'measurementProfile',
    label: '측정 구간 설계',
    materiality: 'blocking',
    // loadProfile 이 "어떤 부하를 발생시켰는가"라면 이건 "어느 시간대를 판정했는가"다.
    // 둘은 책임이 다르다 — stagesFor()가 phase-plan 초 수로 stages를 생성하므로 보통
    // 같이 바뀌지만(그때는 report.js가 두 mismatch를 한 줄로 합쳐 표시한다),
    // 이론적으로는 부하 크기는 그대로 두고 측정 창(warmup/rampdown 길이)만 바꿀 수도
    // 있다 — 그 경우를 잡아내려면 별도 조건이어야 한다.
    //
    // 값 전체(equal()의 stableStringify 딥비교)를 비교하므로 mode/warmupSec/measureSec/
    // rampdownSec/gatePhase 중 하나라도 다르면 blocking이다. phasePlan이 기록되지 않은
    // 과거 실행(T-02 이전, S-17 이전)은 read()가 null을 반환해 기존 "미기록이면 비교
    // 안 함" 규칙을 그대로 탄다 — 임의의 기본값을 소급 적용하지 않는다.
    read: (r) => {
      const p = r.run && r.run.phasePlan;
      if (!p) return null;
      return {
        mode: p.mode,
        warmupSec: p.warmupSec,
        measureSec: p.measureSec,
        rampdownSec: p.rampdownSec,
        gatePhase: p.gatePhase,
      };
    },
    format: formatMeasurementProfile,
  },
];

/** 사람이 읽는 한 줄 요약 — 리포트가 "해시가 다릅니다"밖에 못 말하면 쓸모가 없다. */
function formatLoadProfile(profile) {
  if (!profile || typeof profile !== 'object') return '—';
  const parts = Object.entries(profile).map(([name, s]) => {
    const bits = [s.executor || '?'];
    if (Array.isArray(s.stages) && s.stages.length) {
      const from = s.startVUs != null ? s.startVUs : s.startRate != null ? s.startRate : 0;
      bits.push(`${from}→${s.stages.map((st) => `${st.target}@${st.duration}`).join('→')}`);
    }
    if (s.vus != null) bits.push(`${s.vus}VU`);
    if (s.rate != null) bits.push(`${s.rate}/${s.timeUnit || '1s'}`);
    if (s.iterations != null) bits.push(`${s.iterations}iter`);
    if (s.duration != null) bits.push(String(s.duration));
    if (s.maxVUs != null) bits.push(`maxVU ${s.maxVUs}`);
    const keys = Object.keys(profile);
    return keys.length > 1 ? `${name}: ${bits.join(' ')}` : bits.join(' ');
  });
  return parts.join(' | ');
}

/** 사람이 읽는 한 줄 요약 — measurementProfile 조건 값을 리포트 표에 올릴 때 쓴다. */
function formatMeasurementProfile(p) {
  if (!p) return '—';
  const bits = [p.mode || '?'];
  bits.push(`warmup ${p.warmupSec}s`);
  bits.push(`measure ${p.measureSec}s`);
  bits.push(`rampdown ${p.rampdownSec}s`);
  bits.push(`gate:${p.gatePhase == null ? '없음' : p.gatePhase}`);
  return bits.join(' · ');
}

module.exports = { CONDITIONS, SCHEMA_VERSION, formatLoadProfile, formatMeasurementProfile };
