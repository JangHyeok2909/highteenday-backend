'use strict';

/**
 * 신뢰표가 **무엇이 포화됐는지**까지 첫 화면에서 말하는지 검증한다.
 *
 * 왜 이걸 테스트하는가(E-51). 반복 세트의 한 회차가 2.4배 느렸고 원인은 커넥션 풀
 * 고갈이었다(대기 20, 풀 100%). 그런데 첫 줄은 `NEAR_LIMIT` 이라고만 말했고, "풀이 찼다"를
 * 보려면 문서 중간을 펼쳐야 했다. 원인 후보 7개를 기각한 뒤에야 도달했다.
 * 자료(`saturation.signals`)는 그때도 있었다 — 화면이 그걸 안 썼을 뿐이다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sectionTrust } = require('../lib/report');

/** 신뢰표 렌더링에 필요한 최소 레코드. */
function rec(signals, status) {
  return {
    regression: { measurementStatus: 'MEASURED' },
    saturation: { status, signals },
    k6: { phases: { measure: { errorRate: 0 } } },
    run: { appImage: { available: true, imageId: 'sha256:abcdef123456', stale: false } },
  };
}

const OK_SIGNALS = [
  { key: 'hikariPending', label: 'DB 커넥션 대기 스레드', unit: '개', value: 0, level: 'ok', warn: 1, fail: 5 },
  { key: 'cpuThrottled', label: '앱 CPU throttled 비율', unit: '%', value: 7.55, level: 'ok', warn: 30, fail: 80 },
  { key: 'cpuUtil', label: '앱 CPU 사용률(상한 대비)', unit: '%', value: 40.67, level: 'ok', warn: 75, fail: 90 },
  { key: 'achievedRate', label: '도착률 달성도', unit: '%', value: 100.3, level: 'ok' },
];

/** 태그를 걷어낸 순수 텍스트. 어떤 문장이 실제로 사람에게 보이는지로 판정한다. */
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test("라벨이 '체제' 가 아니라 '포화 판정' 이다", () => {
  const t = text(sectionTrust(rec(OK_SIGNALS, 'HEADROOM')));
  assert.match(t, /포화 판정 HEADROOM/);
  assert.ok(!/체제/.test(t), "'체제' 라벨이 남아 있다");
});

test('정상일 때도 무엇을 확인했는지 남긴다 — 침묵은 판정이 아니다', () => {
  const t = text(sectionTrust(rec(OK_SIGNALS, 'HEADROOM')));
  assert.match(t, /자원 여유 있음 — 신호 4개 전부 임계 이하/);
});

test('정상일 때 가장 임계에 가까운 신호를 지목한다 — 여유가 얼마인지 알아야 한다', () => {
  // 40.67/75 = 0.54 로 7.55/30 = 0.25 보다 크다. CPU 사용률이 뽑혀야 한다.
  const t = text(sectionTrust(rec(OK_SIGNALS, 'HEADROOM')));
  assert.match(t, /가장 근접: 앱 CPU 사용률\(상한 대비\) 40\.67% \/ 임계 75%/);
});

test('도착률은 근접도 비교에서 빠진다 — 낮을수록 나쁜 반대 부호라 순위가 뒤집힌다', () => {
  // 100.3/warn 을 그대로 쓰면 도착률이 항상 1위가 되어 CPU·풀을 가린다.
  const t = text(sectionTrust(rec(OK_SIGNALS, 'HEADROOM')));
  assert.ok(!/가장 근접: 도착률/.test(t));
});

test('포화면 어느 자원이 얼마이고 임계가 얼마인지 첫 줄에서 말한다', () => {
  const signals = [
    { key: 'hikariPending', label: 'DB 커넥션 대기 스레드', unit: '개', value: 20, level: 'fail', warn: 1, fail: 5 },
    { key: 'cpuUtil', label: '앱 CPU 사용률(상한 대비)', unit: '%', value: 80, level: 'warn', warn: 75, fail: 90 },
  ];
  const t = text(sectionTrust(rec(signals, 'SATURATED')));
  assert.match(t, /DB 커넥션 대기 스레드 20개 \(임계 warn 1개 \/ fail 5개\)/);
  assert.match(t, /앱 CPU 사용률\(상한 대비\) 80% \(임계 warn 75% \/ fail 90%\)/);
});

test('가장 심한 자원이 먼저 나온다 — fail 이 warn 보다 앞', () => {
  const signals = [
    { key: 'cpuUtil', label: 'CPU', unit: '%', value: 80, level: 'warn', warn: 75, fail: 90 },
    { key: 'hikariPending', label: '풀 대기', unit: '개', value: 20, level: 'fail', warn: 1, fail: 5 },
  ];
  const t = text(sectionTrust(rec(signals, 'SATURATED')));
  assert.ok(t.indexOf('풀 대기') < t.indexOf('CPU'), 'fail 신호가 warn 뒤에 나왔다');
});

test('SATURATED 면 p95 를 앱 지연으로 인용하지 말라고 못박는다', () => {
  const signals = [{ key: 'hikariPending', label: '풀 대기', unit: '개', value: 20, level: 'fail', warn: 1, fail: 5 }];
  assert.match(text(sectionTrust(rec(signals, 'SATURATED'))), /앱 지연으로 인용하면 안 된다/);
});

test('NEAR_LIMIT 은 아직 쓸 수 있다고 말한다 — 과잉 경고로 신호를 죽이지 않는다', () => {
  const signals = [{ key: 'cpuUtil', label: 'CPU', unit: '%', value: 80, level: 'warn', warn: 75, fail: 90 }];
  assert.match(text(sectionTrust(rec(signals, 'NEAR_LIMIT'))), /아직 판정에 쓸 수 있지만/);
});

test('신호가 없는 옛 실행은 "판정 없음"을 명시한다 — 빈 자리를 정상으로 읽히게 두지 않는다', () => {
  assert.match(text(sectionTrust(rec([], null))), /포화 판정 없음 — 어느 자원도 확인되지 않았다/);
});

test('unit 이 없는 옛 run.json 도 단위를 붙여 그린다', () => {
  // 재렌더 대상에는 unit 필드가 생기기 전의 기록이 섞여 있다. 키로 보정하지 않으면
  // "40.67" 이 퍼센트인지 개수인지 모르는 채로 화면에 나간다.
  const signals = [
    { key: 'hikariPending', label: '풀 대기', value: 0, level: 'ok', warn: 1, fail: 5 },
    { key: 'cpuUtil', label: 'CPU', value: 40.67, level: 'ok', warn: 75, fail: 90 },
  ];
  assert.match(text(sectionTrust(rec(signals, 'HEADROOM'))), /CPU 40\.67% \/ 임계 75%/);
});
