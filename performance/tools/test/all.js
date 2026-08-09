#!/usr/bin/env node
/**
 * 테스트 엔트리 — Node 16 은 `node --test` CLI 러너가 없어(18+) 파일을 직접 require 한다.
 * node:test 는 require 된 테스트를 한 프로세스에서 모아 실행하고, 실패 시 exit 1 로 끝난다.
 */
'use strict';

require('./regression.test.js');
require('./repository.test.js');
require('./summary-parsing.test.js');
