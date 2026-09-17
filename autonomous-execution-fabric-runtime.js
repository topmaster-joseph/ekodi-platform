import { runCloudConnectedTask } from './cloud-connection-runtime.js';
import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';

const BRANCH_PATTERN = /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const EXECUTION_TIERS = new Set(['execute_reversible', 'execute_bounded_contract']);
const PROFILE_RANK = Object.freeze({ standard: 1, hardened: 2, microvm: 3 });

const clean = value => String(value ?? '').trim();

function assertTaskEnvelope(input = {}) {
  const taskId = clean(input.taskId || input.task_id);
  const branch = clean(input.branch);
  const baseCommit = clean(input.baseCommit || input.base_commit);
  const area = clean(input.area).toLowerCase();
  const goal = clean(input.goal);

  if (!taskId) throw new Error('execution task requires taskId');
  if (!BRANCH_PATTERN.test(branch)) throw new Error('execution task branch must match ai/<agent>/<task-id>');
  if (!baseCommit) throw new Error('execution task requires an immutable baseCommit');
  if (!area) throw new Error('execution task requires an autonomous operation area');
  if (!goal) throw new Error('execution task requires a goal');

  return Object.freeze({ taskId, branch, baseCommit, area, goal });
}

function normalizeProfile(value) {
  const profile = clean(value).toLowerCase();
  return PROFILE_RANK[profile] ? profile : '';
}

function strongerProfile(a, b) {
  const left = normalizeProfile(a) || 'standard';
  const right = normalizeProfile(b) || 'standard';
  return PROFILE_RANK[left] >= PROFILE_RANK[right] ? left : right;
}

function requiredIsolationProfile(input = {}) {
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  let required = 'standard';

  if (context.untrustedExecution === true || context.thirdPartyExecutable === true) {
    required = 'hardened';
  }
  if (context.kernelSensitive === true || context.strongTenantIsolation === true) {
    required = 'microvm';
  }

  const requested = normalizeProfile(input.requiredIsolationProfile || input.required_isolation_profile);
  return requested ? strongerProfile(required, requested) : required;
}

function validateExecutionReceipt(receipt, providerId = 'unknown', requiredProfile = 'standard') {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error(`execution provider ${providerId} returned no structured receipt`);
  }

  const actualProfile = normalizeProfile(receipt.isolationProfile || receipt.isolation_profile);
  const violations = [];

  if (!actualProfile) violations.push('isolationProfile=standard|hardened|microvm');
  if (actualProfile && PROFILE_RANK[actualProfile] < PROFILE_RANK[requiredProfile]) {
    violations.push(`isolationProfile>=${requiredProfile}`);
  }
  if (!clean(receipt.executionTechnology || receipt.execution_technology)) violations.push('executionTechnology');
  if (receipt.virtualizationProven !== true) violations.push('virtualizationProven=true');
  if (receipt.ephemeral !== true) violations.push('ephemeral=true');
  if (receipt.workspaceIsolation !== true) violations.push('workspaceIsolation=true');
  if (receipt.networkDefaultDenied !== true) violations.push('networkDefaultDenied=true');
  if (receipt.rootFilesystemReadOnly !== true) violations.push('rootFilesystemReadOnly=true');
  if (receipt.capabilitiesDropped !== true) violations.push('capabilitiesDropped=true');
  if (receipt.noNewPrivileges !== true) violations.push('noNewPrivileges=true');
  if (receipt.privileged !== false) violations.push('privileged=false');
  if (receipt.hostContainerSocketMounted !== false) violations.push('hostContainerSocketMounted=false');
  if (receipt.productionMutationPerformed !== false) violations.push('productionMutationPerformed=false');
  if (receipt.authorityExpanded !== false) violations.push('authorityExpanded=false');
  if (receipt.productionSecretExposed !== false) violations.push('productionSecretExposed=false');
  if (!clean(receipt.artifactDigest || receipt.resultDigest || receipt.result_digest)) violations.push('artifactDigest|resultDigest');
  if (!receipt.evidence || typeof receipt.evidence !== 'object' || Array.isArray(receipt.evidence)) violations.push('evidence');

  if (violations.length) {
    const error = new Error(`execution provider ${providerId} violated receipt contract: ${violations.join(', ')}`);
    error.code = 'EXECUTION_RECEIPT_CONTRACT_VIOLATION';
    throw error;
  }

  return Object.freeze({
    ...receipt,
    isolationProfile: actualProfile,
    executionTechnology: clean(receipt.executionTechnology || receipt.execution_technology),
    evidence: Object.freeze({ ...receipt.evidence }),
  });
}

function wrapProvider(provider, envelope) {
  if (!provider || typeof provider !== 'object') return provider;
  const originalInvoke = provider.invoke;
  return {
    ...provider,
    invoke: typeof originalInvoke === 'function'
      ? async () => validateExecutionReceipt(
        await originalInvoke(envelope),
        clean(provider.id) || 'unknown',
        envelope.requiredIsolationProfile,
      )
      : originalInvoke,
  };
}

export function getAutonomousExecutionFabricStatus() {
  return Object.freeze({
    generation: 10,
    mode: 'provider_independent_ephemeral_virtualized_execution',
    virtualizationFirstEnforced: true,
    isolationProfiles: Object.freeze(['standard', 'hardened', 'microvm']),
    directProductionMutationForbidden: true,
    persistentHostRepositoryExecutionForbidden: true,
    branchPattern: BRANCH_PATTERN.source,
    runtimeProductionReadinessClaimed: false,
  });
}

export async function runAutonomousExecutionTask(input = {}) {
  const envelope = assertTaskEnvelope(input);
  const isolationProfile = requiredIsolationProfile(input);
  const decision = evaluateAutonomousOperation({
    area: envelope.area,
    context: input.context || {},
  });

  if (!EXECUTION_TIERS.has(decision.tier)) {
    return Object.freeze({
      ok: false,
      executed: false,
      taskId: envelope.taskId,
      branch: envelope.branch,
      requiredIsolationProfile: isolationProfile,
      decision,
      requiresHumanGate: decision.tier === 'human_gate',
      requiresControlPlane: decision.tier === 'control_plane_required',
      reason: decision.reason,
    });
  }

  const providerEnvelope = Object.freeze({
    ...envelope,
    executionClass: decision.executionClass,
    authorityContext: decision.context,
    requiredIsolationProfile: isolationProfile,
    virtualizationRequired: true,
    productionAllowed: false,
  });

  const providers = (Array.isArray(input.providers) ? input.providers : []).map(provider => wrapProvider(provider, providerEnvelope));

  const connected = await runCloudConnectedTask({
    env: input.env || {},
    providers,
    priority: input.priority,
    taskName: `autonomous_execution:${envelope.taskId}`,
  });

  if (!connected.ok) {
    return Object.freeze({
      ...connected,
      executed: false,
      taskId: envelope.taskId,
      branch: envelope.branch,
      requiredIsolationProfile: isolationProfile,
      decision,
    });
  }

  return Object.freeze({
    ok: true,
    executed: true,
    taskId: envelope.taskId,
    branch: envelope.branch,
    baseCommit: envelope.baseCommit,
    requiredIsolationProfile: isolationProfile,
    decision,
    provider: connected.provider,
    providerKind: connected.kind,
    attemptedProviders: connected.attemptedProviders,
    skippedProviders: connected.skippedProviders,
    receipt: connected.value,
    nextStage: 'verify',
    productionPromotionAuthorized: false,
  });
}
