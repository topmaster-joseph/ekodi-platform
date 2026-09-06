import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  EKODIAN_8G_POLICY,
  buildEkodianOperationSnapshot,
  getEkodian8GSummary,
  resolveEkodianCapability,
} from '../ekodian-8g-runtime.js';

const capabilityRegistry = JSON.parse(fs.readFileSync(new URL('../config/capability-registry.json', import.meta.url), 'utf8'));
const characterRegistrySource = fs.readFileSync(new URL('../shell/character-registry.js', import.meta.url), 'utf8');
const characterRendererSource = fs.readFileSync(new URL('../shell/user-character.js', import.meta.url), 'utf8');
const agentControlSource = fs.readFileSync(new URL('../ai-agent-control.js', import.meta.url), 'utf8');
const capabilityIds = new Set(capabilityRegistry.capabilities.map(item => item.id));

test('EKODIAN operates explicitly as generation 8 under the sovereign hierarchy', () => {
  assert.equal(EKODIAN_8G_POLICY.generation, 8);
  assert.deepEqual([...EKODIAN_8G_POLICY.hierarchy], ['sovereign', 'autonomous', 'agentic', 'services', 'experience']);
  assert.equal(EKODIAN_8G_POLICY.authorityContext, 'Person + Workspace + Role + Capability');
  assert.equal(EKODIAN_8G_POLICY.capabilityRegistry, 'config/capability-registry.json');
  assert.equal(EKODIAN_8G_POLICY.actionLog, 'ai_agent_actions');
  assert.ok(EKODIAN_8G_POLICY.invariants.includes('character_never_expands_agent_authority'));
});

test('EKODIAN capability bindings resolve only to registered capability ids', () => {
  const mapped = [
    resolveEkodianCapability({ actionType: 'admin.assist_chat' }),
    resolveEkodianCapability({ actionType: 'service.health_check' }),
    resolveEkodianCapability({ area: 'analytics' }),
    resolveEkodianCapability({ payload: { capabilityId: 'business.marketing' } }),
  ];
  for (const id of mapped) assert.ok(capabilityIds.has(id), `${id} must exist in capability-registry.json`);
});

test('human gate becomes a restrained approval-facing EKODIAN state and cannot self-approve', () => {
  const snapshot = buildEkodianOperationSnapshot({
    agentId: 'chief',
    actionType: 'creator.publish',
    area: 'legal_commitment_or_contract_execution',
    decisionTier: 'human_gate',
    status: 'awaiting_human',
    capabilityId: 'creator.publish',
    surface: 'admin',
  });
  assert.equal(snapshot.generation, 8);
  assert.equal(snapshot.character.role, 'connector');
  assert.equal(snapshot.character.state, 'ask');
  assert.equal(snapshot.character.presence.level, 0, 'critical human-gate area should hide the character rather than decorate the decision');
  assert.equal(snapshot.authority.approval.required, true);
  assert.equal(snapshot.authority.approval.canSelfApprove, false);
  assert.equal(snapshot.authority.finalHumanAuthority, 'ekodi_platform_super_administrator');
});

test('ordinary approval requests stay micro in admin while verified user work may complete visibly', () => {
  const admin = buildEkodianOperationSnapshot({
    agentId: 'chief',
    actionType: 'workflow.prepare',
    area: 'tenant_configuration',
    decisionTier: 'human_gate',
    status: 'awaiting_human',
    surface: 'admin',
  });
  assert.equal(admin.character.state, 'ask');
  assert.equal(admin.character.presence.level, 1);

  const user = buildEkodianOperationSnapshot({
    agentId: 'platform',
    actionType: 'service.health_check',
    area: 'health_checks',
    decisionTier: 'observe',
    status: 'verified',
    surface: 'workspace',
  });
  assert.equal(user.character.role, 'celebrator');
  assert.equal(user.character.state, 'complete');
  assert.equal(user.character.presence.level, 2);
  assert.equal(user.operation.verified, true);
});

test('forbidden or security-sensitive work never uses character warmth to soften a hard boundary', () => {
  const snapshot = buildEkodianOperationSnapshot({
    agentId: 'security',
    actionType: 'security.change',
    area: 'production_secret_change',
    decisionTier: 'forbidden',
    status: 'blocked',
    surface: 'workspace',
  });
  assert.equal(snapshot.character.presence.level, 0);
  assert.equal(snapshot.character.state, 'calm');
  assert.equal(snapshot.authority.approval.canSelfApprove, false);
});

test('8G summary exposes character, capability, authority and audit contracts without provider coupling', () => {
  const summary = getEkodian8GSummary();
  assert.equal(summary.generation, 8);
  assert.equal(summary.characterId, 'ekodian');
  assert.equal(summary.capabilityRegistry, 'config/capability-registry.json');
  assert.equal(summary.actionLog, 'ai_agent_actions');
  assert.doesNotMatch(JSON.stringify(summary), /openai|anthropic|google/i);
});

test('shared character registry and renderer expose the governed operation bridge', () => {
  assert.doesNotThrow(() => new vm.Script(characterRegistrySource));
  assert.doesNotThrow(() => new vm.Script(characterRendererSource));
  assert.match(characterRegistrySource, /generation:8/);
  assert.match(characterRegistrySource, /ekodi\.ekodian-operation\.v1/);
  assert.match(characterRegistrySource, /characterMayExpandAuthority:false/);
  assert.match(characterRegistrySource, /ekodi\.ekodian-identity\.v1/);
  assert.match(characterRegistrySource, /identity_never_creates_or_expands_authority/);
  assert.match(characterRendererSource, /const VERSION=5/);
  assert.match(characterRendererSource, /EKODICharacterIdentityRegistry/);
  assert.match(characterRendererSource, /applyOperation/);
  assert.match(characterRendererSource, /ekodi:agent-state/);
  assert.match(characterRendererSource, /operationHidden/);
});

test('AI Mission Control returns EKODIAN state alongside governed decisions and logs', () => {
  assert.match(agentControlSource, /getEkodian8GSummary/);
  assert.match(agentControlSource, /buildEkodianOperationSnapshot/);
  assert.match(agentControlSource, /\/ekodian/);
  assert.match(agentControlSource, /capabilityId/);
  assert.match(agentControlSource, /payload_json, decision_tier/);
  assert.match(agentControlSource, /ekodian: ekodianFor/);
});
