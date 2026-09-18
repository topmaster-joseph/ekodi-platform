import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEkodianOperationSnapshot,
  getEkodian8GSummary,
  resolveEkodianGovernance,
  validateEkodianCapabilityInput,
} from '../ekodian-8g-runtime.js';

test('EKODIAN 8G summary is bound to the canonical capability registry', () => {
  const summary = getEkodian8GSummary();
  assert.equal(summary.generation, 8);
  assert.equal(summary.capabilityRegistry, 'config/capability-registry.json');
  assert.equal(summary.capabilityRegistryEnforcement, 'explicit_capabilities_must_be_registered');
  assert.equal(summary.capabilityGovernance.registryName, 'EKODI Universal Capability Registry');
  assert.ok(summary.capabilityGovernance.registeredCapabilities > 0);
  assert.equal(summary.capabilityGovernance.modelMayInventCapabilities, false);
  assert.equal(summary.capabilityGovernance.unknownCapabilityBehavior, 'unresolved_not_guessed');
});

test('registered observe capability yields least-privilege read access and an audit record', () => {
  const snapshot = buildEkodianOperationSnapshot({
    id: 42,
    agentId: 'chief',
    actionType: 'service.health_check',
    area: 'health_checks',
    decisionTier: 'observe',
    status: 'verified',
    surface: 'admin',
  });
  assert.equal(snapshot.capability.id, 'core.analytics');
  assert.equal(snapshot.capability.registered, true);
  assert.equal(snapshot.authority.permission, 'allowed');
  assert.equal(snapshot.dataAccess.scope, 'authorized_context_read');
  assert.equal(snapshot.audit.sourceOfTruth, 'ai_agent_actions');
  assert.equal(snapshot.audit.recordId, 42);
  assert.equal(snapshot.audit.persisted, true);
  assert.equal(snapshot.remoteExecution.allowed, false);
});

test('explicit unknown capabilities are rejected instead of guessed', () => {
  const result = validateEkodianCapabilityInput({ capabilityId: 'invented.magic', actionType: 'service.health_check' });
  assert.equal(result.ok, false);
  assert.equal(result.explicit, true);
  assert.equal(result.registered, false);
  assert.equal(result.code, 'CAPABILITY_NOT_REGISTERED');
});

test('human-gated capability has no mutation access before approval', () => {
  const awaiting = resolveEkodianGovernance({
    agentId: 'books',
    capabilityId: 'creator.publish',
    actionType: 'creator.publish',
    area: 'publishing',
    decisionTier: 'human_gate',
    status: 'awaiting_human',
  });
  assert.equal(awaiting.permission, 'approval_required');
  assert.equal(awaiting.approval.status, 'awaiting_human');
  assert.equal(awaiting.dataAccess.scope, 'none');

  const approved = resolveEkodianGovernance({
    agentId: 'books',
    capabilityId: 'creator.publish',
    actionType: 'creator.publish',
    area: 'publishing',
    decisionTier: 'human_gate',
    status: 'approved_pending_executor',
  });
  assert.equal(approved.permission, 'allowed');
  assert.equal(approved.approval.status, 'approved');
  assert.equal(approved.dataAccess.scope, 'human_approved_scoped_mutation');
});

test('capability owner mismatch requires an explicit delegation marker', () => {
  const denied = resolveEkodianGovernance({
    agentId: 'finance',
    capabilityId: 'core.analytics',
    actionType: 'service.health_check',
    area: 'health_checks',
    decisionTier: 'observe',
    status: 'verified',
  });
  assert.equal(denied.permission, 'denied');
  assert.equal(denied.reason, 'capability_owner_or_delegation_required');

  const delegated = resolveEkodianGovernance({
    agentId: 'finance',
    capabilityId: 'core.analytics',
    actionType: 'service.health_check',
    area: 'health_checks',
    decisionTier: 'observe',
    status: 'verified',
    delegated: true,
  });
  assert.equal(delegated.permission, 'allowed');
  assert.equal(delegated.capability.delegated, true);
});

test('remote execution is denied unless trusted device-control explicitly authorizes it', () => {
  const base = {
    agentId: 'chief',
    capabilityId: 'core.analytics',
    actionType: 'service.health_check',
    area: 'health_checks',
    decisionTier: 'observe',
    status: 'verified',
    payload: { remoteWorkRequested: true },
  };
  const untrusted = resolveEkodianGovernance(base);
  assert.equal(untrusted.remoteExecution.requested, true);
  assert.equal(untrusted.remoteExecution.allowed, false);
  assert.equal(untrusted.remoteExecution.reason, 'device_control_decision_required');

  const trusted = resolveEkodianGovernance({
    ...base,
    remoteExecutionDecision: { authority: 'device-control', allowed: true },
  });
  assert.equal(trusted.remoteExecution.allowed, true);
  assert.equal(trusted.remoteExecution.reason, 'device_control_authorized');
});

test('critical workflows keep EKODIAN visually out of the way even after approval', () => {
  const snapshot = buildEkodianOperationSnapshot({
    agentId: 'commerce',
    capabilityId: 'commerce.market',
    actionType: 'commerce.commit',
    area: 'payment',
    decisionTier: 'human_gate',
    status: 'approved_pending_executor',
    surface: 'admin',
  });
  assert.equal(snapshot.authority.permission, 'allowed');
  assert.equal(snapshot.character.presence.level, 0);
  assert.equal(snapshot.character.presence.token, 'hidden');
});
