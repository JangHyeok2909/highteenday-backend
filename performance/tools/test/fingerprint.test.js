'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { scriptVersion, datasetFingerprint, TRAFFIC_SHAPING_FILES } = require('../perf-run');
const cmp = require('../lib/comparability');

/**
 * 실행 지문 검증 — "이 결과를 저 결과와 비교해도 되는가"의 근거가 되는 두 값이다.
 *
 * 이 검사가 잡으려는 회귀는 실행해 봐야만 드러나는 종류다. 지문이 잘못돼도 에러가 나지
 * 않고, 그냥 **비교하면 안 되는 두 실행이 조용히 비교될 뿐**이다. 그리고 그 결과는
 * "성능이 30% 나빠졌다" 같은 그럴듯한 숫자로 나온다.
 *
 * 실제로 있었던 일: `scripts/lib/sampling.js`의 인기 분포를 완전히 바꿨는데
 * `scenarios/normal-day.js` 파일은 한 글자도 안 바뀌어서 지문이 그대로였다. 진입 파일
 * 하나만 해싱했기 때문이다.
 */
const PERF_ROOT = path.join(__dirname, '..', '..');

test('TRAFFIC_SHAPING_FILES의 파일이 전부 실제로 존재한다', () => {
  // 목록을 손으로 관리하는 대가다. 파일을 옮기거나 이름을 바꾸면 여기서 걸린다.
  // 놓치면 지문이 `<missing>`으로 고정되어 변경을 감지하지 못한다.
  for (const rel of TRAFFIC_SHAPING_FILES) {
    assert.ok(
      fs.existsSync(path.join(PERF_ROOT, rel)),
      `${rel} 이 없다 — perf-run.js의 TRAFFIC_SHAPING_FILES 목록이 낡았다`,
    );
  }
});

test('부하 형태를 정하는 공용 모듈이 지문에 실제로 반영된다', () => {
  // 진입 파일을 그대로 둔 채 공용 모듈만 바꿔 본다. 지문이 변하지 않으면
  // "진입 파일만 해싱하던" 옛 동작으로 되돌아간 것이다.
  const entry = 'scenarios/normal-day.js';
  const before = scriptVersion(entry);

  const target = path.join(PERF_ROOT, TRAFFIC_SHAPING_FILES[0]);
  const original = fs.readFileSync(target);
  try {
    fs.writeFileSync(target, Buffer.concat([original, Buffer.from('\n// fingerprint probe\n')]));
    const after = scriptVersion(entry);
    assert.notEqual(after, before, `${TRAFFIC_SHAPING_FILES[0]} 를 바꿨는데 지문이 그대로다`);
  } finally {
    fs.writeFileSync(target, original);
  }

  assert.equal(scriptVersion(entry), before, '원복 후에는 지문이 되돌아와야 한다');
});

test('진입 스크립트가 다르면 지문도 다르다', () => {
  assert.notEqual(
    scriptVersion('scenarios/normal-day.js'),
    scriptVersion('scenarios/read-heavy.js'),
  );
});

test('진입 스크립트를 못 읽으면 unknown — 판정하지 않는다는 계약을 지킨다', () => {
  // conditions.js 의 scriptVersion 조건은 isUnknown() 으로 'unknown' 을 걸러 비교에서
  // 제외한다. 여기서 임의의 해시를 돌려주면 "지문이 다르다"는 거짓 경고가 상시 뜬다.
  assert.equal(scriptVersion('scenarios/does-not-exist.js'), 'unknown');
});

// ---------------------------------------------------------------------------
// 데이터셋 지문 — 프로파일 이름이 같아도 생성 규칙이 바뀌면 다른 값이어야 한다.
// ---------------------------------------------------------------------------

test('datasetFingerprint: meta.json이 없으면 null (이 변경 이전에 만든 데이터셋)', () => {
  assert.equal(datasetFingerprint('존재하지-않는-프로파일'), null);
  assert.equal(datasetFingerprint(null), null);
});

// ---------------------------------------------------------------------------
// 실제 판정에 미치는 효과 — 지문이 값으로만 남고 비교에 쓰이지 않으면 의미가 없다.
// ---------------------------------------------------------------------------

/** 비교 조건이 갖춰진 최소 run 레코드. */
function run(over = {}) {
  return {
    run: {
      scenario: 'normal-day',
      environment: 'perf',
      dataset: 'large',
      loadProfile: { s: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 200 }] } },
      scriptVersion: 'sha256:aaaaaaaaaaaa',
      phasePlan: { mode: 'steady', warmupSec: 300, measureSec: 1200, rampdownSec: 60, gatePhase: 'measure' },
      ...over,
    },
  };
}

