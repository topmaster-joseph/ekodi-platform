import { readFile } from 'node:fs/promises';
import { AI_MISSION_RUNTIME } from '../ai-governance-runtime.js';

const root = new URL('../', import.meta.url);
const policy = JSON.parse(await readFile(new URL('config/ai-mission-governance.json', root), 'utf8'));

const requiredPrinciples = ['stewardship', 'agency', 'koinonia', 'diaspora', 'jubilee', 'holiness'];
const requiredAgents = ['chief', 'platform', 'security', 'release', 'finance', 'ministry', 'community', 'marketing', 'commerce', 'books', 'insurance'];
const requiredHumanGates = [
  'spiritual_or_pastoral_judgment_about_a_person',
  'legal_commitment_or_contract_execution',
  'high_value_or_exceptional_financial_commitment',
  'employment_hiring_firing_or_disciplinary_action',
  'identity_merge_or_irreversible_privacy_change',
  'destructive_or_mass_data_change',
  'material_insurance_or_financial_product_commitment',
  'policy_change_that_materially_reduces_user_rights',
];
const requiredForbidden = [
  'deceptive_impersonation_of_human_or_divine_authority',
  'coercive_conversion_or_spiritual_pressure',
  'retaliation_for_opt_out_or_exit',
  'secret_cross_tenant_profiling',
  'deliberate_creation_of_dependency_to_increase_revenue',
];

assert(policy.authorityModel?.humanRole === 'steward_delegate', 'humanRole must remain steward_delegate');
assert(policy.authorityModel?.chiefAiRole === 'orchestrator_not_sovereign', 'Chief AI must remain an orchestrator, not a sovereign');
assert(policy.authorityModel?.defaultAuthority === 'least_privilege', 'default AI authority must be least_privilege');

for (const principle of requiredPrinciples) {
  assert(policy.principles?.[principle], `missing mission principle: ${principle}`);
}

assert(policy.policyPriority?.[0] === 'mission_and_human_dignity', 'mission and human dignity must be highest policy priority');
assert(policy.policyPriority?.at(-1) === 'efficiency_and_revenue', 'efficiency and revenue must not outrank mission boundaries');

for (const gate of requiredHumanGates) {
  assert(policy.actionTiers?.human_gate?.areas?.includes(gate), `missing human gate: ${gate}`);
}
for (const forbidden of requiredForbidden) {
  assert(policy.actionTiers?.forbidden?.areas?.includes(forbidden), `missing forbidden boundary: ${forbidden}`);
}

for (const agentId of requiredAgents) {
  const agent = policy.agents?.[agentId];
  assert(agent, `missing specialist agent: ${agentId}`);
  assert(typeof agent.mission === 'string' && agent.mission.length > 30, `${agentId} must have a meaningful mission`);
  assert(Array.isArray(agent.mustEscalate) && agent.mustEscalate.length > 0, `${agentId} must define escalation boundaries`);
  assert(Array.isArray(agent.mustNot) && agent.mustNot.length > 0, `${agentId} must define prohibited behavior`);
}

for (const prohibited of ['override_human_gate', 'expand_its_own_authority', 'optimize_revenue_over_user_agency']) {
  assert(policy.agents.chief.mustNot.includes(prohibited), `Chief AI must not: ${prohibited}`);
}

assert(policy.userRights?.includes('decline_or_revoke_delegated_ai_actions'), 'users must be able to revoke delegated AI actions');
assert(policy.userRights?.includes('leave_without_artificial_penalty_or_data_hostage_patterns'), 'artificial exit lock-in is prohibited');
assert(policy.decisionLoop?.includes('restore_user_agency'), 'decision loop must restore user agency after assistance');

assert(AI_MISSION_RUNTIME.version === policy.version, 'runtime policy version must match source policy');
assert(AI_MISSION_RUNTIME.authorityModel.humanRole === policy.authorityModel.humanRole, 'runtime human role must match source policy');
assert(AI_MISSION_RUNTIME.authorityModel.chiefAiRole === policy.authorityModel.chiefAiRole, 'runtime Chief AI role must match source policy');
assert(JSON.stringify(AI_MISSION_RUNTIME.policyPriority) === JSON.stringify(policy.policyPriority), 'runtime policy priority must match source policy');
assertSameSet(AI_MISSION_RUNTIME.humanGateAreas, policy.actionTiers.human_gate.areas, 'human gate areas');
assertSameSet(AI_MISSION_RUNTIME.forbiddenAreas, policy.actionTiers.forbidden.areas, 'forbidden areas');
assertSameSet(AI_MISSION_RUNTIME.nonNegotiables, policy.nonNegotiables, 'non-negotiables');
assertSameSet(Object.keys(AI_MISSION_RUNTIME.agents), Object.keys(policy.agents), 'agent registry');
for (const agentId of Object.keys(policy.agents)) {
  const runtimeAgent = AI_MISSION_RUNTIME.agents[agentId];
  assert(runtimeAgent?.name === policy.agents[agentId].name, `runtime agent name mismatch: ${agentId}`);
  assertSameSet(runtimeAgent?.mustEscalate || [], policy.agents[agentId].mustEscalate || [], `runtime escalation mismatch: ${agentId}`);
}

console.log(`AI mission governance valid: ${policy.version} (${Object.keys(policy.agents).length} agents, runtime synchronized)`);

function assertSameSet(actual, expected, label) {
  const a = [...actual].sort();
  const b = [...expected].sort();
  assert(JSON.stringify(a) === JSON.stringify(b), `${label} must match between source and runtime policy`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`AI mission governance validation failed: ${message}`);
    process.exit(1);
  }
}
