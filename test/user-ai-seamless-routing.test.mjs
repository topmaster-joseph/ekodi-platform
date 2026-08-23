import test from 'node:test';
import assert from 'node:assert/strict';

import { AI_ACCESS_POLICY, resolveAiAccessRoute } from '../ai-access-orchestration.js';
import { fundingPolicyForPlan } from '../user-ai-control.js';

test('FREE can receive a bounded EKODI-sponsored allowance when configured', () => {
  const policy = fundingPolicyForPlan('free', { USER_AI_FREE_MONTHLY_REQUESTS: '20' });
  assert.equal(policy.planId, 'free');
  assert.equal(policy.sponsoredRequests, 20);
  assert.equal(policy.sponsoredEligible, true);
});

test('automatic user routing is seamless when no personal API is connected', () => {
  const decision = resolveAiAccessRoute({
    mode: 'auto',
    intent: 'interactive',
    surface: 'user',
    aiRequired: true,
    hasPersonalApi: false,
    personalApiAllowed: true,
    personalWebAvailable: true,
    sponsoredAvailable: true,
    sponsoredRemaining: 20,
  });
  assert.equal(decision.route, 'ekodi-sponsored');
  assert.equal(decision.reason, 'membership-supported-seamless');
});

test('personal API stays preferred and AI can still be disabled explicitly', () => {
  const personal = resolveAiAccessRoute({
    mode: 'auto', intent: 'interactive', surface: 'user', aiRequired: true,
    hasPersonalApi: true, personalApiAllowed: true,
    personalWebAvailable: true, sponsoredAvailable: true, sponsoredRemaining: 20,
  });
  assert.equal(personal.route, 'personal-api');

  const off = resolveAiAccessRoute({
    mode: 'off', intent: 'interactive', surface: 'user', aiRequired: true,
    hasPersonalApi: true, personalApiAllowed: true,
    sponsoredAvailable: true, sponsoredRemaining: 20,
  });
  assert.equal(off.route, 'core-only');
  assert.equal(AI_ACCESS_POLICY.principles.boundedEkodiSponsorshipForFree, true);
});
