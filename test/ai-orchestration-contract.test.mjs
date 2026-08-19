import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MISSION_RUNTIME, getOrchestrationContract, mustOwnAndRouteRequest } from '../ai-governance-runtime.js';

test('current conversation owns normal user requests', () => {
  const contract = getOrchestrationContract();
  assert.equal(contract.requestOwner, 'current_conversation_ai');
  assert.equal(contract.specialistRouting, 'internal');
  assert.equal(contract.requireUserToChooseSpecialist, false);
  assert.equal(contract.roleRefusalForDelegatedSolvableRequest, false);
  assert.equal(contract.safeActionDefault, 'observe_consult_act_verify_report');
  assert.equal(contract.missingExecutorBehavior, 'queue_and_disclose_without_false_completion');
  assert.equal(mustOwnAndRouteRequest(), true);
});

test('high impact or forbidden requests remain outside autonomous ownership', () => {
  assert.equal(mustOwnAndRouteRequest({ highImpact:true }), false);
  assert.equal(mustOwnAndRouteRequest({ forbidden:true }), false);
  assert.equal(AI_MISSION_RUNTIME.orchestrationContract.humanGateOnlyForHighImpact, true);
});
