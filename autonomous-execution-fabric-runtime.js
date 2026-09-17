import { runCloudConnectedTask } from './cloud-connection-runtime.js';
import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';

const BRANCH_PATTERN = /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const EXECUTION_TIERS = new Set(['execute_reversible', 'execute_bounded_contract']);

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

function validateExecutionReceipt(receipt, providerId = 'unknown') {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error(`execution provider ${providerId} returned no structured receipt`);
  }

  const violations = [];
  if (receipt.ephemeral !== true) violations.push('ephemeral=true');
  if (receipt.workspaceIsolation !== true) violations.push('workspaceIsolation=true');
  if (receipt.productionMutationPerformed !== false) violations.push('productionMutationPerformed=false');
  if (receipt.authorityExpanded !== false) violations.push('authorityExpanded=false');
  if (receipt.productionSecretExposed !== false) violations.push('productionSecretExposed=false');
  if (!receipt.evidence || typeof receipt.evidence !== 'object' || Array.isArray(receipt.evidence)) violations.push('evidence');

  if (violations.length) {
    const error = new Error(`execution provider ${providerId} violated receipt contract: ${violations.join(', ')}`);
    error.code = 'EXECUTION_RECEIPT_CONTRACT_VIOLATION';
    throw error;
  }

  return Object.freeze({ ...receipt, evidence: Object.freeze({ ...receipt.evidence }) });
}

function wrapProvider(provider, envelope) {
  if (!provider || typeof provider !== 'object') return provider;
  const originalInvoke = provider.invoke;
  return {
    ...provider,
    invoke: typeof originalInvoke === 'function'
      ? async () => validateExecutionReceipt(await originalInvoke(envelope), clean(provider.id) || 'unknown')
      : originalInvoke,
  };
}

export function getAutonomousExecutionFabricStatus() {
  return Object.freeze({
    generation: 10,
    mode: 'provider_independent_ephemeral_execution',
    policyId: 'EXEC-FABRIC-001',
    defaultIsolationProfile: 's0-default',
    mutatingWorkRequiresFabric: true,
    readOnlyObservationMayBypassFabric: true,
    providerIndependent: true,
    directHostMutationForbidden: true,
    directProductionMutationForbidden: true,
    nonProductionRuntimeProven: true,
    runtimeProductionReadinessClaimed: false,
    branchPattern: BRANCH_PATTERN.source,
  });
}

export async function runAutonomousExecutionTask(input = {}) {
  const envelope = assertTaskEnvelope(input);
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
      decision,
      requiresHumanGate: decision.tier === 'human_gate',
      requiresControlPlane: decision.tier === 'control_plane_required',
      reason: decision.reason,
    });
  }

  const providers = (Array.isArray(input.providers) ? input.providers : []).map(provider => wrapProvider(provider, {
    ...envelope,
    executionClass: decision.executionClass,
    authorityContext: decision.context,
    isolationProfile: clean(input.isolationProfile || input.isolation_profile) || 's0-default',
    productionAllowed: false,
  }));

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
      decision,
    });
  }

  return Object.freeze({
    ok: true,
    executed: true,
    taskId: envelope.taskId,
    branch: envelope.branch,
    baseCommit: envelope.baseCommit,
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
