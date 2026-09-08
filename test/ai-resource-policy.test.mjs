import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_RESOURCE_POLICY,
  normalizeAiResourcePolicy,
  rankAiResourceCandidates,
  scoreAiResourceCandidate,
} from '../ai-resource-policy.js';

test('personal-first resource order is constitutional and cannot be reordered by saved input', () => {
  const policy = normalizeAiResourcePolicy({
    strategy:'ekodi-first',
    interactiveOrder:['ekodi-shared-api','personal-api'],
    autonomousOrder:['ekodi-shared-api','core-only'],
  });
  assert.equal(policy.strategy, 'personal-first');
  assert.deepEqual(policy.interactiveOrder, ['personal-subscription','personal-api','ekodi-shared-api','hosted-ai','core-only']);
  assert.deepEqual(policy.autonomousOrder, ['personal-api','ekodi-shared-api','hosted-ai','core-only']);
});

test('consumer subscription is blocked for unattended execution unless an official automation path exists', () => {
  const blocked = scoreAiResourceCandidate({ id:'chatgpt-web', resourceClass:'personal-subscription', available:true }, { lane:'autonomous' });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.blockedBy, 'subscription_not_automation_eligible');
  const allowed = scoreAiResourceCandidate({ id:'codex', resourceClass:'personal-subscription', available:true, automationAllowed:true }, { lane:'autonomous' });
  assert.equal(allowed.eligible, true);
});
test('router scores only candidates that pass hard gates and keeps provider priority as a tie-breaker', () => {
  const candidates = [
    { id:'slow', resourceClass:'personal-api', priority:20, available:true },
    { id:'fast', resourceClass:'personal-api', priority:10, available:true },
    { id:'blocked', resourceClass:'personal-api', priority:1, available:true, budgetAllowed:false },
  ];
  const ranked = rankAiResourceCandidates(candidates, { lane:'autonomous' }, DEFAULT_AI_RESOURCE_POLICY);
  assert.deepEqual(ranked.map(item => item.id), ['fast','slow']);
});

test('shared API and hosted AI remain budget-gated off by default while Core is always available', () => {
  const policy = DEFAULT_AI_RESOURCE_POLICY;
  assert.equal(policy.pools.ekodiSharedApi.enabled, false);
  assert.equal(policy.pools.hostedAi.enabled, false);
  assert.equal(policy.pools.coreOnly.enabled, true);
  assert.equal(policy.core.productionVerificationRequired, true);
  assert.equal(policy.core.promotionMode, 'reviewed');
});
