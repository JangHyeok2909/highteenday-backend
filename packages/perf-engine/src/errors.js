'use strict';

/**
 * 종료 코드. 판정 결과(PASS·WARN·FAIL)는 종료 코드에 반영하지 않는다.
 */
const EXIT = Object.freeze({
  OK: 0,
  /** 실행은 했지만 쓸 수 있는 결과를 만들지 못했다. */
  RUN_FAILED: 1,
  /** 입력이나 환경이 잘못돼 실행하지 않았다. 부하를 걸기 전에 검사한다. */
  USAGE: 2,
  INTERRUPTED: 130,
});

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = EXIT.USAGE;
  }
}

class RunError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunError';
    this.exitCode = EXIT.RUN_FAILED;
  }
}

module.exports = { EXIT, UsageError, RunError };