test('데이터셋 지문이 다르면 blocking — 상대 비교를 생략한다', () => {
  const current = cmp.conditionsOf(run({ datasetFingerprint: 'sha256:new000000000' }));
  const baseline = cmp.conditionsOf(run({ datasetFingerprint: 'sha256:old000000000' }));

  const res = cmp.compare(current, baseline);
  assert.equal(res.comparable, false, '시드를 재생성했으면 옛 실행은 기준선이 될 수 없다');
  assert.equal(res.level, 'incomparable');
  const m = res.mismatches.find((x) => x.key === 'dataset');
  assert.ok(m, '데이터셋 불일치가 사유 목록에 있어야 한다');
  assert.equal(m.materiality, 'blocking');
  // 사람이 읽을 수 있어야 한다 — "해시가 다릅니다"로는 무엇을 해야 할지 알 수 없다.
  assert.match(m.desc, /large/);
});

test('지문 없는 과거 실행과 지문 있는 실행은 비교되지 않는다 (전환 시점)', () => {
  const current = cmp.conditionsOf(run({ datasetFingerprint: 'sha256:new000000000' }));
  const legacy = cmp.conditionsOf(run()); // datasetFingerprint 없음

  const res = cmp.compare(current, legacy);
  assert.equal(res.comparable, false);
  const m = res.mismatches.find((x) => x.key === 'dataset');
  assert.match(m.desc, /지문 없음/, '지문이 없다는 사실이 리포트 문장에 드러나야 한다');
});

test('같은 지문끼리는 정상 비교된다 (재시드해도 규칙·규모가 같으면 계속 비교 가능)', () => {
  const a = cmp.conditionsOf(run({ datasetFingerprint: 'sha256:same00000000' }));
  const b = cmp.conditionsOf(run({ datasetFingerprint: 'sha256:same00000000' }));
  const res = cmp.compare(a, b);
  assert.equal(res.comparable, true);
  assert.equal(res.level, 'exact');
});

test('스크립트 지문만 다르면 degraded — 기준선은 유지하고 경고만 띄운다', () => {
  // A(지문 범위 확대)를 넣어도 이 등급은 그대로여야 한다. blocking 으로 올리면
  // 부하 모듈을 손볼 때마다 이력이 끊겨 추세 분석이 상시 리셋된다.
  const current = cmp.conditionsOf(run({
    datasetFingerprint: 'sha256:same00000000', scriptVersion: 'sha256:bbbbbbbbbbbb',
  }));
  const baseline = cmp.conditionsOf(run({
    datasetFingerprint: 'sha256:same00000000', scriptVersion: 'sha256:aaaaaaaaaaaa',
  }));

  const res = cmp.compare(current, baseline);
  assert.equal(res.comparable, true, 'degrading 조건은 기준선 자격을 박탈하지 않는다');
  assert.equal(res.level, 'degraded');
});

test('데이터셋과 스크립트가 모두 바뀌면 blocking이 이기고 사유는 둘 다 남는다', () => {
  // A+B를 동시에 적용한 첫 실행의 모습이다. 판정은 B가 지배하지만, 나중에 이 실행을
  // 다시 볼 때 무엇이 바뀐 시점인지 재구성하려면 두 사유가 모두 기록돼 있어야 한다.
  const current = cmp.conditionsOf(run({
    datasetFingerprint: 'sha256:new000000000', scriptVersion: 'sha256:bbbbbbbbbbbb',
  }));
  const baseline = cmp.conditionsOf(run({ scriptVersion: 'sha256:aaaaaaaaaaaa' }));

  const res = cmp.compare(current, baseline);
  assert.equal(res.level, 'incomparable', 'blocking 하나라도 있으면 incomparable 이다');
  const keys = res.mismatches.map((m) => m.key).sort();
  assert.deepEqual(keys, ['dataset', 'scriptVersion']);
});

test('계열 해시가 데이터셋 지문에 반응한다 — 추세 그래프가 갈라져야 한다', () => {
  // seriesHash 는 blocking 조건만 넣는다. 지문이 여기 반영되지 않으면 옛 데이터로 잰
  // 점과 새 데이터로 잰 점이 한 선에 이어져, 데이터셋 교체 시점이 성능 급락으로 보인다.
  const a = cmp.seriesHash(cmp.conditionsOf(run({ datasetFingerprint: 'sha256:old000000000' })));
  const b = cmp.seriesHash(cmp.conditionsOf(run({ datasetFingerprint: 'sha256:new000000000' })));
  assert.notEqual(a, b);
});

test('스크립트 지문은 계열 해시를 가르지 않는다 (degrading이므로)', () => {
  const a = cmp.seriesHash(cmp.conditionsOf(run({ scriptVersion: 'sha256:aaaaaaaaaaaa' })));
  const b = cmp.seriesHash(cmp.conditionsOf(run({ scriptVersion: 'sha256:bbbbbbbbbbbb' })));
  assert.equal(a, b, '주석 한 줄 고칠 때마다 추세가 리셋되면 안 된다');
});
