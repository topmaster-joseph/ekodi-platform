import { runCloudConnectedTask } from './cloud-connection-runtime.js';
import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';
import { DEFAULT_TASK_GRANT_CAPABILITIES, ExecutionTaskGrantBroker } from './execution-task-grant.js';

const BRANCH_PATTERN = /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const EXECUTION_TIERS = new Set(['execute_reversible', 'execute_bounded_contract']);
const DEFAULT_MINIMUM_PARALLEL_LANES = 2;
const DEFAULT_MINIMUM_METHOD_CLASSES = 2;

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

function taskGrantScope(envelope, input = {}) {
  const authority = envelope.authorityContext || {};
  const capabilities = Array.isArray(input.taskCapabilities) && input.taskCapabilities.length
    ? input.taskCapabilities
    : DEFAULT_TASK_GRANT_CAPABILITIES;
  return {
    taskId: envelope.taskId,
    workspaceId: clean(authority.workspaceId || authority.workspace_id),
    role: clean(authority.role),
    capabilities,
    ttlSeconds: positiveInteger(input.taskGrantTtlSeconds ?? input.task_grant_ttl_seconds, 300),
  };
}

function wrapProvider(provider, envelope, credentialBroker, grantScope) {
  if (!provider || typeof provider !== 'object') return provider;
  const originalInvoke = provider.invoke;
  return {
    ...provider,
    invoke: typeof originalInvoke === 'function'
      ? async () => {
          const issued = credentialBroker.issue(grantScope);
          let validated;
          try {
            validated = validateExecutionReceipt(
              await originalInvoke({
                ...envelope,
                taskGrant: issued.grant,
                taskGrantToken: issued.token,
              }),
              clean(provider.id) || 'unknown',
            );
          } finally {
            credentialBroker.revoke(issued.token, { reason: 'provider-invocation-complete' });
          }
          return Object.freeze({
            ...validated,
            taskGrant: credentialBroker.inspect(issued.token),
          });
        }
      : originalInvoke,
  };
}

function evaluateTask(envelope, input) {
  return evaluateAutonomousOperation({
    area: envelope.area,
    context: input.context || {},
  });
}

function blockedResult(envelope, decision, extra = {}) {
  return Object.freeze({
    ok: false,
    executed: false,
    taskId: envelope.taskId,
    branch: envelope.branch,
    decision,
    requiresHumanGate: decision.tier === 'human_gate',
    requiresControlPlane: decision.tier === 'control_plane_required',
    reason: decision.reason,
    ...extra,
  });
}

function executionEnvelope(envelope, decision, input) {
  return {
    ...envelope,
    executionClass: decision.executionClass,
    authorityContext: decision.context,
    isolationProfile: clean(input.isolationProfile || input.isolation_profile) || 's0-default',
    productionAllowed: false,
  };
}

