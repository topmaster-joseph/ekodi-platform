import { evaluateAutomationCandidate, getCapabilityNode } from './ekodi-capability-ecosystem.js';
import { buildEkodiCapabilityExecutor } from './ekodi-capability-executor.js';

const freeze = value => Object.freeze(value);
const clean = (value, limit = 160) => String(value ?? '').trim().slice(0, limit);

export const CAPABILITY_SANDBOX_POLICY = freeze({
  version: '2.0.0',
  contractIsolation: 'contract-only-no-side-effects',
  functionalIsolation: 'isolated-sandbox-adapter-with-rollback',
  minimumTrials: 5,
  defaultTrials: 10,
  functionalMinimumTrials: 3,
  functionalDefaultTrials: 5,
  directProductionMutation: false,
  externalExecution: false,
  authorityExpansion: false,
  functionalAdapterRequirements: freeze(['sandboxSafe', 'execute', 'verify', 'rollback']),
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
    mode: CAPABILITY_SANDBOX_POLICY.contractIsolation,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    suite,
    evidence,
    evaluation,
    promotion: evaluation.promotion,
    externalExecutionPerformed: false,
    isolatedEffectPerformed: false,
    productionMutationPerformed: false,
    authorityExpansionPerformed: false,
  });
}

function functionalTrialCount(options = {}) {
  return Math.max(
    CAPABILITY_SANDBOX_POLICY.functionalMinimumTrials,
    Math.min(25, Math.trunc(Number(options.trials) || CAPABILITY_SANDBOX_POLICY.functionalDefaultTrials)),
  );
}

function functionalCapability(candidate = {}) {
  const steps = Array.isArray(candidate.steps) ? candidate.steps : [];
  const executable = steps
    .map(inspectStep)
    .filter(item => item.ok && String(item.actionTier || '').startsWith('execute'));
  if (executable.length !== 1) return null;
  return executable[0].capabilityId;
}

function sandboxAdapterAllowed(adapter) {
  return Boolean(
    adapter
    && adapter.sandboxSafe === true
    && typeof adapter.execute === 'function'
    && typeof adapter.verify === 'function'
    && typeof adapter.rollback === 'function',
  );
}

