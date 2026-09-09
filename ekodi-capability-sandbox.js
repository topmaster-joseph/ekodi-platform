import { evaluateAutomationCandidate, getCapabilityNode } from './ekodi-capability-ecosystem.js';

const freeze = value => Object.freeze(value);
const clean = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

export const CAPABILITY_SANDBOX_POLICY = freeze({
  version: '1.0.0',
  isolation: 'contract-only-no-side-effects',
  minimumTrials: 5,
  defaultTrials: 10,
  directProductionMutation: false,
  externalExecution: false,
  authorityExpansion: false,
});

function inspectStep(step = {}) {
  if (step.type === 'capability_gap') {
    return freeze({ ok: false, reason: 'capability_gap', capabilityId: null });
  }
  if (step.type !== 'invoke_capability') {
    return freeze({ ok: false, reason: 'unsupported_step_type', capabilityId: null });
  }
  const capability = getCapabilityNode(step.capabilityId);
  if (!capability) return freeze({ ok: false, reason: 'unregistered_capability', capabilityId: clean(step.capabilityId) });
  return freeze({ ok: true, reason: 'registered_contract', capabilityId: capability.id, actionTier: capability.actionTier });
}
export function buildSandboxSuite(candidate = {}, options = {}) {
  const trials = Math.max(CAPABILITY_SANDBOX_POLICY.minimumTrials, Math.min(100, Math.trunc(Number(options.trials) || CAPABILITY_SANDBOX_POLICY.defaultTrials)));
  const steps = Array.isArray(candidate.steps) ? candidate.steps : [];
  const inspections = freeze(steps.map(inspectStep));
  return freeze({
    schemaVersion: 1,
    candidateId: clean(candidate.id, 120),
    trials,
    inspections,
    checks: freeze({
      candidateIsProposalOnly: candidate.proposalOnly === true,
      noProductionMutation: candidate.productionMutation === false,
      noAuthorityExpansion: candidate.authorityExpansion === false,
      rollbackRequired: candidate.rollbackRequired === true,
      verificationRequired: candidate.verificationRequired === true,
      allCapabilitiesRegistered: inspections.length > 0 && inspections.every(item => item.ok),
    }),
  });
}

export function runCapabilitySandbox(candidate = {}, options = {}) {
  const suite = buildSandboxSuite(candidate, options);
  const structuralPass = Object.values(suite.checks).every(Boolean);
  const passed = structuralPass ? suite.trials : 0;
  const evidence = freeze({
    testCount: suite.trials,
    passed,
    criticalRegressions: structuralPass ? 0 : 1,
    authorityExpansion: candidate.authorityExpansion === true,
    rollbackDefined: candidate.rollbackRequired === true,
    verificationDefined: candidate.verificationRequired === true,
  });
  const contractEvaluation = evaluateAutomationCandidate(candidate, evidence);
  const evaluation = freeze({
    ...contractEvaluation,
    state: 'sandboxed',
    verified: false,
    promotion: structuralPass ? 'functional_benchmark_required' : 'blocked',
    verificationScope: 'contract_safety',
  });
  return freeze({
    schemaVersion: 1,
    id: `sandbox_${suite.candidateId}_${Date.now()}`,
    candidateId: suite.candidateId,
    mode: CAPABILITY_SANDBOX_POLICY.isolation,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    suite,
    evidence,
    evaluation,
    promotion: evaluation.promotion,
    externalExecutionPerformed: false,
    productionMutationPerformed: false,
    authorityExpansionPerformed: false,
  });
}

export function sandboxSummary(runs = []) {
  const source = Array.isArray(runs) ? runs : [];
  return freeze({
    total: source.length,
    verified: source.filter(run => run?.evaluation?.verified === true).length,
    blocked: source.filter(run => run?.evaluation?.verified !== true).length,
    productionMutations: source.filter(run => run?.productionMutationPerformed === true).length,
    authorityExpansions: source.filter(run => run?.authorityExpansionPerformed === true).length,
  });
}
