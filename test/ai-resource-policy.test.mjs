import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_RESOURCE_POLICY,
  normalizeAiResourcePolicy,
  rankAiResourceCandidates,
  scoreAiResourceCandidate,
} from '../ai-resource-policy.js';

test('personal-first resource order remains fixed while funding is free-first', () => {
  const policy = normalizeAiResourcePolicy({
    strategy:'ekodi-first',
    interactiveOrder:['ekodi-shared-api','personal-api'],
    autonomousOrder:['ekodi-shared-api','core-only'],
    funding:{ automaticPaidBudgetKrw:999999, paidApiAutoEscalation:true },
  });
  assert.equal(policy.strategy, 'personal-first');
  assert.deepEqual(policy.interactiveOrder, ['personal-subscription','personal-api','ekodi-shared-api','hosted-ai','core-only']);
  assert.deepEqual(policy.autonomousOrder, ['personal-api','ekodi-shared-api','hosted-ai','core-only']);
  assert.equal(policy.funding.principle, 'free-first-never-free-only');
  assert.equal(policy.funding.automaticPaidBudgetKrw, 0);
  assert.equal(policy.funding.paidApiAutoEscalation, false);
});

test('consumer subscription is blocked for unattended execution unless an official automation path exists', () => {
  const blocked = scoreAiResourceCandidate({ id:'chatgpt-web', resourceClass:'personal-subscription', available:true }, { lane:'autonomous' });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.blockedBy, 'subscription_not_automation_eligible');
  const allowed = scoreAiResourceCandidate({ id:'codex', resourceClass:'personal-subscription', available:true, automationAllowed:true }, { lane:'autonomous' });
  assert.equal(allowed.eligible, true);
});

test('paid or unclassified AI is blocked unless explicit delegated budget exists', () => {
  const paid={id:'openai',resourceClass:'personal-api',available:true,costClass:'paid-opt-in'};
  const blocked=scoreAiResourceCandidate(paid,{lane:'autonomous'});
  assert.equal(blocked.eligible,false);
  assert.equal(blocked.blockedBy,'paid_or_unclassified_cost_requires_explicit_budget');
  const allowed=scoreAiResourceCandidate(paid,{lane:'autonomous',paidCommitment:true,explicitDelegatedBudget:true});
  assert.equal(allowed.eligible,true);
});

test('exhausted free quota falls out before any paid escalation', () => {
  const result=scoreAiResourceCandidate({id:'gemini',resourceClass:'personal-api',available:true,costClass:'free-preferred',freeQuotaRemaining:0},{lane:'autonomous'});
  assert.equal(result.eligible,false);
  assert.equal(result.blockedBy,'free_quota_exhausted');
  assert.deepEqual(DEFAULT_AI_RESOURCE_POLICY.funding.freeExhaustedFallback,['alternate-zero-cost','core-only','retry-later']);
});

test('router scores only zero-cost candidates that pass hard gates', () => {
  const candidates = [
    { id:'slow', resourceClass:'personal-api', available:true, costClass:'free-preferred' },
    { id:'fast', resourceClass:'personal-api', available:true, costClass:'google-free-quota' },
    { id:'blocked', resourceClass:'personal-api', available:true, costClass:'free-preferred', budgetAllowed:false },
  ];
  const ranked = rankAiResourceCandidates(candidates, { lane:'autonomous' }, DEFAULT_AI_RESOURCE_POLICY);
  assert.deepEqual(ranked.map(item => item.id), ['fast','slow']);
});

test('shared API and hosted AI remain off by default while Core is always available', () => {
  const policy = DEFAULT_AI_RESOURCE_POLICY;
  assert.equal(policy.pools.ekodiSharedApi.enabled, false);
  assert.equal(policy.pools.hostedAi.enabled, false);
  assert.equal(policy.pools.coreOnly.enabled, true);
  assert.equal(policy.funding.paidApiRequiresExplicitDelegatedBudget, true);
  assert.equal(policy.funding.automaticPaidBudgetKrw, 0);
  assert.equal(policy.core.productionVerificationRequired, true);
  assert.equal(policy.core.promotionMode, 'reviewed');
});
