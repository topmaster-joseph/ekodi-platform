import { AI_MISSION_RUNTIME, getRuntimeAgentPolicy } from './ai-governance-runtime.js';
import { SOVEREIGN_AUTONOMY_POLICY } from './sovereign-autonomy-runtime.js';

const freeze = value => Object.freeze(value);
const freezeList = values => freeze([...values]);
const clean = value => String(value ?? '').trim();

const ACTION_CAPABILITY_MAP = freeze({
  'admin.assist_chat': 'core.navigator',
  'service.health_check': 'core.analytics',
});

const AREA_CAPABILITY_MAP = freeze({
  analytics: 'core.analytics',
  anomaly_detection: 'core.analytics',
  health_checks: 'core.analytics',
  read_only_audits: 'core.analytics',
});

const STATUS_STATE_MAP = freeze({
  assist_only: 'explain',
  awaiting_human: 'ask',
  approved_pending_executor: 'confirm',
  ready_for_executor: 'wait',
  executing: 'wait',
  verified: 'complete',
  failed: 'error',
  rejected: 'calm',
  blocked: 'calm',
});

const STATUS_ROLE_MAP = freeze({
  assist_only: 'guide',
  awaiting_human: 'connector',
  approved_pending_executor: 'helper',
  ready_for_executor: 'helper',
  executing: 'helper',
  verified: 'celebrator',
  failed: 'helper',
  rejected: 'guide',
  blocked: 'guide',
});

const CRITICAL_AREAS = new Set([
  ...AI_MISSION_RUNTIME.humanGateAreas,
  ...AI_MISSION_RUNTIME.forbiddenAreas,
  'auth',
  'identity_authority',
  'personal_data',
  'payment',
  'security',
  'secrets',
]);

export const EKODIAN_8G_POLICY = freeze({
  version: '1.0.0',
  generation: 8,
  characterId: 'ekodian',
  operatingModel: 'sovereign_autonomous_agentic_service_companion',
  hierarchy: freezeList(['sovereign', 'autonomous', 'agentic', 'services', 'experience']),
  authorityContext: SOVEREIGN_AUTONOMY_POLICY.authorityContext,
  finalHumanAuthority: SOVEREIGN_AUTONOMY_POLICY.finalHumanAuthority,
  capabilityRegistry: 'config/capability-registry.json',
  actionLog: 'ai_agent_actions',
  invariants: freezeList([
    'character_never_expands_agent_authority',
    'character_state_is_derived_from_governed_operation_state',
    'human_gate_is_visible_and_never_auto_approved',
    'capability_precedes_provider_or_service_implementation',
    'critical_workflows_minimize_character_presence',
    'verified_actions_may_complete_but_not_claim_unverified_success',
    'failed_actions_enter_recovery_expression_not_blame',
    'audit_record_is_source_of_truth_for_operational_history',
  ]),
  presenceLevels: freeze({
    hidden: 0,
    micro: 1,
    supporting: 2,
    primary: 3,
    story: 4,
  }),
});

export function resolveEkodianCapability(input = {}) {
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {};
  const explicit = clean(input.capabilityId || input.capability_id || payload.capabilityId || payload.capability_id);
  if (explicit) return explicit;
  const actionType = clean(input.actionType || input.action_type);
  if (ACTION_CAPABILITY_MAP[actionType]) return ACTION_CAPABILITY_MAP[actionType];
  const area = clean(input.area);
  return AREA_CAPABILITY_MAP[area] || '';
}

export function resolveEkodianState(input = {}) {
  const status = clean(input.status).toLowerCase();
  if (STATUS_STATE_MAP[status]) return STATUS_STATE_MAP[status];
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  if (tier === 'human_gate') return 'ask';
  if (tier === 'forbidden') return 'calm';
  if (tier === 'execute_reversible') return 'confirm';
  if (tier === 'observe') return 'wait';
  if (tier === 'assist') return 'explain';
  return 'calm';
}

