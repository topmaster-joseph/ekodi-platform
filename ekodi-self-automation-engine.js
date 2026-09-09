import {
  buildAutomationCandidate,
  buildCapabilityGraph,
  detectAutomationPatterns,
  getCapabilityEcosystemSummary,
} from './ekodi-capability-ecosystem.js';
import {
  capabilityEcosystemStoreSummary,
  listAutomationCandidates,
  listCapabilityExperiences,
  upsertAutomationCandidates,
} from './ekodi-capability-ecosystem-store.js';

export const EKODI_SELF_AUTOMATION_POLICY = Object.freeze({
  version: '1.0.0',
  targetGeneration: 10,
  automaticScope: Object.freeze(['observe', 'detect_pattern', 'compose_candidate', 'sandbox_recommendation']),
  directProductionMutation: false,
  directAuthorityExpansion: false,
  promotionPath: 'candidate -> sandbox -> verify -> PR -> CI -> staging -> guarded production',
});

export async function analyzeCapabilityEcosystem(db, options = {}) {
  const limit = Math.max(10, Math.min(1000, Math.trunc(Number(options.limit) || 500)));
  const experiences = await listCapabilityExperiences(db, { limit });
  const patterns = detectAutomationPatterns(experiences, {
    minOccurrences: options.minOccurrences,
  });
  const candidates = patterns.map(buildAutomationCandidate);
  await upsertAutomationCandidates(db, candidates);
  const [storedCandidates, store] = await Promise.all([
    listAutomationCandidates(db, { limit: 100 }),
    capabilityEcosystemStoreSummary(db),
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
    patterns,
    candidates: storedCandidates,
  });
}

export async function capabilityEcosystemSnapshot(db) {
  const [experiences, candidates, store] = await Promise.all([
    listCapabilityExperiences(db, { limit: 500 }),
    listAutomationCandidates(db, { limit: 100 }),
    capabilityEcosystemStoreSummary(db),
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
    candidates,
  });
}
