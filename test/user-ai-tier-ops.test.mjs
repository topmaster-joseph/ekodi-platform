import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  USER_AI_PLAN_DEFAULTS,
  applyUserAiPlanOverrides,
  configuredMonthlyRequests,
  validateLimitChange,
} from '../user-ai-admin-control.js';
import { fundingPolicyForPlan } from '../user-ai-control.js';

test('User AI tier defaults preserve bounded FREE/FLEX sponsorship', async () => {
  assert.equal(USER_AI_PLAN_DEFAULTS.free, 20);
  assert.equal(USER_AI_PLAN_DEFAULTS.flex, 20);
  assert.equal(USER_AI_PLAN_DEFAULTS.basic, 25);
  assert.equal(USER_AI_PLAN_DEFAULTS.plus, 100);
  assert.equal(USER_AI_PLAN_DEFAULTS.pro, 500);
  assert.equal(USER_AI_PLAN_DEFAULTS.auto, 1500);
  assert.equal(configuredMonthlyRequests({}, 'free'), 20);
  assert.equal(configuredMonthlyRequests({}, 'flex'), 20);
  const runtime = await applyUserAiPlanOverrides({});
  assert.equal(runtime.USER_AI_FREE_MONTHLY_REQUESTS, '20');
  assert.equal(runtime.USER_AI_FLEX_MONTHLY_REQUESTS, '20');
  assert.equal(fundingPolicyForPlan('free', runtime).sponsoredRequests, 20);
  assert.equal(fundingPolicyForPlan('flex', runtime).sponsoredRequests, 20);
});

test('environment values remain the deployment baseline when no admin override exists', async () => {
  const env = { USER_AI_FREE_MONTHLY_REQUESTS:'24', USER_AI_PRO_MONTHLY_REQUESTS:'900' };
  assert.equal(configuredMonthlyRequests(env, 'free'), 24);
  assert.equal(configuredMonthlyRequests(env, 'pro'), 900);
  const runtime = await applyUserAiPlanOverrides(env);
  assert.equal(runtime.USER_AI_FREE_MONTHLY_REQUESTS, '24');
  assert.equal(runtime.USER_AI_PRO_MONTHLY_REQUESTS, '900');
  assert.equal(fundingPolicyForPlan('free', runtime).sponsoredRequests, 24);
  assert.equal(fundingPolicyForPlan('free', runtime).sponsoredEligible, true);
});

test('admin limit validation accepts zero as a safe pause and rejects invalid ranges', () => {
  assert.deepEqual(validateLimitChange({ planId:'free', monthlyRequests:0 }), { ok:true, planId:'free', monthlyRequests:0 });
  assert.equal(validateLimitChange({ planId:'unknown', monthlyRequests:20 }).code, 'USER_AI_PLAN_INVALID');
  assert.equal(validateLimitChange({ planId:'plus', monthlyRequests:-1 }).code, 'USER_AI_LIMIT_INVALID');
  assert.equal(validateLimitChange({ planId:'plus', monthlyRequests:100001 }).code, 'USER_AI_LIMIT_INVALID');
  assert.equal(validateLimitChange({ planId:'plus', monthlyRequests:1.5 }).code, 'USER_AI_LIMIT_INVALID');
});

test('D1 admin overrides are projected into the existing User AI gateway environment', async () => {
  const DB = {
    prepare(sql) {
      assert.match(sql, /user_ai_plan_limits/);
      return {
        async all() {
          return { results:[
            { plan_id:'free', monthly_requests:7 },
            { plan_id:'plus', monthly_requests:0 },
            { plan_id:'invalid', monthly_requests:999 },
          ] };
        },
      };
    },
  };
  const base = { DB, USER_AI_FREE_MONTHLY_REQUESTS:'20', USER_AI_PLUS_MONTHLY_REQUESTS:'100' };
  const runtime = await applyUserAiPlanOverrides(base);
  assert.notEqual(runtime, base);
  assert.equal(runtime.DB, DB);
  assert.equal(runtime.USER_AI_FREE_MONTHLY_REQUESTS, '7');
  assert.equal(runtime.USER_AI_PLUS_MONTHLY_REQUESTS, '0');
  assert.equal(fundingPolicyForPlan('free', runtime).sponsoredRequests, 7);
  assert.equal(fundingPolicyForPlan('plus', runtime).sponsoredEligible, false);
});

test('User AI operations panel stays inside the existing lazy AI Ops asset', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.match(build, /readFile\(`\$\{root\}user-ai-tier-panel\.js`/);
  assert.match(build, /writeFile\(`\$\{output\}ai-ops-admin\.js`/);
  assert.doesNotMatch(shell, /user-ai-tier-panel\.js/);
  assert.doesNotMatch(worker, /user-ai-tier-panel\.js/);
});