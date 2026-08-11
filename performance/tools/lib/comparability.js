/**
 * Comparability — 두 실행이 "같은 실험"인지 판정한다.
 *
 * 왜 별도 모듈인가
 * ----------------
 * 회귀 판정은 서로 다른 두 질문을 답해야 한다.
 *   (a) 이력상 직전 실행은 무엇인가?          — 시간축 질문
 *   (b) 이 실행의 대조군으로 유효한 실행은?    — 실험 설계 질문
 * 오래도록 (a)만 구현돼 있었고 (b)는 "같은 시나리오면 어련히 같겠지"라고 가정돼 있었다.
 * 그 결과 large/200VU 실행이 small/15VU 실행을 기준선으로 삼아 P95 101ms → 60001ms 를
 * "+59,000% 회귀"로 보고했다. 13배 부하 + 100배 데이터를 성능 저하로 읽게 만든 것이다.
 *
 * 그래서 (b)를 여기 한 곳에 선언적으로 모은다. 조건이 하나 늘 때마다 엔진에 불리언과
 * 분기를 덧대는 대신, 아래 CONDITIONS 표에 한 줄을 추가하면 기준선 선택·리포트·추세
 * 계열 분리가 전부 따라온다.
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

const crypto = require('crypto');

/** 조건 스키마 버전 — 필드 구성이 바뀌면 올린다. 해시에 섞여 과거 계열과 섞이지 않는다. */
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
];

const BLOCKING = CONDITIONS.filter((c) => c.materiality === 'blocking');

/** 키 순서에 무관한 정규 직렬화 — 해시가 객체 리터럴 순서에 흔들리면 안 된다. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) || 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 12);
}

/**
 * 레코드(또는 인덱스 엔트리)에서 조건 값을 꺼낸다.
 * 인덱스 엔트리가 conditions 를 이미 들고 있으면 그대로 쓴다.
 */
function conditionsOf(recordOrEntry) {
  if (!recordOrEntry) return null;
  if (recordOrEntry.conditions) return recordOrEntry.conditions;
  const out = {};
  for (const c of CONDITIONS) {
    const v = c.read(recordOrEntry);
    out[c.key] = v === undefined ? null : v;
  }
  return out;
}

/**
 * 계열 해시 — "같은 실험"을 식별한다. blocking 조건만 들어간다.
 *
 * degrading 조건(스크립트 지문)을 넣으면 주석 한 줄 수정이 계열을 갈라 추세 그래프가
 * 상시 리셋된다. 기준선 후보 탐색과 추세 계열 분리에 같은 해시를 쓴다.
 */
function seriesHash(conditions) {
  if (!conditions) return null;
  const subset = { schemaVersion: SCHEMA_VERSION };
  for (const c of BLOCKING) subset[c.key] = conditions[c.key] == null ? null : conditions[c.key];
  return digest(subset);
}

function equal(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return stableStringify(a) === stableStringify(b);
  return false;
}

/**
 * 두 조건 집합을 비교한다.
 *
 * @returns {{comparable:boolean, level:'exact'|'degraded'|'incomparable', mismatches:Array}}
 *   level  exact        — 모든 조건 일치. 상대 비교를 그대로 신뢰한다.
 *          degraded     — degrading 조건만 다름. 비교하되 게이트를 연다.
 *          incomparable — blocking 조건이 다르거나 기록되지 않음. 상대 비교를 생략한다.
 */
function compare(current, baseline) {
  if (!current || !baseline) {
    return {
      comparable: false,
      level: 'incomparable',
      mismatches: [{
        key: '*', label: '실행 조건', materiality: 'blocking', reason: 'unrecorded',
        current: null, baseline: null,
        desc: '실행 조건이 기록되지 않아 비교 가능성을 판정할 수 없다',
      }],
    };
  }

  const mismatches = [];
  for (const c of CONDITIONS) {
    const a = current[c.key] == null ? null : current[c.key];
    const b = baseline[c.key] == null ? null : baseline[c.key];

    if (c.materiality === 'degrading') {
      const unknown = c.isUnknown || ((v) => v == null);
      if (unknown(a) || unknown(b)) continue;
      if (!equal(a, b)) {
        mismatches.push({
          key: c.key, label: c.label, materiality: 'degrading', reason: 'differs',
          current: a, baseline: b,
          desc: `${c.label}: ${describe(c, b)} → ${describe(c, a)}`,
        });
      }
      continue;
    }

    // blocking — 값이 없으면 "같다"고 볼 근거가 없다. 같음을 증명하지 못하면 비교하지 않는다.
    if (a == null || b == null) {
      mismatches.push({
        key: c.key, label: c.label, materiality: 'blocking', reason: 'unrecorded',
        current: a, baseline: b,
        desc: `${c.label}: ${a == null && b == null ? '양쪽 모두' : a == null ? '현재 실행에' : '기준 후보에'} 기록되지 않음`,
      });
      continue;
    }
    if (!equal(a, b)) {
      mismatches.push({
        key: c.key, label: c.label, materiality: 'blocking', reason: 'differs',
        current: a, baseline: b,
        desc: `${c.label}: ${describe(c, b)} → ${describe(c, a)}`,
      });
    }
  }

  const blocked = mismatches.some((m) => m.materiality === 'blocking');
  return {
    comparable: !blocked,
    level: blocked ? 'incomparable' : mismatches.length ? 'degraded' : 'exact',
    mismatches,
  };
}

function describe(cond, value) {
  if (value == null) return '—';
  if (cond.format) return cond.format(value);
  return String(value);
}

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

/** 조건 집합을 리포트 표에 올릴 [라벨, 값] 목록으로 편다. */
function describeAll(conditions) {
  if (!conditions) return [];
  return CONDITIONS.map((c) => [c.label, describe(c, conditions[c.key])]);
}

module.exports = {
  CONDITIONS, SCHEMA_VERSION,
  conditionsOf, seriesHash, compare, describeAll, formatLoadProfile,
  stableStringify, digest,
};
