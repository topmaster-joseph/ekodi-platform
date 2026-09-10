import {
  buildAutomationCandidate,
  buildCapabilityGraph,
  detectAutomationPatterns,
  getCapabilityEcosystemSummary,
} from './ekodi-capability-ecosystem.js';
import { runCapabilitySandbox, sandboxSummary } from './ekodi-capability-sandbox.js';
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
  automaticScope: Object.freeze(['observe', 'detect_pattern', 'compose_candidate', 'contract_sandbox']),
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

export async function analyzeCapabilityEcosystem(db, options = {}) {
  const limit = Math.max(10, Math.min(1000, Math.trunc(Number(options.limit) || 500)));
  const experiences = await listCapabilityExperiences(db, { limit });
  const patterns = detectAutomationPatterns(experiences, { minOccurrences: options.minOccurrences });
  const candidates = patterns.map(buildAutomationCandidate);
  await upsertAutomationCandidates(db, candidates);
  const storedCandidates = await listAutomationCandidates(db, { limit: 100 });
  const newSandboxRuns = await runPendingContractSandboxes(db, storedCandidates, options);
  const [store, sandboxStore, sandboxRuns] = await Promise.all([
    capabilityEcosystemStoreSummary(db),
    sandboxStoreSummary(db),
    listSandboxRuns(db, { limit: 100 }),
  ]);
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
      recentRuns: sandboxRuns,
    }),
    patterns,
    candidates: storedCandidates,
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
  });
}
