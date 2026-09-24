'use strict';

/**
 * 멱등 실험의 액션 목록이 두 곳에 있다. 부하를 만드는 쪽(k6 ESM, scenarios/lib/)과 판정하는
 * 쪽(Node, lib/invariants.js 의 IDEMPOTENCY_ACTIONS)이다. 한쪽만 고치면 오류 없이 그 액션이
 * 판정에서 빠지거나 "카운터가 없다" 로만 남는다. 이 테스트가 두 목록을 대조한다.
 *
 * k6 모듈은 `k6/http` 를 import 해서 Node 가 불러올 수 없다. 그래서 파일을 텍스트로 읽어
 * `export const key = '...'` 와 `export const kind = '...'` 를 뽑는다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDEMPOTENCY_ACTIONS } = require('../lib/invariants');

const LIB = path.join(__dirname, '..', 'scenarios', 'lib');
const REGISTRY = path.join(LIB, 'idempotency-actions.js');

/** 액션 모듈 하나에서 key·kind 를 뽑는다. 액션 모듈이 아니면 null. */
function readAction(file) {
  const src = fs.readFileSync(path.join(LIB, file), 'utf8');
  const key = /export const key = '([a-z_]+)'/.exec(src);
  const kind = /export const kind = '([a-z]+)'/.exec(src);
  return key ? { file, key: key[1], kind: kind ? kind[1] : null } : null;
}

/** 등록 목록 파일이 import 하는 모듈 파일명. */
function registered() {
  const src = fs.readFileSync(REGISTRY, 'utf8');
  return [...src.matchAll(/from '\.\/([a-z-]+\.js)'/g)].map((m) => m[1]);
}

const modules = fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).map(readAction).filter(Boolean);

test('액션 모듈은 전부 등록 목록에 들어 있다 — 만들고 안 끼운 모듈이 없다', () => {
  const reg = new Set(registered());
  const missing = modules.filter((m) => !reg.has(m.file)).map((m) => m.file);
  assert.deepEqual(missing, [], `등록 안 된 액션 모듈: ${missing.join(', ')}`);
});

test('부하 쪽 액션과 판정 쪽 액션이 같다', () => {
  const reg = new Set(registered());
  const load = modules.filter((m) => reg.has(m.file)).map((m) => m.key).sort();
  const judge = IDEMPOTENCY_ACTIONS.map((a) => a.action).sort();
  assert.deepEqual(load, judge);
});

test('액션 종류가 양쪽에서 같다 — 다르면 판정식의 방향이 뒤집힌다', () => {
  const byAction = Object.fromEntries(IDEMPOTENCY_ACTIONS.map((a) => [a.action, a.kind]));
  for (const m of modules) {
    assert.equal(m.kind, byAction[m.key], `${m.file}: 모듈은 ${m.kind}, 카탈로그는 ${byAction[m.key]}`);
  }
});

test('액션 키는 서로 겹치지 않는다 — 겹치면 두 액션의 카운터가 한 칸에 섞인다', () => {
  const keys = modules.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});
