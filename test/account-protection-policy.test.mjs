import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKERS_DAILY_REQUEST_BUDGET,
  evaluateAccountProtection,
  modeForUsagePercent
} from '../account-protection-policy.js';

test('uses the Workers Free daily request budget by default', () => {
  const state = evaluateAccountProtection({ requests: 50_000 });
  assert.equal(state.budget, DEFAULT_WORKERS_DAILY_REQUEST_BUDGET);
  assert.equal(state.percent, 50);
  assert.equal(state.mode, 'normal');
  assert.equal(state.actions.allowDevelopmentDeploy, true);
});

test('maps threshold boundaries to protection modes', () => {
  assert.equal(modeForUsagePercent(69.99), 'normal');
  assert.equal(modeForUsagePercent(70), 'attention');
  assert.equal(modeForUsagePercent(84.99), 'attention');
  assert.equal(modeForUsagePercent(85), 'saver');
  assert.equal(modeForUsagePercent(94.99), 'saver');
  assert.equal(modeForUsagePercent(95), 'protect');
  assert.equal(modeForUsagePercent(99.99), 'protect');
  assert.equal(modeForUsagePercent(100), 'survival');
  assert.equal(modeForUsagePercent(125), 'survival');
});

test('blocks development deploys from saver mode upward', () => {
  const saver = evaluateAccountProtection({ requests: 85_000, budget: 100_000 });
  const protect = evaluateAccountProtection({ requests: 96_000, budget: 100_000 });
  assert.equal(saver.actions.allowDevelopmentDeploy, false);
  assert.equal(saver.actions.deferNonEssential, true);
  assert.equal(protect.actions.essentialOnly, true);
});

test('supports a configurable request budget', () => {
  const state = evaluateAccountProtection({ requests: 170_000, budget: 200_000 });
  assert.equal(state.percent, 85);
  assert.equal(state.mode, 'saver');
  assert.equal(state.remaining, 30_000);
});

test('rejects a zero request budget', () => {
  assert.throws(() => evaluateAccountProtection({ budget: 0 }), RangeError);
});
