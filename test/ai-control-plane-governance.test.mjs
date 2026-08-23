import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MISSION_RUNTIME, evaluateMissionAction, getRuntimeAgentPolicy, listRuntimeAgents } from '../ai-governance-runtime.js';

test('chief AI is the primary interface and specialists remain directly accessible', () => {
  const contract = AI_MISSION_RUNTIME.orchestrationContract;
  assert.equal(contract.primaryInterface, 'chief_ai');
  assert.equal(contract.specialistRouting, 'internal');
  assert.equal(contract.specialistDirectAccess, true);
  assert.equal(contract.infrastructureControlPlane.chiefCoordinatesSpecialists, true);
  assert.equal(contract.infrastructureControlPlane.userMayOpenSpecialistConversation, true);
});

test('infrastructure specialists cover Cloudflare, GitHub, release, security, data and AI gateway', () => {
  const ids = new Set(listRuntimeAgents().map(agent => agent.id));
  for (const id of ['chief', 'infrastructure', 'development', 'release', 'security', 'data', 'ai_gateway']) assert.ok(ids.has(id), id);
  assert.deepEqual(getRuntimeAgentPolicy('infrastructure').providers, ['cloudflare']);
  assert.deepEqual(getRuntimeAgentPolicy('development').providers, ['github']);
});

test('read-only infrastructure discovery is autonomous but high-impact production changes are human gated', () => {
  assert.equal(evaluateMissionAction({ agentId:'infrastructure', area:'infrastructure_inventory' }).tier, 'observe');
  assert.equal(evaluateMissionAction({ agentId:'development', area:'repository_status' }).tier, 'observe');
  assert.equal(evaluateMissionAction({ agentId:'security', area:'production_secret_change' }).tier, 'human_gate');
  assert.equal(evaluateMissionAction({ agentId:'development', area:'repository_delete_or_force_push' }).tier, 'human_gate');
  assert.equal(evaluateMissionAction({ agentId:'infrastructure', area:'production_domain_or_dns_change' }).tier, 'human_gate');
});
