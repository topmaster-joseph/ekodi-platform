const WORKER_STATES = new Set(['ready', 'busy', 'draining', 'offline']);
const WORKER_KINDS = new Set(['ephemeral_cloud_vm', 'cloud_worker', 'managed_sandbox', 'local_worker']);
const CHANGE_CLASSES = new Set(['green', 'yellow', 'red']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export const CLOUD_FABRIC_WORKER_POLICY = Object.freeze({
  version: '1.0.0',
  strategy: 'cloud_first_capability_matched_failover',
  providerIndependent: true,
  cloudFirst: true,
  localFallbackOnly: true,
  directProductionMutationForbidden: true,
  persistentAgentShellForbidden: true,
  productionSecretsForbidden: true,
  defaultLeaseMs: 5 * 60 * 1000,
  localWorker: Object.freeze({
    outboundOnlyRequired: true,
    equivalentVirtualizedIsolationRequired: true,
    publicInboundRequired: false,
  }),
});

function clean(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeCapabilities(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return Object.freeze([...new Set(source
    .map(item => clean(item, 80).toLowerCase())
    .filter(item => /^[a-z0-9][a-z0-9._:-]{0,79}$/.test(item)))]);
}

function isLocal(worker) {
  return worker.kind === 'local_worker';
}

function structuralViolation(worker) {
  if (worker.directProductionMutation === true) return 'direct_production_mutation_forbidden';
  if (worker.productionSecrets === true) return 'production_secrets_forbidden';
  if (worker.persistentShell === true) return 'persistent_agent_shell_forbidden';
  if (isLocal(worker) && worker.outboundOnly !== true) return 'local_worker_must_be_outbound_only';
  if (isLocal(worker) && worker.virtualizedIsolation !== true) return 'local_worker_requires_equivalent_virtualized_isolation';
  return null;
}

export function normalizeCloudFabricWorker(input = {}, index = 0) {
  const id = clean(input.id || `worker_${index + 1}`, 80).toLowerCase();
  const kind = WORKER_KINDS.has(input.kind) ? input.kind : 'cloud_worker';
  const state = WORKER_STATES.has(input.state) ? input.state : 'offline';
  const maxConcurrency = Math.max(1, Math.floor(clamp(input.maxConcurrency, 1, 64, 1)));
  const activeJobs = Math.max(0, Math.floor(clamp(input.activeJobs, 0, 10000, 0)));
  const currentLoad = clamp(input.currentLoad, 0, 100, 100);
  const worker = {
    id,
    kind,
    state,
    capabilities: normalizeCapabilities(input.capabilities),
    currentLoad,
    activeJobs,
    maxConcurrency,
    outboundOnly: input.outboundOnly === true,
    virtualizedIsolation: input.virtualizedIsolation === true,
    directProductionMutation: input.directProductionMutation === true,
    productionSecrets: input.productionSecrets === true,
    persistentShell: input.persistentShell === true,
    invoke: typeof input.invoke === 'function' ? input.invoke : null,
  };

  const invalidId = !ID_PATTERN.test(id);
  const violation = invalidId ? 'invalid_worker_id' : structuralViolation(worker);
  const capacityAvailable = activeJobs < maxConcurrency;
  const runnableState = state === 'ready' || state === 'busy';

  return Object.freeze({
    ...worker,
    executionPlane: isLocal(worker) ? 'local' : 'cloud',
    capacityAvailable,
    eligible: !violation && runnableState && capacityAvailable && Boolean(worker.invoke),
    ineligibleReason: violation
      || (!runnableState ? `worker_${state}` : null)
      || (!capacityAvailable ? 'worker_at_capacity' : null)
      || (!worker.invoke ? 'worker_invoke_missing' : null),
  });
}

function supports(worker, requiredCapabilities) {
  if (!requiredCapabilities.length) return true;
  const supported = new Set(worker.capabilities);
  return supported.has('*') || requiredCapabilities.every(capability => supported.has(capability));
}

function workerScore(worker) {
  const localityPenalty = worker.executionPlane === 'local' ? 10000 : 0;
  const kindPenalty = worker.kind === 'ephemeral_cloud_vm'
    ? 0
    : worker.kind === 'managed_sandbox'
      ? 100
      : worker.kind === 'cloud_worker'
        ? 200
        : 300;
  const concurrencyPressure = (worker.activeJobs / worker.maxConcurrency) * 100;
  return localityPenalty + kindPenalty + worker.currentLoad + concurrencyPressure;
}

function publicWorker(worker) {
  return Object.freeze({
    id: worker.id,
    kind: worker.kind,
    state: worker.state,
    executionPlane: worker.executionPlane,
    capabilities: worker.capabilities,
    currentLoad: worker.currentLoad,
    activeJobs: worker.activeJobs,
    maxConcurrency: worker.maxConcurrency,
  });
}

export function buildCloudFabricWorkerPlan(input = {}, workers = []) {
  const taskId = clean(input.taskId || input.task_id, 120);
  if (!taskId) throw new TypeError('Cloud Fabric task requires taskId.');

  const changeClass = CHANGE_CLASSES.has(clean(input.changeClass, 16).toLowerCase())
    ? clean(input.changeClass, 16).toLowerCase()
    : 'green';
  const requiredCapabilities = normalizeCapabilities(input.requiredCapabilities);
  const humanApproved = input.humanApproved === true;
  const productionMutation = input.productionMutation === true;

  if (productionMutation) {
    return Object.freeze({
      taskId,
      blocked: true,
      reason: 'direct_production_mutation_forbidden',
      changeClass,
      requiredCapabilities,
      selectedWorkers: Object.freeze([]),
      skippedWorkers: Object.freeze([]),
    });
  }
  if (changeClass === 'red' && !humanApproved) {
    return Object.freeze({
      taskId,
      blocked: true,
      reason: 'sovereign_human_gate_required',
      changeClass,
      requiredCapabilities,
      selectedWorkers: Object.freeze([]),
      skippedWorkers: Object.freeze([]),
    });
  }

  const normalized = (Array.isArray(workers) ? workers : []).map(normalizeCloudFabricWorker);
  const skippedWorkers = [];
  const eligible = [];

  for (const worker of normalized) {
    if (!worker.eligible) {
      skippedWorkers.push(Object.freeze({ id: worker.id, kind: worker.kind, reason: worker.ineligibleReason }));
      continue;
    }
    if (!supports(worker, requiredCapabilities)) {
      skippedWorkers.push(Object.freeze({ id: worker.id, kind: worker.kind, reason: 'capability_mismatch' }));
      continue;
    }
    eligible.push(worker);
  }

  eligible.sort((a, b) => workerScore(a) - workerScore(b) || a.id.localeCompare(b.id));

  return Object.freeze({
    taskId,
    blocked: false,
    reason: eligible.length ? null : 'no_eligible_worker',
    changeClass,
    requiredCapabilities,
    selectedWorkers: Object.freeze(eligible.map(publicWorker)),
    skippedWorkers: Object.freeze(skippedWorkers),
    cloudCandidateCount: eligible.filter(worker => worker.executionPlane === 'cloud').length,
    localCandidateCount: eligible.filter(worker => worker.executionPlane === 'local').length,
  });
}

function validateReceipt(receipt, worker) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw Object.assign(new Error(`worker ${worker.id} returned no structured receipt`), { code: 'WORKER_RECEIPT_INVALID' });
  }
  const required = [
    ['ephemeral', true],
    ['workspaceIsolation', true],
    ['productionMutationPerformed', false],
    ['authorityExpanded', false],
    ['productionSecretExposed', false],
  ];
  const violations = required.filter(([key, expected]) => receipt[key] !== expected).map(([key, expected]) => `${key}=${expected}`);
  if (!receipt.evidence || typeof receipt.evidence !== 'object' || Array.isArray(receipt.evidence)) violations.push('evidence');
  if (violations.length) {
    throw Object.assign(new Error(`worker ${worker.id} violated receipt contract: ${violations.join(', ')}`), { code: 'WORKER_RECEIPT_CONTRACT_VIOLATION' });
  }
  return Object.freeze({ ...receipt, evidence: Object.freeze({ ...receipt.evidence }) });
}

