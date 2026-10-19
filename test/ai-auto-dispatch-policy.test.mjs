import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildAiOrchestrationPlan, EKODI_AI_ORCHESTRATION } from '../ai-orchestrator-runtime.js';
import { AI_COST_POLICY, evaluateAiCostEligibility } from '../ai-cost-policy.js';
import { DEFAULT_AI_RESOURCE_POLICY } from '../ai-resource-policy.js';
import { AI_MISSION_RUNTIME } from '../ai-governance-runtime.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const json = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const policy = json('config/ai-auto-dispatch-policy.json');

test('automatic selection remains Core-first, no mandatory provider choice', () => {
  assert.equal(policy.policyId, 'EKODI-AUTO-DISPATCH-001');
  assert.equal(policy.status, 'enforced');
  assert.equal(policy.selection.mode, 'automatic');
  assert.equal(policy.selection.userProviderSelectionRequired, false);
  assert.equal(policy.selection.coreFirst, true);
  assert.equal(policy.selection.registeredCapabilitiesOnly, true);
  assert.equal(DEFAULT_AI_RESOURCE_POLICY.pools.coreOnly.enabled, true);
  assert.equal(DEFAULT_AI_RESOURCE_POLICY.strategy, 'personal-first');
});

test('paid API is never silently substituted after free resources fail', () => {
  const config = json('config/ai-cost-policy.json');
  assert.equal(policy.cost.automaticPaidBudgetKrw, 0);
  assert.equal(policy.cost.paidApiAutoEscalation, false);
  assert.equal(policy.cost.explicitDelegatedBudgetRequired, true);
  assert.equal(policy.cost.coreFallbackRequired, true);
  assert.equal(AI_COST_POLICY.automaticPaidBudgetKrw, 0);
  assert.equal(AI_COST_POLICY.paidApiAutoEscalation, false);
  assert.equal(config.consumerWebAutomationAllowed, false);
  const paid = { id: 'metered-model', costClass: 'metered-paid', available: true };
  assert.equal(evaluateAiCostEligibility(paid).eligible, false);
  assert.equal(evaluateAiCostEligibility(paid, {
    governance: { paidCommitment: true, explicitDelegatedBudget: true },
  }).eligible, true);
});

test('cross-review is selective by risk or complexity, and mandatory when triggered', () => {
  const providers = [
    { id: 'first', available: true, costClass: 'account-managed', capabilities: ['text'], invoke: async () => 'first' },
    { id: 'second', available: true, costClass: 'account-managed', capabilities: ['text'], invoke: async () => 'second' },
  ];
  assert.deepEqual(policy.review.riskLevels, ['high', 'critical']);
  assert.deepEqual(policy.review.complexityLevels, ['high', 'critical']);
  assert.equal(EKODI_AI_ORCHESTRATION.reviewPolicy, 'risk_or_high_complexity_fail_closed');
  assert.equal(buildAiOrchestrationPlan({ risk: 'normal', complexity: 'low' }, providers).mode, 'primary');
  assert.equal(buildAiOrchestrationPlan({ risk: 'high', complexity: 'low' }, providers).mode, 'review');
  assert.equal(buildAiOrchestrationPlan({ risk: 'low', complexity: 'high' }, providers).mode, 'review');
  assert.equal(buildAiOrchestrationPlan({ risk: 'high', collaboration: 'primary' }, providers).mode, 'review');
});

test('headless/cloud routes are favored and unattended local Opera is disabled', () => {
  const cloud = json('config/cloud-connection-policy.json');
  const mission = json('config/ai-mission-governance.json');
  assert.equal(policy.browser.strategy, cloud.strategy);
  assert.equal(cloud.defaults.operaBrowserConnectorEnabled, false);
  assert.equal(cloud.scope.operaBrowserConnectorRequired, false);
  assert.equal(cloud.priority.indexOf('cloud_browser') < cloud.priority.indexOf('opera_browser'), true);
  assert.equal(policy.browser.automaticLocalOpera, false);
  assert.equal(policy.browser.noConsumerWebAutomation, true);
  assert.equal(mission.connectorLifecycle.operaBrowserConnector, 'manual_explicit_only');
  assert.equal(AI_MISSION_RUNTIME.orchestrationContract.connectorLifecycle.operaBrowserConnector, 'manual_explicit_only');
});

test('existing guardrails and verified production evidence remain mandatory', () => {
  const contract = readFileSync(resolve(root, 'ORCHESTRATOR_PRODUCTION_CONTRACT.md'), 'utf8');
  assert.equal(policy.safety.preserveExistingApprovalSecurityDeploymentGates, true);
  assert.equal(policy.safety.privilegeEscalationRequiresHumanApproval, true);
  assert.equal(policy.safety.productionVerificationRequired, true);
  assert.equal(policy.safety.doNotClaimCompletionFromModelOutput, true);
  assert.match(contract, /Human Gate approval receipt/);
  assert.match(contract, /completion requires durable evidence/i);
});
