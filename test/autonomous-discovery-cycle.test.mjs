import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiscoveryReport,
  deriveSignalsFromWorkflowRuns,
  renderDiscoverySummary,
} from '../scripts/run-autonomous-discovery-cycle.mjs';

test('three repeated workflow failures become one autonomous research signal', () => {
  const runs = [
    { workflowName: 'Example Guard', conclusion: 'failure', createdAt: '2026-09-11T00:00:00Z', url: 'https://example.invalid/1' },
    { workflowName: 'Example Guard', conclusion: 'success', createdAt: '2026-09-11T01:00:00Z', url: 'https://example.invalid/2' },
    { workflowName: 'Example Guard', conclusion: 'timed_out', createdAt: '2026-09-11T02:00:00Z', url: 'https://example.invalid/3' },
    { workflowName: 'Example Guard', conclusion: 'failure', createdAt: '2026-09-11T03:00:00Z', url: 'https://example.invalid/4' },
  ];

  const signals = deriveSignalsFromWorkflowRuns(runs);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, 'repeated_error_pattern');
  assert.equal(signals[0].target, 'github-workflow:Example Guard');
  assert.equal(signals[0].count, 3);
});

test('fewer than three failures remain observation evidence, not a research candidate', () => {
  const runs = [
    { workflowName: 'Example Guard', conclusion: 'failure' },
    { workflowName: 'Example Guard', conclusion: 'failure' },
  ];
  assert.deepEqual(deriveSignalsFromWorkflowRuns(runs), []);
});

test('discovery report is explicitly non-mutating and cannot expand authority', () => {
  const runs = Array.from({ length: 3 }, (_, index) => ({
    workflowName: 'Repeated Guard',
    conclusion: 'failure',
    createdAt: `2026-09-11T0${index}:00:00Z`,
    url: `https://example.invalid/${index}`,
  }));
  const report = buildDiscoveryReport(runs);
  assert.equal(report.qualifyingSignals, 1);
  assert.equal(report.cycle.discovered, 1);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(report.authorityExpanded, false);
  assert.equal(report.cycle.productionMutationPerformed, false);
  assert.equal(report.cycle.authorityExpanded, false);
});

test('summary makes the human-governed production boundary visible', () => {
  const summary = renderDiscoverySummary(buildDiscoveryReport([]));
  assert.match(summary, /Production mutation: \*\*NO\*\*/);
  assert.match(summary, /Authority expansion: \*\*NO\*\*/);
  assert.match(summary, /Human-Governed/);
});
