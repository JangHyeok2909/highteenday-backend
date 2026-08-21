'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stats, resultExitCode } = require('../repeatability');

test('repeatability stats keeps one sample as unmeasured variance', () => {
  const value = stats([123]);
  assert.equal(value.n, 1);
  assert.equal(value.mean, 123);
  assert.equal(value.sd, null);
  assert.equal(value.cvPct, null);
});

test('repeatability stats calculates sample deviation with two or more samples', () => {
  const value = stats([100, 110]);
  assert.equal(value.n, 2);
  assert.ok(value.sd > 0);
  assert.ok(value.cvPct > 0);
});

test('repeatability returns failure unless every requested run is valid', () => {
  assert.equal(resultExitCode(5, 5), 0);
  assert.equal(resultExitCode(4, 5), 2);
  assert.equal(resultExitCode(0, 5), 2);
});