function leaseFor(taskId, workerId, leaseMs, now) {
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + leaseMs).toISOString();
  return Object.freeze({
    id: `${taskId}:${workerId}:${now}`,
    taskId,
    workerId,
    issuedAt,
    expiresAt,
    productionAllowed: false,
  });
}

export async function runCloudFabricWorkerTask(input = {}, workers = []) {
  const plan = buildCloudFabricWorkerPlan(input, workers);
  if (plan.blocked || !plan.selectedWorkers.length) {
    return Object.freeze({
      ok: false,
      executed: false,
      plan,
      attemptedWorkers: Object.freeze([]),
      reason: plan.reason,
    });
  }

  const normalized = (Array.isArray(workers) ? workers : []).map(normalizeCloudFabricWorker);
  const byId = new Map(normalized.map(worker => [worker.id, worker]));
  const attemptedWorkers = [];
  const failures = [];
  const leaseMs = Math.max(1000, Math.floor(clamp(input.leaseMs, 1000, 15 * 60 * 1000, CLOUD_FABRIC_WORKER_POLICY.defaultLeaseMs)));
  const nowFactory = typeof input.now === 'function' ? input.now : () => Date.now();

  for (const candidate of plan.selectedWorkers) {
    const worker = byId.get(candidate.id);
    if (!worker?.invoke) continue;
    attemptedWorkers.push(worker.id);
    const now = nowFactory();
    const lease = leaseFor(plan.taskId, worker.id, leaseMs, now);
    try {
      const receipt = validateReceipt(await worker.invoke(Object.freeze({
        taskId: plan.taskId,
        changeClass: plan.changeClass,
        requiredCapabilities: plan.requiredCapabilities,
        lease,
        productionAllowed: false,
      })), worker);
      return Object.freeze({
        ok: true,
        executed: true,
        worker: worker.id,
        workerKind: worker.kind,
        executionPlane: worker.executionPlane,
        attemptedWorkers: Object.freeze([...attemptedWorkers]),
        failures: Object.freeze([...failures]),
        lease,
        receipt,
        plan,
      });
    } catch (error) {
      failures.push(Object.freeze({
        worker: worker.id,
        code: clean(error?.code || 'WORKER_EXECUTION_FAILED', 80),
        message: clean(error?.message || 'worker execution failed', 240),
      }));
    }
  }

  return Object.freeze({
    ok: false,
    executed: false,
    attemptedWorkers: Object.freeze([...attemptedWorkers]),
    failures: Object.freeze(failures),
    plan,
    reason: 'eligible_workers_exhausted',
  });
}

export function cloudFabricWorkerPolicySnapshot() {
  return Object.freeze({
    ...CLOUD_FABRIC_WORKER_POLICY,
    localWorker: Object.freeze({ ...CLOUD_FABRIC_WORKER_POLICY.localWorker }),
  });
}