export async function runFunctionalCapabilitySandbox(candidate = {}, options = {}) {
  const contract = buildSandboxSuite(candidate, { trials: CAPABILITY_SANDBOX_POLICY.minimumTrials });
  const startedAt = new Date().toISOString();
  const capabilityId = functionalCapability(candidate);
  const adapter = options.adapter || options.adapters?.[capabilityId];
  const trials = functionalTrialCount(options);
  const structuralPass = Object.values(contract.checks).every(Boolean);

  if (!structuralPass || !capabilityId) {
    return freeze({
      schemaVersion: 1,
      id: `functional_sandbox_${contract.candidateId}_${Date.now()}`,
      candidateId: contract.candidateId,
      mode: CAPABILITY_SANDBOX_POLICY.functionalIsolation,
      startedAt,
      completedAt: new Date().toISOString(),
      evidence: freeze({ testCount: trials, passed: 0, rollbackPassed: 0, criticalRegressions: 1 }),
      evaluation: freeze({ state: 'blocked', verified: false, promotion: 'blocked', verificationScope: 'functional_effect' }),
      promotion: 'blocked',
      reason: !structuralPass ? 'contract_safety_failed' : 'exactly_one_executable_capability_required',
      externalExecutionPerformed: false,
      isolatedEffectPerformed: false,
      productionMutationPerformed: false,
      authorityExpansionPerformed: false,
    });
  }

  if (!sandboxAdapterAllowed(adapter)) {
    return freeze({
      schemaVersion: 1,
      id: `functional_sandbox_${contract.candidateId}_${Date.now()}`,
      candidateId: contract.candidateId,
      capabilityId,
      mode: CAPABILITY_SANDBOX_POLICY.functionalIsolation,
      startedAt,
      completedAt: new Date().toISOString(),
      evidence: freeze({ testCount: trials, passed: 0, rollbackPassed: 0, criticalRegressions: 1 }),
      evaluation: freeze({ state: 'blocked', verified: false, promotion: 'blocked', verificationScope: 'functional_effect' }),
      promotion: 'blocked',
      reason: 'sandbox_safe_execute_verify_rollback_adapter_required',
      externalExecutionPerformed: false,
      isolatedEffectPerformed: false,
      productionMutationPerformed: false,
      authorityExpansionPerformed: false,
    });
  }

  const executor = buildEkodiCapabilityExecutor({ adapters: { [capabilityId]: adapter } });
  const trialResults = [];

  for (let index = 0; index < trials; index += 1) {
    const workspaceId = `sandbox_${contract.candidateId || 'candidate'}_${index + 1}`;
    const execution = await executor.execute({
      taskId: `sandbox_trial_${index + 1}`,
      capabilityId,
      goal: clean(candidate.goal || candidate.description || candidate.id, 1200),
      target: freeze({ workspaceId, capability: capabilityId, surface: 'sandbox' }),
      authority: freeze({
        personId: 'ekodi-functional-sandbox',
        workspaceId,
        role: 'sandbox-executor',
        capabilityGrants: freeze([capabilityId]),
      }),
      delegation: freeze({ allowed: true, reversible: true, audited: true, preflightVerified: true, verificationDefined: true }),
      risk: 'low',
      event: freeze({ changeClass: 'green', requiresHumanDecision: false }),
      payload: freeze({ candidateId: contract.candidateId, trial: index + 1, sandbox: true }),
    });

    let rollback = freeze({ attempted: false, succeeded: false, reason: 'execution_not_verified' });
    if (execution.state === 'verified' && execution.executionReceipt && execution.verificationEvidence?.passed === true) {
      try {
        const result = await adapter.rollback(freeze({
          sandbox: true,
          candidateId: contract.candidateId,
          trial: index + 1,
          capabilityId,
          receipt: execution.executionReceipt,
          reason: 'functional_sandbox_cleanup',
        }));
        rollback = freeze({
          attempted: true,
          succeeded: result?.succeeded === true,
          rollbackId: clean(result?.rollbackId, 160) || null,
        });
      } catch (error) {
        rollback = freeze({ attempted: true, succeeded: false, reason: clean(error?.message || error, 300) || 'rollback_failed' });
      }
    }

    trialResults.push(freeze({
      trial: index + 1,
      state: execution.state,
      executionReceipt: execution.executionReceipt || null,
      verificationEvidence: execution.verificationEvidence || null,
      rollback,
      passed: execution.state === 'verified' && execution.verificationEvidence?.passed === true && rollback.succeeded === true,
    }));
  }

  const passed = trialResults.filter(item => item.passed).length;
  const rollbackPassed = trialResults.filter(item => item.rollback.succeeded === true).length;
  const verified = passed === trials && rollbackPassed === trials;
  const evidence = freeze({
    testCount: trials,
    passed,
    rollbackPassed,
    criticalRegressions: verified ? 0 : trials - passed,
    isolatedEffects: trialResults.filter(item => item.executionReceipt?.effectPerformed === true).length,
    authorityExpansion: false,
    productionMutation: false,
  });
  const evaluation = freeze({
    state: verified ? 'verified' : 'failed',
    verified,
    promotion: verified ? 'architecture_benchmark_required' : 'blocked',
    verificationScope: 'functional_effect_and_rollback',
  });

  return freeze({
    schemaVersion: 1,
    id: `functional_sandbox_${contract.candidateId}_${Date.now()}`,
    candidateId: contract.candidateId,
    capabilityId,
    mode: CAPABILITY_SANDBOX_POLICY.functionalIsolation,
    startedAt,
    completedAt: new Date().toISOString(),
    contract,
    trials: freeze(trialResults),
    evidence,
    evaluation,
    promotion: evaluation.promotion,
    externalExecutionPerformed: false,
    isolatedEffectPerformed: evidence.isolatedEffects > 0,
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
    isolatedEffects: source.filter(run => run?.isolatedEffectPerformed === true).length,
  });
}
