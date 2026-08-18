import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLAN_POLICY, normalizePlan, modeAllowed } from '../marketing-plan-runtime.js';

test('Marketing AI plan ladder matches EKODI product policy', () => {
  assert.deepEqual(PLAN_POLICY.free.freeMonthly, { caption:1, post:1, shorts:1 });
  assert.equal(PLAN_POLICY.free.connectedChannels, 0);
  assert.equal(PLAN_POLICY.flex.connectedChannels, 1);
  assert.equal(PLAN_POLICY.flex.metered, true);
  assert.equal(PLAN_POLICY.plus.connectedChannels, 3);
  assert.equal(PLAN_POLICY.plus.scheduledPublish, true);
  assert.equal(PLAN_POLICY.pro.connectedChannels, 5);
  assert.equal(PLAN_POLICY.pro.recurringAutomation, true);
  assert.equal(PLAN_POLICY.pro.performanceAnalysis, true);
  assert.equal(PLAN_POLICY.auto.connectedChannels, 10);
  assert.equal(PLAN_POLICY.auto.alwaysOnAutomation, true);
});

test('automation modes are enforced by plan rather than the browser UI', () => {
  assert.equal(modeAllowed(PLAN_POLICY.free, 'once'), false);
  assert.equal(modeAllowed(PLAN_POLICY.flex, 'once'), true);
  assert.equal(modeAllowed(PLAN_POLICY.flex, 'scheduled'), false);
  assert.equal(modeAllowed(PLAN_POLICY.plus, 'scheduled'), true);
  assert.equal(modeAllowed(PLAN_POLICY.plus, 'recurring'), false);
  assert.equal(modeAllowed(PLAN_POLICY.pro, 'recurring'), true);
  assert.equal(modeAllowed(PLAN_POLICY.pro, 'always_on'), false);
  assert.equal(modeAllowed(PLAN_POLICY.auto, 'always_on'), true);
});

test('legacy workspace plans are downgraded safely into the new ladder', () => {
  assert.equal(normalizePlan('standard'), 'free');
  assert.equal(normalizePlan('basic'), 'flex');
  assert.equal(normalizePlan('enterprise'), 'auto');
  assert.equal(normalizePlan('plus'), 'plus');
});

test('runtime persists quota and execution state instead of trusting localStorage', () => {
  const source = fs.readFileSync(new URL('../marketing-plan-runtime.js', import.meta.url), 'utf8');
  assert.match(source, /marketing_usage_monthly/);
  assert.match(source, /FREE_MONTHLY_LIMIT/);
  assert.match(source, /service_subscriptions/);
  assert.match(source, /current_site_workspaces|\/workspaces\?site=marketing/);
  assert.match(source, /marketing_channel_connections/);
  assert.match(source, /marketing_automation_jobs/);
  assert.match(source, /provider_pending/);
  assert.doesNotMatch(source, /localStorage/);
});
