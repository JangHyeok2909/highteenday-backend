'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * 시나리오 파일 감사 — "시나리오가 자기 threshold를 얹을 때 measure 스코프를 거쳤는가".
 *
 * 왜 소스를 읽어서 검사하나: 시나리오 파일은 config.js를 통해 `k6/http` 등을 import하므로
 * plain Node가 로드할 수 없다(k6 런타임 전용 모듈). 값을 실행해서 볼 수 없으니 선언 형태를
 * 본다. 이 검사가 잡으려는 회귀는 "새 시나리오를 추가하면서 measureOnly()를 빼먹는 것"과
 * "abortOnFail 지연을 테스트 시작 기준 리터럴로 되돌리는 것" 두 가지다 — 둘 다 조용히
 * warmup 구간이 판정에 끼어드는 결과를 낳고, 실행해 보기 전에는 드러나지 않는다.
 */
const PERF_ROOT = path.join(__dirname, '..', '..');
const SCENARIO_DIR = path.join(PERF_ROOT, 'scenarios');
const SCRIPT_DIR = path.join(PERF_ROOT, 'scripts');

const read = (file) => fs.readFileSync(file, 'utf8');
const jsFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));

/** phase 태깅을 쓰는 시나리오 = PHASED_THRESHOLDS를 가져다 쓰는 파일. */
function phaseScenarios() {
  return jsFiles(SCENARIO_DIR).filter((f) => /PHASED_THRESHOLDS/.test(read(f)));
}

/** 진단 전용 시나리오 = phase 태깅을 켜지 않는 나머지(stress/spike/breakpoint/chaos/failover). */
function diagnosticScenarios() {
  return jsFiles(SCENARIO_DIR).filter((f) => !/PHASED_THRESHOLDS/.test(read(f)));
}

test('감사 대상이 실제로 존재한다 (파일 이동/이름 변경으로 검사가 비어 버리는 것 방지)', () => {
  const names = phaseScenarios().map((f) => path.basename(f, '.js')).sort();
  for (const expected of [
    'cache-warm', 'chat-heavy', 'cold-start', 'exam-week', 'normal-day', 'notification-heavy',
    'peak-hour', 'read-heavy', 'registration-day', 'soak', 'write-heavy',
  ]) {
    assert.ok(names.includes(expected), `${expected} 이 phase 시나리오 목록에서 빠졌다`);
  }
});

test('phase 시나리오의 커스텀 threshold는 전부 measureOnly()를 거친다', () => {
  for (const file of phaseScenarios()) {
    const src = read(file);
    const name = path.basename(file);
    // 형태는 둘 중 하나여야 한다:
    //   thresholds: PHASED_THRESHOLDS,                                  (커스텀 없음)
    //   thresholds: Object.assign({}, PHASED_THRESHOLDS, measureOnly({...}))
    const plain = /thresholds:\s*(Object\.assign\(\{\},\s*)?PHASED_THRESHOLDS\s*\)?,/.test(src);
    const scoped = /thresholds:\s*Object\.assign\(\{\},\s*PHASED_THRESHOLDS,\s*measureOnly\(/.test(src);
    assert.ok(plain || scoped,
      `${name}: 커스텀 threshold가 measureOnly()를 거치지 않는다 — warmup 구간이 판정에 낀다`);
  }
});

test('phase 시나리오에 measure 스코프를 벗어난 커스텀 threshold 키가 없다', () => {
  // Object.assign(..., PHASED_THRESHOLDS, <여기부터 끝까지>) 안에 measureOnly 밖의 키가
  // 있으면 그 키는 전체 구간을 평가한다.
  const KEY_LIKE = /^\s*(\[?['"`]?[a-zA-Z_][\w{}:.\-]*['"`]?\]?)\s*:/;
  for (const file of phaseScenarios()) {
    const src = read(file);
    const name = path.basename(file);
    // import 문에도 같은 식별자가 나오므로 thresholds 블록부터 잘라서 본다.
    const block = src.indexOf('thresholds:');
    const start = block < 0 ? -1 : src.indexOf('PHASED_THRESHOLDS,', block);
    if (start < 0) continue; // 커스텀 없음
    const tail = src.slice(start + 'PHASED_THRESHOLDS,'.length);
    const body = tail.slice(0, tail.indexOf('};')); // options 객체 끝까지
    const outside = body.split('measureOnly(')[0]; // measureOnly 호출 이전 구간
    for (const line of outside.split('\n')) {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
      assert.ok(!KEY_LIKE.test(line), `${name}: measureOnly() 밖에 threshold 키가 있다 → ${line.trim()}`);
    }
  }
});

test('phase 시나리오의 abortOnFail 지연은 measure 시작 기준으로 계산한다', () => {
  for (const file of phaseScenarios()) {
    const src = read(file);
    const name = path.basename(file);
    const delays = src.match(/delayAbortEval:\s*[^\n]+/g) || [];
    for (const d of delays) {
      assert.match(d, /abortDelayAfterMeasure\(PLAN,/,
        `${name}: ${d.trim()} — 리터럴 지연은 테스트 시작 기준이라 warmup 도중 평가된다`);
    }
  }
});

test('진단 전용 시나리오의 abort 정책은 손대지 않는다 (전체 구간 유지)', () => {
  const names = diagnosticScenarios().map((f) => path.basename(f, '.js')).sort();
  assert.deepEqual(names, ['breakpoint', 'chaos', 'failover', 'spike', 'stress']);
  for (const file of diagnosticScenarios()) {
    const src = read(file);
    const name = path.basename(file);
    assert.ok(!/measureOnly\(/.test(src), `${name}: 진단 시나리오는 measure 스코프를 쓰지 않는다`);
    assert.ok(!/abortDelayAfterMeasure\(/.test(src), `${name}: abort 지연 계산을 바꾸면 안 된다`);
  }
});

test('phase 시나리오는 phase_iterations Counter를 등록하는 workload.js를 가져다 쓴다', () => {
  // k6 실측: 등록되지 않은 메트릭에 threshold를 걸면 실행이 시작조차 못 하고 중단된다
  //   level=error msg="invalid threshold defined on phase_iterations{phase:measure};
  //                    reason: no metric name ... found"
  // PHASE_DIAGNOSTIC_THRESHOLDS가 phase_iterations 축을 선언하므로, 이 상수를 쓰는
  // 시나리오는 그 Counter를 만드는 모듈(scenarios/lib/workload.js)을 반드시 로드해야 한다.
  for (const file of phaseScenarios()) {
    const src = read(file);
    assert.match(src, /from '\.\/lib\/workload\.js'/,
      `${path.basename(file)}: workload.js를 import 하지 않으면 phase_iterations 축 때문에 실행이 중단된다`);
  }
});

test('단독 스크립트는 DEFAULT_THRESHOLDS로 전체 구간을 평가한다', () => {
  const scripts = jsFiles(SCRIPT_DIR); // scripts/lib 는 하위 디렉터리라 제외된다
  assert.ok(scripts.length >= 10, '단독 스크립트를 못 찾았다 — 경로가 바뀌었는지 확인할 것');
  for (const file of scripts) {
    const src = read(file);
    const name = path.basename(file);
    assert.ok(!/PHASED_THRESHOLDS/.test(src), `${name}: 단독 스크립트에는 phase 게이트를 쓰지 않는다`);
    assert.ok(!/measureOnly\(/.test(src), `${name}: 단독 스크립트는 전체 구간 판정을 유지한다`);
  }
});
