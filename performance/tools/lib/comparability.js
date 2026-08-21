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
 * (b)의 조건은 ./conditions.js 에 선언적으로 모여 있다 — 조건이 하나 늘 때마다 이 파일에
 * 불리언과 분기를 덧대는 대신, 그 표에 한 줄을 추가하면 기준선 선택·리포트·추세 계열
 * 분리가 전부 따라온다. 이 파일은 그 선언을 읽어 비교 알고리즘만 구현한다.
 */
'use strict';

const crypto = require('crypto');
const { CONDITIONS, SCHEMA_VERSION, formatLoadProfile, formatMeasurementProfile } = require('./conditions');

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

/** 조건 집합을 리포트 표에 올릴 [라벨, 값] 목록으로 편다. */
function describeAll(conditions) {
  if (!conditions) return [];
  return CONDITIONS.map((c) => [c.label, describe(c, conditions[c.key])]);
}

/**
 * 조건 하나만 사람이 읽는 문자열로. 전체 표가 필요 없는 곳(이력 화면의 계열 제목 등)이 쓴다.
 *
 * 이게 없어서 호출부가 `String(conditions.dataset)` 를 하고 있었고, dataset 조건이 v3 에서
 * 객체가 된 뒤로 이력 화면에 **`데이터셋 [object Object]`** 가 찍히고 있었다. 포맷터는
 * CONDITIONS 표가 이미 들고 있으므로 호출부가 직접 문자열을 만들 이유가 없다.
 */
function describeCondition(conditions, key) {
  const c = CONDITIONS.find((x) => x.key === key);
  if (!c || !conditions) return '—';
  return describe(c, conditions[key]);
}

module.exports = {
  CONDITIONS, SCHEMA_VERSION,
  conditionsOf, seriesHash, compare, describeAll, describeCondition,
  formatLoadProfile, formatMeasurementProfile,
  stableStringify, digest,
};
