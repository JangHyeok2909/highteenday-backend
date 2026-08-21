'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const hostprobe = require('../lib/hostprobe');

// T-37: 호스트 프로브 요약이 measure 구간과 다른 창을 재던 결함의 회귀 테스트.
// 이 결함으로 실제로 틀린 인과 결론을 냈다가 철회했다(perf-session-drift.md 8-e).

const PLAN = { measureStartOffsetSec: 180, measureEndOffsetSec: 480 };
const T0 = '2026-08-20T00:00:00.000Z';
const at = (sec) => ({ iso: new Date(Date.parse(T0) + sec * 1000).toISOString(), v: [sec] });

test('measure 구간만 정확히 잘라낸다', () => {
  const rows = [0, 60, 179, 180, 300, 479, 480, 600].map(at);
  const s = hostprobe.sliceByPhase(rows, PLAN, T0);
  assert.deepEqual(s.warmup.map((r) => r.v[0]), [0, 60, 179]);
  assert.deepEqual(s.measure.map((r) => r.v[0]), [180, 300, 479]);
  assert.deepEqual(s.rampdown.map((r) => r.v[0]), [480, 600]);
});

test('경계 표본은 measure 시작에 포함되고 종료에서 제외된다', () => {
  const s = hostprobe.sliceByPhase([at(180), at(480)], PLAN, T0);
  assert.equal(s.measure.length, 1);
  assert.equal(s.measure[0].v[0], 180);
  assert.equal(s.rampdown[0].v[0], 480);
});

test('warmup 에서 돈 부하가 measure 요약에 섞이지 않는다', () => {
  // loadbench 는 warmup +60초에 40초간 2코어를 태운다. 그 구간 값만 100 으로 둔다.
  const rows = [];
  for (let t = 0; t < 600; t += 10) rows.push({ iso: at(t).iso, v: [t >= 60 && t < 100 ? 100 : 5] });
  const s = hostprobe.sliceByPhase(rows, PLAN, T0);
  const idx = { cpuPct: 0, percore: { coreCpu: [], corePerf: [] } };
  const warm = hostprobe.summarize(s.warmup, idx);
  const meas = hostprobe.summarize(s.measure, idx);
  assert.equal(warm.cpuPct.max, 100, 'warmup 요약에는 벤치 부하가 잡혀야 한다');
  assert.equal(meas.cpuPct.max, 5, 'measure 요약에는 벤치 부하가 섞이면 안 된다');
});

test('phasePlan 이나 기준 시각이 없으면 자르지 않는다', () => {
  assert.equal(hostprobe.sliceByPhase([at(0)], null, T0), null);
  assert.equal(hostprobe.sliceByPhase([at(0)], PLAN, null), null);
  assert.equal(hostprobe.sliceByPhase([], PLAN, T0), null);
});

// 칼럼 매핑 — 와일드카드로 펼쳐진 코어별 칼럼과 _Total 을 구분해야 한다.

test('typeperf 헤더에서 _Total 과 코어별 칼럼을 구분한다', () => {
  const header = [
    '\\\\PC\\Processor Information(_Total)\\% Processor Time',
    '\\\\PC\\Processor Information(0,0)\\% Processor Time',
    '\\\\PC\\Processor Information(0,1)\\% Processor Time',
    '\\\\PC\\Processor Information(_Total)\\% Processor Performance',
    '\\\\PC\\System\\Processor Queue Length',
    '\\\\PC\\Memory\\Available MBytes',
    '\\\\PC\\Process(vmmemWSL)\\% Processor Time',
  ];
  const idx = hostprobe.indexColumns(header);
  assert.equal(idx.cpuPct, 0);
  assert.equal(idx.freqPct, 3);
  assert.equal(idx.queueLen, 4);
  assert.equal(idx.availMB, 5);
  assert.equal(idx.vmmemPct, 6);
  assert.deepEqual(idx.percore.coreCpu.map((c) => c.inst), ['0,0', '0,1']);
});

test('바쁜 코어 수를 코어별 계열에서 파생한다', () => {
  const idx = { cpuPct: 0, percore: { coreCpu: [{ i: 1, inst: '0,0' }, { i: 2, inst: '0,1' }], corePerf: [] } };
  const rows = [{ v: [50, 90, 10] }, { v: [50, 95, 80] }];
  const out = hostprobe.summarize(rows, idx);
  assert.equal(out.coresBusy.min, 1); // 첫 표본: 90 만 50 이상
  assert.equal(out.coresBusy.max, 2); // 둘째 표본: 95, 80 둘 다
  assert.equal(out.topCores[0].inst, '0,0');
});

test('일부 칼럼이 비어도 나머지 코어 값을 잃지 않는다', () => {
  const idx = { cpuPct: 0, percore: { coreCpu: [], corePerf: [] } };
  const out = hostprobe.summarize([{ v: [10] }, { v: [null] }, { v: [30] }], idx);
  assert.equal(out.cpuPct.samples, 2);
  assert.equal(out.cpuPct.avg, 20);
});

// 와일드카드 확장 개수가 흔들려 헤더와 행의 칼럼 수가 어긋나던 실제 결함의 회귀 테스트.
// 예전에는 그 경우 모든 행을 버려 표본 0개가 됐다 — 프로브가 통째로 실패한 것처럼 보였다.

test('헤더와 행 길이가 어긋나면 위치 기반으로 폴백한다', () => {
  const header = ['a', 'b', 'c']; // 3칸인데 행은 8칸
  const idx = hostprobe.resolveIndex(header, 8);
  assert.equal(idx.positional, true);
  assert.equal(idx.cpuPct, 0);
  assert.equal(idx.freqPct, 1);
  assert.equal(idx.queueLen, 2);
  assert.equal(idx.availMB, 3);
  assert.equal(idx.vmmemPct, 4);
  assert.deepEqual(idx.percore.coreCpu, [], '코어별 매핑은 포기한다');
});

test('길이가 맞으면 헤더 기반 매핑을 쓴다', () => {
  const header = [
    '\\PC\Processor Information(_Total)\% Processor Time',
    '\\PC\Processor Information(0,0)\% Processor Time',
  ];
  const idx = hostprobe.resolveIndex(header, 2);
  assert.notEqual(idx.positional, true);
  assert.equal(idx.cpuPct, 0);
  assert.equal(idx.percore.coreCpu.length, 1);
});

test('폴백 상태에서도 고정 카운터는 정상 요약된다', () => {
  const idx = hostprobe.resolveIndex(['a'], 5);
  const rows = [{ v: [10, 100, 1, 4000, 8] }, { v: [30, 110, 3, 3000, 12] }];
  const out = hostprobe.summarize(rows, idx);
  assert.equal(out.cpuPct.avg, 20);
  assert.equal(out.vmmemPct.avg, 10);
  assert.equal(out.availMB.min, 3000);
});