export function resolveEkodianRole(input = {}) {
  const status = clean(input.status).toLowerCase();
  if (STATUS_ROLE_MAP[status]) return STATUS_ROLE_MAP[status];
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  if (tier === 'human_gate') return 'connector';
  if (tier === 'execute_reversible' || tier === 'observe') return 'helper';
  return 'guide';
}

export function resolveEkodianPresence(input = {}) {
  const area = clean(input.area).toLowerCase();
  const surface = clean(input.surface || input.context?.surface || 'admin').toLowerCase();
  const status = clean(input.status).toLowerCase();
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();

  if (CRITICAL_AREAS.has(area) || tier === 'forbidden') {
    return freeze({ level: 0, token: 'hidden', reason: 'critical_or_forbidden_context' });
  }
  if (surface === 'admin' || surface === 'control') {
    return freeze({ level: 1, token: 'micro', reason: status === 'awaiting_human' ? 'approval_attention_without_distraction' : 'admin_restraint_default' });
  }
  if (status === 'verified') return freeze({ level: 2, token: 'supporting', reason: 'verified_completion' });
  return freeze({ level: 2, token: 'supporting', reason: 'user_guidance' });
}

export function resolveEkodianApproval(input = {}) {
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const status = clean(input.status).toLowerCase();
  const required = tier === 'human_gate' || status === 'awaiting_human';
  return freeze({
    required,
    canSelfApprove: false,
    authority: required ? EKODIAN_8G_POLICY.finalHumanAuthority : null,
    status: required ? (status === 'awaiting_human' ? 'awaiting_human' : 'required') : 'not_required',
  });
}

export function buildEkodianOperationSnapshot(input = {}) {
  const agentId = clean(input.agentId || input.agent_id);
  const agent = getRuntimeAgentPolicy(agentId);
  const decisionTier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const status = clean(input.status).toLowerCase();
  const capabilityId = resolveEkodianCapability(input);
  const presence = resolveEkodianPresence(input);
  const approval = resolveEkodianApproval(input);

  return freeze({
    schemaVersion: '1.0.0',
    contract: 'ekodi.ekodian-operation.v1',
    generation: EKODIAN_8G_POLICY.generation,
    character: freeze({ id: EKODIAN_8G_POLICY.characterId, role: resolveEkodianRole(input), state: resolveEkodianState(input), presence }),
    authority: freeze({
      model: EKODIAN_8G_POLICY.authorityContext,
      finalHumanAuthority: EKODIAN_8G_POLICY.finalHumanAuthority,
      decisionTier: decisionTier || 'unregistered',
      approval,
    }),
    agent: freeze({ id: agentId || null, name: agent?.name || null, sovereign: false }),
    capability: freeze({ id: capabilityId || null, registry: EKODIAN_8G_POLICY.capabilityRegistry }),
    operation: freeze({
      actionType: clean(input.actionType || input.action_type) || null,
      area: clean(input.area) || null,
      status: status || null,
      sourceOfTruth: EKODIAN_8G_POLICY.actionLog,
      verified: status === 'verified',
    }),
  });
}

export function decorateEkodianActionRecord(record = {}) {
  const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload
    : {};
  return freeze({
    ...record,
    ekodian: buildEkodianOperationSnapshot({ ...record, payload }),
  });
}

export function getEkodian8GSummary() {
  return freeze({
    version: EKODIAN_8G_POLICY.version,
    generation: EKODIAN_8G_POLICY.generation,
    characterId: EKODIAN_8G_POLICY.characterId,
    operatingModel: EKODIAN_8G_POLICY.operatingModel,
    hierarchy: EKODIAN_8G_POLICY.hierarchy,
    authorityContext: EKODIAN_8G_POLICY.authorityContext,
    finalHumanAuthority: EKODIAN_8G_POLICY.finalHumanAuthority,
    capabilityRegistry: EKODIAN_8G_POLICY.capabilityRegistry,
    actionLog: EKODIAN_8G_POLICY.actionLog,
    invariants: EKODIAN_8G_POLICY.invariants,
  });
}