function evidenceDigest(receipt) {
  return clean(
    receipt?.evidence?.resultDigest
    || receipt?.evidence?.artifactDigest
    || receipt?.resultDigest
    || receipt?.artifactDigest,
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAutonomousExecutionFabricStatus() {
  return Object.freeze({
    generation: 10,
    mode: 'orchestrator_parallel_multi_method_execution',
    policyId: 'EXEC-FABRIC-001',
    orchestrator: 'ekodi-orchestrator',
    defaultIsolationProfile: 's0-default',
    mutatingWorkRequiresFabric: true,
    readOnlyObservationMayBypassFabric: true,
    providerIndependent: true,
    virtualizationOnly: false,
    virtualizedIsolationLaneRequiredForMutatingEngineeringWork: true,
    minimumIndependentLanes: DEFAULT_MINIMUM_PARALLEL_LANES,
    minimumIndependentMethodClasses: DEFAULT_MINIMUM_METHOD_CLASSES,
    directHostMutationForbidden: true,
    directProductionMutationForbidden: true,
    executorSelfPromotionForbidden: true,
    nonProductionRuntimeProven: true,
    runtimeProductionReadinessClaimed: false,
    branchPattern: BRANCH_PATTERN.source,
  });
}

export async function runAutonomousExecutionTask(input = {}) {
  const envelope = assertTaskEnvelope(input);
  const decision = evaluateTask(envelope, input);

  if (!EXECUTION_TIERS.has(decision.tier)) return blockedResult(envelope, decision);

  const providerEnvelope = executionEnvelope(envelope, decision, input);
  const credentialBroker = input.credentialBroker || new ExecutionTaskGrantBroker();
  const grantScope = taskGrantScope(providerEnvelope, input);
  const providers = (Array.isArray(input.providers) ? input.providers : []).map(provider => wrapProvider(provider, providerEnvelope, credentialBroker, grantScope));

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

export async function runAutonomousParallelExecutionTask(input = {}) {
  const envelope = assertTaskEnvelope(input);
  const decision = evaluateTask(envelope, input);

  if (!EXECUTION_TIERS.has(decision.tier)) {
    return blockedResult(envelope, decision, {
      mode: 'parallel-independent-evidence',
      converged: false,
      productionPromotionAuthorized: false,
    });
  }

  const rawProviders = Array.isArray(input.providers) ? input.providers.filter(Boolean) : [];
  const providerEnvelope = executionEnvelope(envelope, decision, input);
  const credentialBroker = input.credentialBroker || new ExecutionTaskGrantBroker();
  const grantScope = taskGrantScope(providerEnvelope, input);
  const minimumIndependentLanes = Math.max(
    DEFAULT_MINIMUM_PARALLEL_LANES,
    positiveInteger(input.minimumIndependentLanes ?? input.minimum_independent_lanes, DEFAULT_MINIMUM_PARALLEL_LANES),
  );
  const minimumIndependentMethodClasses = Math.max(
    DEFAULT_MINIMUM_METHOD_CLASSES,
    positiveInteger(input.minimumIndependentMethodClasses ?? input.minimum_independent_method_classes, DEFAULT_MINIMUM_METHOD_CLASSES),
  );

  const laneResults = await Promise.all(rawProviders.map(async (provider, index) => {
    const id = clean(provider.id) || `provider_${index + 1}`;
    const methodClass = clean(provider.methodClass || provider.method_class || provider.kind) || 'unknown-method';
    const wrapped = wrapProvider(provider, providerEnvelope, credentialBroker, grantScope);
    const connected = await runCloudConnectedTask({
      env: input.env || {},
      providers: [wrapped],
      priority: input.priority,
      taskName: `autonomous_parallel_execution:${envelope.taskId}:${id}`,
    });

    if (!connected.ok) {
      return Object.freeze({
        laneId: `${envelope.taskId}:${id}`,
        provider: id,
        providerKind: clean(provider.kind) || null,
        methodClass,
        ok: false,
        executed: false,
        convergenceDigest: null,
        requiresUserAction: connected.requiresUserAction === true,
        reason: clean(connected.reason) || 'execution_failed',
        skippedProviders: connected.skippedProviders,
        productionMutationPerformed: false,
        authorityExpanded: false,
        productionPromotionAuthorized: false,
      });
    }

    const receipt = connected.value;
    return Object.freeze({
      laneId: `${envelope.taskId}:${id}`,
      provider: connected.provider,
      providerKind: connected.kind,
      methodClass,
      ok: true,
      executed: true,
      convergenceDigest: evidenceDigest(receipt) || null,
      receipt,
      productionMutationPerformed: false,
      authorityExpanded: false,
      productionPromotionAuthorized: false,
    });
  }));

  const successful = laneResults.filter(lane => lane.ok && lane.executed);
  const methodClasses = new Set(successful.map(lane => lane.methodClass));
  const comparable = successful.filter(lane => lane.convergenceDigest);
  const distinctDigests = new Set(comparable.map(lane => lane.convergenceDigest));

  let reason = null;
  if (successful.length < minimumIndependentLanes) reason = 'insufficient_independent_execution_lanes';
  else if (methodClasses.size < minimumIndependentMethodClasses) reason = 'insufficient_independent_method_classes';
  else if (comparable.length < minimumIndependentLanes) reason = 'insufficient_comparable_evidence';
  else if (distinctDigests.size !== 1) reason = 'independent_evidence_disagreement';

  if (reason) {
    return Object.freeze({
      ok: false,
      executed: successful.length > 0,
      converged: false,
      mode: 'parallel-independent-evidence',
      taskId: envelope.taskId,
      branch: envelope.branch,
      baseCommit: envelope.baseCommit,
      decision,
      orchestrator: 'ekodi-orchestrator',
      minimumIndependentLanes,
      minimumIndependentMethodClasses,
      successfulLanes: successful.length,
      successfulMethodClasses: methodClasses.size,
      laneResults: Object.freeze(laneResults),
      reason,
      nextStage: 'collect_more_evidence',
      productionPromotionAuthorized: false,
    });
  }

  const [consensusDigest] = distinctDigests;
  return Object.freeze({
    ok: true,
    executed: true,
    converged: true,
    mode: 'parallel-independent-evidence',
    taskId: envelope.taskId,
    branch: envelope.branch,
    baseCommit: envelope.baseCommit,
    decision,
    orchestrator: 'ekodi-orchestrator',
    minimumIndependentLanes,
    minimumIndependentMethodClasses,
    successfulLanes: successful.length,
    successfulMethodClasses: methodClasses.size,
    consensusDigest,
    laneResults: Object.freeze(laneResults),
    nextStage: 'verify',
    productionPromotionAuthorized: false,
  });
}
