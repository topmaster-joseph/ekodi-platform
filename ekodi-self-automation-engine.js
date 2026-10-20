import {
  buildAutomationCandidate,
  buildCapabilityGraph,
  detectAutomationPatterns,
  getCapabilityEcosystemSummary,
} from './ekodi-capability-ecosystem.js';
import { runCapabilitySandbox, runFunctionalCapabilitySandbox, sandboxSummary } from './ekodi-capability-sandbox.js';
import { buildSandboxAdapterRegistry, hasSandboxAdapter } from './ekodi-capability-sandbox-adapters.js';
import { buildCapabilityAccumulationQueue, prepareFoundrySandboxBatch } from './ekodi-capability-accumulation.js';
import {
  capabilityEcosystemStoreSummary,
  listAutomationCandidates,
  listCapabilityExperiences,
  listSandboxRuns,
  persistSandboxRun,
  sandboxStoreSummary,
  upsertAutomationCandidates,
} from './ekodi-capability-ecosystem-store.js';

export const EKODI_SELF_AUTOMATION_POLICY = Object.freeze({
  version: '1.1.0',
  targetGeneration: 10,
  automaticScope: Object.freeze(['observe', 'detect_pattern', 'compose_candidate', 'contract_sandbox', 'functional_sandbox']),
  directProductionMutation: false,
  directAuthorityExpansion: false,
  promotionPath: 'candidate -> contract sandbox -> functional sandbox -> verify -> PR -> CI -> staging -> guarded production',
});
async function runPendingContractSandboxes(db, candidates = [], options = {}) {
  const priorRuns = await listSandboxRuns(db, { limit: 200 });
  const alreadyBenchmarked = new Set(priorRuns.map(run => run.candidateId));
  const selected = candidates.filter(candidate => options.forceSandbox === true || !alreadyBenchmarked.has(candidate.id));
  const runs = [];
  for (const candidate of selected) {
    const run = runCapabilitySandbox(candidate, { trials: options.sandboxTrials });
    await persistSandboxRun(db, run);
    runs.push(run);
  }
  return Object.freeze(runs);
}

function adapterBackedCapabilityId(candidate = {}) {
  const steps = Array.isArray(candidate.steps) ? candidate.steps : [];
  const supported = steps
    .filter(step => step?.type === 'invoke_capability' && hasSandboxAdapter(step.capabilityId))
    .map(step => String(step.capabilityId));
  return supported.length === 1 ? supported[0] : null;
}

/**
 * Promote contract-passing candidates into the functional sandbox, where the
 * effect is actually performed, verified and rolled back in isolation.
 *
 * Without this stage a candidate stops at `functional_benchmark_required`
 * forever: the contract sandbox can only inspect a candidate's shape, never its
 * behaviour. Only capabilities with a registered sandbox-safe adapter run here.
 */
async function runPendingFunctionalSandboxes(db, contractRuns = [], candidates = [], options = {}) {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const runs = [];
  for (const contractRun of contractRuns) {
    if (contractRun?.evaluation?.promotion !== 'functional_benchmark_required') continue;
    const candidate = byId.get(contractRun.candidateId);
    if (!candidate) continue;
    const capabilityId = adapterBackedCapabilityId(candidate);
    if (!capabilityId) continue;
    const registry = buildSandboxAdapterRegistry({ capabilityIds: [capabilityId] });
    const run = await runFunctionalCapabilitySandbox(candidate, {
      adapter: registry[capabilityId],
      trials: options.functionalSandboxTrials,
    });
    await persistSandboxRun(db, run);
    runs.push(run);
  }
  return Object.freeze(runs);
}

export async function analyzeCapabilityEcosystem(db, options = {}) {
  const limit = Math.max(10, Math.min(1000, Math.trunc(Number(options.limit) || 500)));
  const experiences = await listCapabilityExperiences(db, { limit });
  const patterns = detectAutomationPatterns(experiences, { minOccurrences: options.minOccurrences });
  const candidates = patterns.map(buildAutomationCandidate);
  await upsertAutomationCandidates(db, candidates);
  const storedCandidates = await listAutomationCandidates(db, { limit: 100 });
  const newSandboxRuns = await runPendingContractSandboxes(db, storedCandidates, options);
  const newFunctionalRuns = await runPendingFunctionalSandboxes(db, newSandboxRuns, storedCandidates, options);
  const [store, sandboxStore, sandboxRuns] = await Promise.all([
    capabilityEcosystemStoreSummary(db),
    sandboxStoreSummary(db),
    listSandboxRuns(db, { limit: 100 }),
  ]);
  const accumulationQueue = buildCapabilityAccumulationQueue({ candidates: storedCandidates });
  const foundryBatch = prepareFoundrySandboxBatch(accumulationQueue);
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetGeneration: 10,
    system: 'ekodi-self-automation-engine',
    policy: EKODI_SELF_AUTOMATION_POLICY,
    graph: buildCapabilityGraph(),
    summary: getCapabilityEcosystemSummary(experiences, storedCandidates),
    store,
    sandbox: Object.freeze({
      store: sandboxStore,
      summary: sandboxSummary(sandboxRuns),
      newRuns: newSandboxRuns,
      newFunctionalRuns,
      recentRuns: sandboxRuns,
    }),
    patterns,
    candidates: storedCandidates,
    accumulation: Object.freeze({
      queue: accumulationQueue,
      foundrySandboxBatch: foundryBatch,
      automaticServiceCreation: false,
    }),
  });
}
export async function capabilityEcosystemSnapshot(db) {
  const [experiences, candidates, store, sandboxStore, sandboxRuns] = await Promise.all([
    listCapabilityExperiences(db, { limit: 500 }),
    listAutomationCandidates(db, { limit: 100 }),
    capabilityEcosystemStoreSummary(db),
    sandboxStoreSummary(db),
    listSandboxRuns(db, { limit: 100 }),
  ]);
  const accumulationQueue = buildCapabilityAccumulationQueue({ candidates });
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    targetGeneration: 10,
    system: 'ekodi-capability-ecosystem',
    policy: EKODI_SELF_AUTOMATION_POLICY,
    graph: buildCapabilityGraph(),
    summary: getCapabilityEcosystemSummary(experiences, candidates),
    store,
    sandbox: Object.freeze({ store: sandboxStore, summary: sandboxSummary(sandboxRuns), recentRuns: sandboxRuns }),
    candidates,
    accumulation: Object.freeze({
      queue: accumulationQueue,
      foundrySandboxBatch: prepareFoundrySandboxBatch(accumulationQueue),
      automaticServiceCreation: false,
    }),
  });
}
