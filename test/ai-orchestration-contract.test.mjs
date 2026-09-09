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

test('external connectors stay connected where possible without bypassing provider auth', () => {
  const lifecycle = getOrchestrationContract().connectorLifecycle;
  assert.equal(lifecycle.preferExistingConnections, true);
  assert.equal(lifecycle.disconnectAfterTask, false);
  assert.equal(lifecycle.refreshBeforeExpiryWhereSupported, true);
  assert.equal(lifecycle.preserveIntentAcrossReauth, true);
  assert.equal(lifecycle.providerAuthControlsRemainAuthoritative, true);
  assert.equal(lifecycle.expiryBypassAllowed, false);
  assert.equal(lifecycle.shortLivedCredentialPersistenceAllowed, false);
  assert.equal(lifecycle.operaBrowserConnector, 'prefer_when_connected');
  assert.deepEqual(lifecycle.healthStates, ['connected', 'degraded', 'reauth_required', 'unavailable']);
  assert.ok(AI_MISSION_RUNTIME.observeAreas.includes('connector_health'));
  assert.ok(AI_MISSION_RUNTIME.nonNegotiables.includes('no_connector_auth_or_expiry_bypass'));
});

test('high impact or forbidden requests remain outside autonomous ownership', () => {
  assert.equal(mustOwnAndRouteRequest({ highImpact:true }), false);
  assert.equal(mustOwnAndRouteRequest({ forbidden:true }), false);
  assert.equal(AI_MISSION_RUNTIME.orchestrationContract.humanGateOnlyForHighImpact, true);
});
