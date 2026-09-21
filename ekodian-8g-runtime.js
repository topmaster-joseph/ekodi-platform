import CAPABILITY_REGISTRY from './config/capability-registry.json' with { type: 'json' };
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

const TIER_RISK = freeze({
  observe: 0,
  assist: 1,
  execute_reversible: 2,
  human_gate: 3,
  forbidden: 4,
});

const CAPABILITY_ENTRIES = freezeList([
  ...(Array.isArray(CAPABILITY_REGISTRY.capabilities) ? CAPABILITY_REGISTRY.capabilities : []),
  ...(Array.isArray(CAPABILITY_REGISTRY.fabricCapabilities) ? CAPABILITY_REGISTRY.fabricCapabilities : []),
]);
const CAPABILITY_BY_ID = new Map(CAPABILITY_ENTRIES.map(entry => [clean(entry?.id), entry]).filter(([id]) => id));
const APPROVED_STATUSES = new Set(['approved_pending_executor', 'ready_for_executor', 'executing', 'verified']);
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
  version: '1.1.0',
  generation: 8,
  characterId: 'ekodian',
  operatingModel: 'sovereign_autonomous_agentic_service_companion',
  hierarchy: freezeList(['sovereign', 'autonomous', 'agentic', 'services', 'experience']),
  authorityChain: freezeList(['constitution', 'policy', 'capability_permission', 'agent', 'character_expression']),
  authorityContext: SOVEREIGN_AUTONOMY_POLICY.authorityContext,
  finalHumanAuthority: SOVEREIGN_AUTONOMY_POLICY.finalHumanAuthority,
  capabilityRegistry: 'config/capability-registry.json',
  capabilityRegistryEnforcement: 'explicit_capabilities_must_be_registered',
  capabilityProviderContract: clean(CAPABILITY_REGISTRY.providerContract) || 'governance/architecture/capability-provider-contract.v1.json',
  remoteExecutionAuthority: 'device-control',
  actionLog: 'ai_agent_actions',
  invariants: freezeList([
    'character_never_expands_agent_authority',
    'character_state_is_derived_from_governed_operation_state',
    'human_gate_is_visible_and_never_auto_approved',
    'capability_precedes_provider_or_service_implementation',
    'explicit_capabilities_must_exist_in_the_canonical_registry',
    'data_access_is_purpose_bound_and_least_privilege',
    'remote_execution_is_denied_without_a_trusted_device_control_decision',
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

function payloadOf(input = {}) {
  return input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {};
}

function explicitCapabilityId(input = {}) {
  const payload = payloadOf(input);
  return clean(input.capabilityId || input.capability_id || payload.capabilityId || payload.capability_id);
}

export function resolveEkodianCapability(input = {}) {
  const explicit = explicitCapabilityId(input);
  if (explicit) return explicit;
  const actionType = clean(input.actionType || input.action_type);
  if (ACTION_CAPABILITY_MAP[actionType]) return ACTION_CAPABILITY_MAP[actionType];
  const area = clean(input.area);
  return AREA_CAPABILITY_MAP[area] || '';
}

export function getEkodianCapabilityEntry(input = {}) {
  const capabilityId = typeof input === 'string' ? clean(input) : resolveEkodianCapability(input);
  return CAPABILITY_BY_ID.get(capabilityId) || null;
}

export function validateEkodianCapabilityInput(input = {}) {
  const explicit = explicitCapabilityId(input);
  if (!explicit) return freeze({ ok: true, explicit: false, capabilityId: resolveEkodianCapability(input) || null, registered: Boolean(getEkodianCapabilityEntry(input)) });
  const entry = CAPABILITY_BY_ID.get(explicit) || null;
  return freeze({
    ok: Boolean(entry),
    explicit: true,
    capabilityId: explicit,
    registered: Boolean(entry),
    code: entry ? null : 'CAPABILITY_NOT_REGISTERED',
  });
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

export function resolveEkodianApproval(input = {}) {
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const status = clean(input.status).toLowerCase();
  const required = tier === 'human_gate' || status === 'awaiting_human' || status === 'approved_pending_executor';
  let approvalStatus = 'not_required';
  if (required) {
    if (status === 'awaiting_human') approvalStatus = 'awaiting_human';
    else if (status === 'rejected') approvalStatus = 'rejected';
    else if (APPROVED_STATUSES.has(status)) approvalStatus = 'approved';
    else approvalStatus = 'required';
  }
  return freeze({
    required,
    canSelfApprove: false,
    authority: required ? EKODIAN_8G_POLICY.finalHumanAuthority : null,
    status: approvalStatus,
  });
}

function capabilityEntryOf(input = {}) {
  const candidate = input.capabilityEntry;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  return getEkodianCapabilityEntry(input);
}

function tierIsCompliant(registryTier, decisionTier) {
  if (!registryTier || !decisionTier) return true;
  if (!(registryTier in TIER_RISK) || !(decisionTier in TIER_RISK)) return false;
  return TIER_RISK[decisionTier] >= TIER_RISK[registryTier];
}

function resolveDataAccess(permission, tier, approval) {
  if (!['allowed', 'approval_required'].includes(permission)) return 'none';
  if (tier === 'observe' || tier === 'assist') return 'authorized_context_read';
  if (tier === 'execute_reversible') return 'authorized_scoped_mutation';
  if (tier === 'human_gate') return approval.status === 'approved' ? 'human_approved_scoped_mutation' : 'none';
  return 'none';
}

function resolveRemoteExecution(input, permission) {
  const payload = payloadOf(input);
  const requested = Boolean(input.remoteWorkRequested || input.remote_work_requested || payload.remoteWorkRequested || payload.remote_work_requested);
  const trusted = input.remoteExecutionDecision && typeof input.remoteExecutionDecision === 'object' && !Array.isArray(input.remoteExecutionDecision)
    ? input.remoteExecutionDecision
    : null;
  const authorized = trusted?.authority === EKODIAN_8G_POLICY.remoteExecutionAuthority && trusted?.allowed === true;
  return freeze({
    requested,
    allowed: Boolean(requested && authorized && permission === 'allowed'),
    authoritySource: EKODIAN_8G_POLICY.remoteExecutionAuthority,
    trustedDecisionPresent: Boolean(trusted),
    reason: !requested
      ? 'not_requested'
      : !trusted
        ? 'device_control_decision_required'
        : !authorized
          ? clean(trusted.reason) || 'device_control_denied'
          : permission !== 'allowed'
            ? 'capability_permission_not_allowed'
            : 'device_control_authorized',
  });
}

export function resolveEkodianGovernance(input = {}) {
  const capabilityId = resolveEkodianCapability(input);
  const entry = capabilityEntryOf(input);
  const registered = Boolean(capabilityId && entry && clean(entry.id) === capabilityId);
  const registryTier = registered ? clean(entry.actionTier).toLowerCase() : '';
  const decisionTier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const agentId = clean(input.agentId || input.agent_id);
  const ownerAgent = registered ? clean(entry.ownerAgent) : '';
  const delegated = Boolean(input.delegated || payloadOf(input).delegated);
  const ownerAligned = !registered || !agentId || !ownerAgent || agentId === ownerAgent || delegated;
  const tierCompliant = registered ? tierIsCompliant(registryTier, decisionTier) : false;
  const approval = resolveEkodianApproval(input);

  let permission = capabilityId ? 'unregistered' : 'unresolved';
  let reason = capabilityId ? 'capability_not_registered' : 'capability_not_resolved';
  if (registered && !ownerAligned) {
    permission = 'denied';
    reason = 'capability_owner_or_delegation_required';
  } else if (registered && !tierCompliant) {
    permission = 'denied';
    reason = 'decision_is_more_permissive_than_capability_contract';
  } else if (registered && decisionTier === 'forbidden') {
    permission = 'denied';
    reason = 'mission_policy_forbidden';
  } else if (registered && approval.required && approval.status !== 'approved') {
    permission = approval.status === 'rejected' ? 'denied' : 'approval_required';
    reason = approval.status === 'rejected' ? 'human_rejected' : 'human_approval_required';
  } else if (registered) {
    permission = 'allowed';
    reason = 'registered_and_policy_aligned';
  }

  const dataAccess = resolveDataAccess(permission, decisionTier || registryTier, approval);
  const remoteExecution = resolveRemoteExecution(input, permission);
  const recordId = Number(input.id || input.actionId || 0) || null;

  return freeze({
    permission,
    reason,
    capability: freeze({
      id: capabilityId || null,
      registered,
      registryVersion: clean(input.capabilityRegistryVersion) || clean(CAPABILITY_REGISTRY.version) || null,
      domain: registered ? clean(entry.domain) || null : null,
      maturity: registered ? clean(entry.maturity) || null : null,
      ownerAgent: ownerAgent || null,
      registryTier: registryTier || null,
      ownerAligned,
      tierCompliant,
      delegated,
    }),
    approval,
    dataAccess: freeze({
      scope: dataAccess,
      leastPrivilege: true,
      purposeBound: true,
    }),
    remoteExecution,
    audit: freeze({
      required: true,
      sourceOfTruth: EKODIAN_8G_POLICY.actionLog,
      recordId,
      persisted: Boolean(recordId),
      operationStatus: clean(input.status).toLowerCase() || null,
    }),
  });
}

export function resolveEkodianPresence(input = {}) {
  const area = clean(input.area).toLowerCase();
  const surface = clean(input.surface || input.context?.surface || 'admin').toLowerCase();
  const status = clean(input.status).toLowerCase();
  const tier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const governancePermission = clean(input.governancePermission || input.permission).toLowerCase();

  if (CRITICAL_AREAS.has(area) || tier === 'forbidden' || governancePermission === 'denied') {
    return freeze({ level: 0, token: 'hidden', reason: governancePermission === 'denied' ? 'governance_denied' : 'critical_or_forbidden_context' });
  }
  if (surface === 'admin' || surface === 'control') {
    return freeze({ level: 1, token: 'micro', reason: status === 'awaiting_human' ? 'approval_attention_without_distraction' : 'admin_restraint_default' });
  }
  if (status === 'verified') return freeze({ level: 2, token: 'supporting', reason: 'verified_completion' });
  return freeze({ level: 2, token: 'supporting', reason: 'user_guidance' });
}

export function buildEkodianOperationSnapshot(input = {}) {
  const agentId = clean(input.agentId || input.agent_id);
  const agent = getRuntimeAgentPolicy(agentId);
  const decisionTier = clean(input.decisionTier || input.decision_tier || input.tier).toLowerCase();
  const status = clean(input.status).toLowerCase();
  const governance = resolveEkodianGovernance(input);
  const presence = resolveEkodianPresence({ ...input, governancePermission: governance.permission });

  return freeze({
    schemaVersion: '1.1.0',
    contract: 'ekodi.ekodian-operation.v1',
    generation: EKODIAN_8G_POLICY.generation,
    hierarchy: EKODIAN_8G_POLICY.hierarchy,
    authorityChain: EKODIAN_8G_POLICY.authorityChain,
    character: freeze({ id: EKODIAN_8G_POLICY.characterId, role: resolveEkodianRole(input), state: resolveEkodianState(input), presence }),
    authority: freeze({
      model: EKODIAN_8G_POLICY.authorityContext,
      finalHumanAuthority: EKODIAN_8G_POLICY.finalHumanAuthority,
      decisionTier: decisionTier || 'unregistered',
      permission: governance.permission,
      approval: governance.approval,
    }),
    agent: freeze({ id: agentId || null, name: agent?.name || null, sovereign: false }),
    capability: freeze({
      ...governance.capability,
      registry: EKODIAN_8G_POLICY.capabilityRegistry,
    }),
    dataAccess: governance.dataAccess,
    remoteExecution: governance.remoteExecution,
    audit: governance.audit,
    operation: freeze({
      actionType: clean(input.actionType || input.action_type) || null,
      area: clean(input.area) || null,
      status: status || null,
      sourceOfTruth: EKODIAN_8G_POLICY.actionLog,
      verified: status === 'verified',
      governanceReason: governance.reason,
    }),
  });
}

export function decorateEkodianActionRecord(record = {}) {
  const payload = payloadOf(record);
  return freeze({
    ...record,
    ekodian: buildEkodianOperationSnapshot({ ...record, payload }),
  });
}

export function getEkodian8GSummary(extra = {}) {
  const capabilities = Array.isArray(CAPABILITY_REGISTRY.capabilities) ? CAPABILITY_REGISTRY.capabilities : [];
  const fabricCapabilities = Array.isArray(CAPABILITY_REGISTRY.fabricCapabilities) ? CAPABILITY_REGISTRY.fabricCapabilities : [];
  return freeze({
    version: EKODIAN_8G_POLICY.version,
    generation: EKODIAN_8G_POLICY.generation,
    characterId: EKODIAN_8G_POLICY.characterId,
    operatingModel: EKODIAN_8G_POLICY.operatingModel,
    hierarchy: EKODIAN_8G_POLICY.hierarchy,
    authorityChain: EKODIAN_8G_POLICY.authorityChain,
    authorityContext: EKODIAN_8G_POLICY.authorityContext,
    finalHumanAuthority: EKODIAN_8G_POLICY.finalHumanAuthority,
    capabilityRegistry: EKODIAN_8G_POLICY.capabilityRegistry,
    capabilityRegistryEnforcement: EKODIAN_8G_POLICY.capabilityRegistryEnforcement,
    capabilityProviderContract: EKODIAN_8G_POLICY.capabilityProviderContract,
    capabilityGovernance: freeze({
      registryName: clean(CAPABILITY_REGISTRY.name) || null,
      registryVersion: clean(CAPABILITY_REGISTRY.version) || null,
      capabilityTargetGeneration: CAPABILITY_REGISTRY.generation?.capabilityTarget ?? null,
      northStarGeneration: CAPABILITY_REGISTRY.generation?.northStar ?? null,
      registeredCapabilities: capabilities.length,
      fabricCapabilities: fabricCapabilities.length,
      humanGatedCapabilities: capabilities.filter(item => item?.actionTier === 'human_gate').length,
      reversibleCapabilities: capabilities.filter(item => item?.actionTier === 'execute_reversible').length,
      unknownCapabilityBehavior: CAPABILITY_REGISTRY.intentPolicy?.unknownCapabilityBehavior || null,
      modelMayInventCapabilities: CAPABILITY_REGISTRY.intentPolicy?.modelMayInventCapabilities ?? null,
    }),
    remoteExecutionAuthority: EKODIAN_8G_POLICY.remoteExecutionAuthority,
    actionLog: EKODIAN_8G_POLICY.actionLog,
    invariants: EKODIAN_8G_POLICY.invariants,
    ...extra,
  });
}
