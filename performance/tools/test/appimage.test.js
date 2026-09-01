'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const appimage = require('../lib/appimage');
const cmp = require('../lib/comparability');

/**
 * 이 파일이 지키는 계약은 **"무엇을 쟀는지 모르면 모른다고 말한다"** 이다.
 *
 * 배경(T-42): 실행 기록의 `commit` 은 실행 시점 작업 트리의 HEAD 일 뿐 컨테이너 안에서
 * 도는 바이너리가 아니다. 8/14 이미지를 두 주 내내 재면서 기록에는 그때그때의 HEAD 를
 * 남기고 있었고, 비교 판정에도 앱 바이너리 축이 없어 그 사실이 어디에도 안 드러났다.
 */

test('빌드 입력 목록에 성능 도구와 문서가 들어가지 않는다', () => {
  // 이미지에 안 들어가는 경로를 넣으면, 도구를 고칠 때마다 "이미지가 낡았다" 경고가 떠서
  // 경고 자체가 무의미해진다. 경고는 드물어야 읽힌다.
  for (const p of appimage.BUILD_INPUTS) {
    assert.equal(/^performance|^localDocs|^docs/.test(p), false, `${p} 는 이미지 내용이 아니다`);
  }
  assert.ok(appimage.BUILD_INPUTS.includes('src/main'), '앱 소스는 반드시 포함돼야 한다');
  assert.ok(appimage.BUILD_INPUTS.includes('Dockerfile'));
});

// ── 비교 조건 축 ──────────────────────────────────────────────────────────

/** run 레코드 껍데기. conditionsOf() 가 읽는 경로만 채운다. */
function runWith(appImage) {
  return {
    run: {
      scenario: 'normal-day', environment: 'perf', dataset: 'medium',
      datasetGuard: 'off', loadProfile: { s: { executor: 'x' } }, loadgen: 'docker',
      remoteWrite: true, scriptVersion: 'abc',
      phasePlan: { mode: 'steady-state', warmupSec: 180, measureSec: 300, rampdownSec: 120, gatePhase: 'measure' },
      appImage,
    },
  };
}

const IMG_A = { available: true, imageId: 'sha256:aaaa000000000000' };
const IMG_B = { available: true, imageId: 'sha256:bbbb111111111111' };

test('이미지가 다르면 비교를 낮추되 막지는 않는다', () => {
  const a = cmp.conditionsOf(runWith(IMG_A));
  const b = cmp.conditionsOf(runWith(IMG_B));
  const r = cmp.compare(a, b);

  assert.equal(r.comparable, true, 'blocking 이면 재빌드마다 추세선이 끊긴다 — 그건 이력의 쓸모를 없앤다');
  assert.equal(r.level, 'degraded');
  assert.ok(r.mismatches.some((m) => m.key === 'appImage'), '이미지 차이가 리포트에 드러나야 한다');
});

test('같은 이미지면 이 축은 불일치로 잡히지 않는다', () => {
  const r = cmp.compare(cmp.conditionsOf(runWith(IMG_A)), cmp.conditionsOf(runWith(IMG_A)));
  assert.equal(r.level, 'exact');
});

test('한쪽이라도 미기록이면 이 축으로는 판정하지 않는다', () => {
  // 기본값을 소급 적용하면 서로 다른 바이너리를 잰 과거 실행들이 조용히 같은 것으로 묶인다.
  // loadgen·remoteWrite 와 달리 여기서는 "기능이 없었으니 이랬다"가 사실이 아니다.
  const known = cmp.conditionsOf(runWith(IMG_A));
  const unknown = cmp.conditionsOf(runWith(null));
  const r = cmp.compare(known, unknown);
  assert.equal(r.mismatches.some((m) => m.key === 'appImage'), false);
  assert.equal(r.level, 'exact', '판정 불가일 뿐 다른 축은 그대로 비교된다');
});

test('이미지 축은 계열 해시에 들어가지 않는다', () => {
  // 들어가면 재빌드마다 seriesHash 가 갈려 기존 기준선 계열 전체가 통째로 비교 불가가 된다.
  assert.equal(
    cmp.seriesHash(cmp.conditionsOf(runWith(IMG_A))),
    cmp.seriesHash(cmp.conditionsOf(runWith(IMG_B))),
  );
});

test('조회 실패는 실행을 죽이지 않고 사유를 남긴다', () => {
  // 실제 docker 를 부르지 않고 컨테이너 이름만 없는 값으로 바꿔 확인한다.
  const prev = process.env.PERF_APP_CONTAINER;
  process.env.PERF_APP_CONTAINER = 'no-such-container-for-test';
  try {
    // require 캐시 때문에 CONTAINER 는 이미 고정돼 있다. 대신 describe() 가 실패 결과를
    // 사람이 읽을 수 있게 말하는지만 확인한다 — 그게 이 모듈이 실행 경로에서 하는 일이다.
    const line = appimage.describe({ available: false, reason: 'no such object' });
    assert.match(line, /확인 실패/);
    assert.match(line, /무엇을 쟀는지/, '실패를 조용히 넘기면 T-42 가 그대로 반복된다');
  } finally {
    if (prev === undefined) delete process.env.PERF_APP_CONTAINER;
    else process.env.PERF_APP_CONTAINER = prev;
  }
});

test('이미지가 소스보다 낡으면 재빌드 명령까지 말한다', () => {
  const line = appimage.describe({
    available: true, imageId: 'sha256:deadbeefcafe0000', imageRef: 'environment-app',
    imageCreated: '2026-08-14T04:41:57Z', stale: true, staleBySec: 14 * 86400,
  });
  assert.match(line, /소스가 이미지보다 14\.0일 새것/);
  assert.match(line, /--build app/, '무엇을 해야 하는지 없이 경고만 하면 아무도 조치하지 않는다');
});
