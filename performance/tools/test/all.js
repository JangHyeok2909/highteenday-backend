#!/usr/bin/env node
/**
 * 테스트 엔트리 — Node 16 은 `node --test` CLI 러너가 없어(18+) 파일을 직접 require 한다.
 * node:test 는 require 된 테스트를 한 프로세스에서 모아 실행하고, 실패 시 exit 1 로 끝난다.
 */
'use strict';

require('./comparability.test.js');
require('./regression.test.js');
require('./repository.test.js');
require('./summary-parsing.test.js');
require('./phases.test.js');
require('./collect-window.test.js');
require('./thresholds.test.js');
require('./scenario-thresholds.test.js');
require('./baseline-report.test.js');
require('./sampling.test.js');
require('./fingerprint.test.js');
require('./dataset-guard.test.js');
require('./sanitize-reports.test.js');
require('./repeatability.test.js');
require('./run-lock.test.js');
require('./loadbench.test.js');
require('./querystats.test.js');
require('./querycost.test.js');
require('./appimage.test.js');
require('./hostprobe-phase.test.js');
require('./saturation.test.js');
require('./trends.test.js');
require('./sparkline.test.js');
require('./render-only.test.js');
require('./report-table.test.js');
require('./trust-row.test.js');
require('./trend-links.test.js');
require('./stomp.test.js');
require('./seed-text.test.js');
require('./preflight.test.js');

// resilience/ — 장애 관측 실험기. 성능 회귀 판정과는 분리돼 있지만 배관(promql·catalog·collect)을
// 빌려 쓰므로 같은 테스트 진입점에서 함께 돈다.
require('../../resilience/test/plan.test.js');
require('../../resilience/test/report.test.js');
require('../../resilience/test/appconfig.test.js');
require('../../resilience/test/recovery.test.js');
require('../../resilience/test/integrity.test.js');
