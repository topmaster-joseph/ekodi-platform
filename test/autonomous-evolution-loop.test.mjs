import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvolutionCandidate,
  buildLearningRecord,
  designBoundedExperiment,
  evaluateBoundedExperiment,
  evaluateResearchEvidence,
  lifecycleFromRecommendation,
  runAutonomousEvolutionLoop,
  verifyEvolutionOutcome,
} from '../ekodi-autonomous-evolution-loop.js';

const program = {
  id: 'adr_repeated_error_pattern_example',
  signal: {
    target: 'github-workflow:Example Guard',
    evidenceRefs: ['https://github.com/example/repo/actions/runs/1'],
  },
  question: 'What root cause is producing the repeated error pattern?',
};

function verifiedResearch() {
  return evaluateResearchEvidence(program, {
    failedRuns: 4,
    recoveredRuns: 2,
    failedJobs: ['policy'],
    failedSteps: ['validate'],
    reproducible: true,
    evidenceRefs: [
      'https://github.com/example/repo/actions/runs/2',
      'https://github.com/example/repo/actions/runs/3',
      'https://github.com/example/repo/actions/runs/4',
    ],
  });
}

function passingExperiment(research = verifiedResearch()) {
  const experiment = designBoundedExperiment(research);
  const evaluation = evaluateBoundedExperiment(experiment, {
    functionalScorePct: 96,
    regressionScorePct: 98,
    securityIntegrityPct: 100,
    reproducibilityPct: 96,
    rollbackVerified: true,
    costControlPct: 95,
    evidenceRefs: ['https://github.com/example/repo/actions/runs/experiment'],
  });
  return { experiment, evaluation };
}

test('research cannot become an experiment before evidence threshold is met', () => {
  const research = evaluateResearchEvidence(program, {
    failedRuns: 2,
    evidenceRefs: ['https://github.com/example/repo/actions/runs/1'],
  });
  assert.equal(research.verified, false);
  assert.equal(research.status, 'research_evidence_required');
  const experiment = designBoundedExperiment(research);
  assert.equal(experiment.executableAutonomously, false);
  assert.equal(experiment.status, 'experiment_blocked_unverified_research');
});

test('recurrent localized evidence verifies research and designs bounded experiment only', () => {
  const research = verifiedResearch();
  assert.equal(research.verified, true);
  assert.ok(research.confidence >= 70);
  const experiment = designBoundedExperiment(research);
  assert.equal(experiment.executableAutonomously, true);
  assert.equal(experiment.environment, 'isolated_task_branch_or_sandbox');
  assert.equal(experiment.productionMutationAllowed, false);
  assert.equal(experiment.authorityExpansionAllowed, false);
});

test('experiment requires functional, regression, security, reproducibility and rollback proof', () => {
  const research = verifiedResearch();
  const experiment = designBoundedExperiment(research);
  const failed = evaluateBoundedExperiment(experiment, {
    functionalScorePct: 96,
    regressionScorePct: 98,
    securityIntegrityPct: 100,
    reproducibilityPct: 96,
    rollbackVerified: false,
    costControlPct: 95,
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.status, 'experiment_failed_or_incomplete');

  const { evaluation } = passingExperiment(research);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.boundarySafe, true);
});

test('only a passed bounded experiment creates a Super Admin review candidate', () => {
  const research = verifiedResearch();
  const rejected = buildEvolutionCandidate(research, { passed: false, researchId: research.researchId });
  assert.equal(rejected.readyForSuperAdminReview, false);

  const { evaluation } = passingExperiment(research);
  const candidate = buildEvolutionCandidate(research, evaluation);
  assert.equal(candidate.readyForSuperAdminReview, true);
  assert.equal(candidate.status, 'evolution_candidate_ready_for_super_admin_review');
  assert.equal(candidate.governance.productionApprovalRequired, true);
  assert.equal(candidate.governance.automaticPromotionAllowed, false);
});

test('post-change verification requires Super Admin approval and strong production evidence', () => {
  const research = verifiedResearch();
  const { evaluation } = passingExperiment(research);
  const candidate = buildEvolutionCandidate(research, evaluation);

  const pending = verifyEvolutionOutcome(candidate, {
    deployed: true,
    superAdminApproved: false,
    healthScorePct: 98,
    objectiveScorePct: 98,
    regressionScorePct: 98,
    securityIntegrityPct: 100,
    rollbackReady: true,
  });
  assert.equal(pending.verified, false);
  assert.equal(pending.rollbackRequired, true);

  const verified = verifyEvolutionOutcome(candidate, {
    deployed: true,
    superAdminApproved: true,
    healthScorePct: 98,
    objectiveScorePct: 96,
    regressionScorePct: 98,
    securityIntegrityPct: 100,
    rollbackReady: true,
    evidenceRefs: ['https://github.com/example/repo/actions/runs/post-deploy'],
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, 'post_change_verified');
  const learning = buildLearningRecord({ research, experimentEvaluation: evaluation, candidate, verification: verified });
  assert.equal(learning.status, 'learning_loop_closed');
});

test('scheduled lifecycle does not pretend a research design is a completed evolution', () => {
  const report = runAutonomousEvolutionLoop({
    researchPrograms: [program],
    evidenceByResearchId: {
      [program.id]: {
        failedRuns: 4,
        recoveredRuns: 1,
        failedJobs: ['policy'],
        reproducible: true,
        evidenceRefs: ['https://github.com/example/repo/actions/runs/2'],
      },
    },
  });
  assert.equal(report.summary.researchVerified, 1);
  assert.equal(report.summary.experimentsReady, 1);
  assert.equal(report.summary.experimentsPassed, 0);
  assert.equal(report.summary.candidatesReady, 0);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.authorityExpanded, false);
  assert.equal(report.automaticPromotionPerformed, false);
});

test('existing Evolution Intelligence recommendations enter the same lifecycle without bypassing experiment evidence', () => {
  const record = lifecycleFromRecommendation({
    id: 'evo_123',
    target: 'api',
    title: 'Reduce repeated latency',
    confidence: 92,
    evidenceGrade: 'A',
    publishable: true,
    references: [{ url: 'https://example.com/evidence' }],
  });
  assert.equal(record.research.verified, true);
  assert.equal(record.experiment.executableAutonomously, true);
  assert.equal(record.candidate, null);
  assert.equal(record.status, 'awaiting_bounded_experiment_evidence');
});
