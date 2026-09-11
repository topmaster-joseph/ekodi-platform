import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkflowResearchEvidence,
  collectResearchEvidence,
} from '../scripts/collect-autonomous-research-evidence.mjs';

const program = {
  id: 'adr_example',
  signal: {
    target: 'github-workflow:Example Guard',
    evidenceRefs: ['https://github.com/example/repo/actions/runs/1'],
  },
};

const runs = [
  { databaseId: 1, workflowName: 'Example Guard', conclusion: 'failure', url: 'https://github.com/example/repo/actions/runs/1' },
  { databaseId: 2, workflowName: 'Example Guard', conclusion: 'failure', url: 'https://github.com/example/repo/actions/runs/2' },
  { databaseId: 3, workflowName: 'Example Guard', conclusion: 'timed_out', url: 'https://github.com/example/repo/actions/runs/3' },
  { databaseId: 4, workflowName: 'Example Guard', conclusion: 'success', url: 'https://github.com/example/repo/actions/runs/4' },
  { databaseId: 5, workflowName: 'Other Guard', conclusion: 'failure', url: 'https://github.com/example/repo/actions/runs/5' },
];

const jobsByRunId = {
  1: [{ name: 'policy', conclusion: 'failure', steps: [{ name: 'validate branch', conclusion: 'failure' }] }],
  2: [{ name: 'policy', conclusion: 'failure', steps: [{ name: 'validate branch', conclusion: 'failure' }] }],
  3: [{ name: 'policy', conclusion: 'timed_out', steps: [{ name: 'validate branch', conclusion: 'timed_out' }] }],
};

test('collector localizes repeated failures to workflow jobs and steps', () => {
  const evidence = buildWorkflowResearchEvidence(program, runs, jobsByRunId);
  assert.equal(evidence.failedRuns, 3);
  assert.equal(evidence.recoveredRuns, 1);
  assert.deepEqual(evidence.failedJobs, ['policy']);
  assert.deepEqual(evidence.failedSteps, ['validate branch']);
  assert.equal(evidence.recurrence.repeatedJob, true);
  assert.equal(evidence.recurrence.repeatedStep, true);
  assert.equal(evidence.reproducible, true);
  assert.equal(evidence.productionMutationPerformed, false);
  assert.equal(evidence.authorityExpanded, false);
});

test('collector keeps evidence scoped to the discovered workflow target', () => {
  const evidence = buildWorkflowResearchEvidence(program, runs, jobsByRunId);
  assert.equal(evidence.workflowName, 'Example Guard');
  assert.equal(evidence.observations, 4);
  assert.equal(evidence.evidenceRefs.some(ref => ref.endsWith('/5')), false);
});

test('research evidence report is keyed by stable discovery research id', () => {
  const report = collectResearchEvidence({ cycle: { researchPrograms: [program] } }, runs, jobsByRunId);
  assert.equal(report.researchPrograms, 1);
  assert.ok(report.evidenceByResearchId.adr_example);
  assert.equal(report.evidenceByResearchId.adr_example.reproducible, true);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.authorityExpanded, false);
});
