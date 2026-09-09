import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assessCapabilityRuntime,
  buildAutomationCandidate,
  buildCapabilityGraph,
  buildCapabilityProposal,
  buildExperienceRecord,
  detectAutomationPatterns,
  evaluateAutomationCandidate,
  findReusableComposition,
  getCapabilityGaps,
  getCapabilityEcosystemSummary,
  nextCapabilityState,
} from '../ekodi-capability-ecosystem.js';
import { EKODI_SELF_AUTOMATION_POLICY } from '../ekodi-self-automation-engine.js';
import { CAPABILITY_SANDBOX_POLICY, buildSandboxSuite, runCapabilitySandbox } from '../ekodi-capability-sandbox.js';

const verifiedExperience = (id, patternKey, risk = 'normal') => Object.freeze({
  id,
  patternKey,
  risk,
  verified: true,
  capabilityIds: Object.freeze(['core.automation']),
});

test('10G capability graph composes the registered ecosystem deterministically', () => {
  const graph = buildCapabilityGraph();
  assert.equal(graph.generationModel, 'ekodi-10g-capability-ecosystem');
  assert.ok(graph.capabilityCount >= 36);
  assert.ok(graph.packCount >= 11);
  assert.ok(graph.edgeCount > 0);
  assert.equal(graph.edges.every(edge => edge.relation === 'composes'), true);
});

test('10G graph reuses registered capabilities and reports unknown gaps without guessing', () => {
  const composition = findReusableComposition('marketing content campaign');
  assert.ok(composition.length > 0);
  assert.equal(composition.some(item => item.capability.id === 'business.marketing'), true);
  assert.deepEqual(getCapabilityGaps(['core.automation', 'unknown.synthetic.capability']), ['unknown.synthetic.capability']);
});

test('experience records keep structural fingerprints instead of raw user goals', () => {
  const record = buildExperienceRecord({
    taskId: 'task-private',
    goal: 'Fix https://private.example.com for secret@example.com order 12345',
    target: { capability: 'core.automation' },
    context: { source: 'chatgpt-mcp' },
  }, {
    taskId: 'task-private',
    state: 'verified',
    evidence: { verified: true },
  }, { occurredAt: '2026-09-09T07:00:00.000Z', durationMs: 42 });
  const serialized = JSON.stringify(record);
  assert.equal(record.patternKey, 'capability:core.automation');
  assert.equal(record.verified, true);
  assert.equal(serialized.includes('secret@example.com'), false);
  assert.equal(serialized.includes('private.example.com'), false);
  assert.equal(serialized.includes('12345'), false);
});
test('repeated verified work becomes a bounded automation candidate', () => {
  const records = [
    verifiedExperience('a', 'capability:core.automation'),
    verifiedExperience('b', 'capability:core.automation'),
    verifiedExperience('c', 'capability:core.automation'),
  ];
  const patterns = detectAutomationPatterns(records);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].occurrences, 3);
  assert.equal(patterns[0].successRate, 1);
  const candidate = buildAutomationCandidate(patterns[0]);
  assert.equal(candidate.state, 'candidate');
  assert.equal(candidate.productionMutation, false);
  assert.equal(candidate.authorityExpansion, false);
  assert.equal(candidate.proposalOnly, true);
  assert.deepEqual(candidate.capabilityGaps, []);
  assert.deepEqual(candidate.steps, [{ type: 'invoke_capability', capabilityId: 'core.automation' }]);
});

test('automation evaluation never directly promotes production and requires evidence', () => {
  const candidate = buildAutomationCandidate({
    patternKey: 'capability:core.automation', occurrences: 10, verifiedCount: 10,
    successRate: 1, risk: 'normal', capabilityIds: ['core.automation'],
  });
  const insufficient = evaluateAutomationCandidate(candidate, {
    testCount: 4, passed: 4, rollbackDefined: true, verificationDefined: true,
  });
  assert.equal(insufficient.verified, false);
  assert.equal(insufficient.promotion, 'blocked');
  const verified = evaluateAutomationCandidate(candidate, {
    testCount: 50, passed: 50, rollbackDefined: true, verificationDefined: true,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.promotion, 'pr_required');
  assert.equal(verified.directProductionPromotion, false);

  const highRisk = evaluateAutomationCandidate({ ...candidate, risk: 'high' }, {
    testCount: 100, passed: 100, rollbackDefined: true, verificationDefined: true,
  });
  assert.equal(highRisk.verified, true);
  assert.equal(highRisk.promotion, 'human_gate');
});

test('authority expansion or critical regressions block capability verification', () => {
  const candidate = buildAutomationCandidate({
    patternKey: 'capability:core.automation', occurrences: 20, verifiedCount: 20,
    successRate: 1, risk: 'low', capabilityIds: ['core.automation'],
  });
  const authority = evaluateAutomationCandidate(candidate, {
    testCount: 100, passed: 100, rollbackDefined: true,
    verificationDefined: true, authorityExpansion: true,
  });
  const regression = evaluateAutomationCandidate(candidate, {
    testCount: 100, passed: 100, rollbackDefined: true,
    verificationDefined: true, criticalRegressions: 1,
  });
  assert.equal(authority.verified, false);
  assert.equal(regression.verified, false);
});
test('runtime degradation quarantines a capability and recommends rollback', () => {
  const healthy = assessCapabilityRuntime({ samples: 20, successes: 19 });
  const degraded = assessCapabilityRuntime({ samples: 20, successes: 15 });
  assert.equal(healthy.state, 'active');
  assert.equal(degraded.state, 'quarantined');
  assert.equal(degraded.rollbackRecommended, true);
});

test('capability lifecycle cannot skip directly from candidate to active', () => {
  assert.equal(nextCapabilityState('candidate', 'active'), 'candidate');
  assert.equal(nextCapabilityState('candidate', 'sandboxed'), 'sandboxed');
  assert.equal(nextCapabilityState('verified', 'staged'), 'staged');
  assert.equal(nextCapabilityState('active', 'quarantined'), 'quarantined');
});

test('10G policy keeps learning autonomous and production authority guarded', () => {
  assert.equal(EKODI_SELF_AUTOMATION_POLICY.targetGeneration, 10);
  assert.equal(EKODI_SELF_AUTOMATION_POLICY.directProductionMutation, false);
  assert.equal(EKODI_SELF_AUTOMATION_POLICY.directAuthorityExpansion, false);
  assert.match(EKODI_SELF_AUTOMATION_POLICY.promotionPath, /PR -> CI -> staging -> guarded production/);
  const summary = getCapabilityEcosystemSummary([
    verifiedExperience('a', 'capability:core.automation'),
    verifiedExperience('b', 'capability:core.automation'),
    verifiedExperience('c', 'capability:core.automation'),
  ], [{ state: 'candidate' }]);
  assert.equal(summary.targetGeneration, 10);
  assert.equal(summary.automationPatternCount, 1);
  assert.equal(summary.productionAuthority, 'guarded-promotion-only');
  assert.equal(summary.selfAuthorityExpansion, false);
});
test('production runtime contains the additive ledger, admin control surface, and scheduled loop', () => {
  const migration = fs.readFileSync(new URL('../migrations/0076_capability_ecosystem.sql', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api-worker.js', import.meta.url), 'utf8');
  const gateway = fs.readFileSync(new URL('../core-ai-gateway.js', import.meta.url), 'utf8');
  const store = fs.readFileSync(new URL('../ekodi-capability-ecosystem-store.js', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS capability_experiences/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS capability_automation_candidates/);
  assert.match(store, /INSERT OR IGNORE INTO capability_experiences/);
  assert.match(api, /capability-ecosystem\/analyze/);
  assert.match(api, /analyzeCapabilityEcosystem\(env\.DB\)/);
  assert.match(gateway, /appendCapabilityExperience\(env\.DB, record\)/);
  assert.match(gateway, /core-ai-pulse/);
});
test('Capability Factory proposes missing abilities without activating or expanding authority', () => {
  const proposal = buildCapabilityProposal({ patternKey: 'goal:unhandled-repeat', risk: 'normal' });
  assert.match(proposal.proposedCapabilityId, /^automation\.generated\./);
  assert.equal(proposal.contract.actionTier, 'assist');
  assert.equal(proposal.sandboxRequired, true);
  assert.equal(proposal.registryRegistrationRequired, true);
  assert.equal(proposal.activationBlocked, true);
  assert.equal(proposal.registryMutationPerformed, false);
  assert.equal(proposal.authorityExpansion, false);
  const candidate = buildAutomationCandidate({
    patternKey: 'goal:unhandled-repeat', occurrences: 4, verifiedCount: 3,
    successRate: 0.75, risk: 'normal', capabilityIds: [],
  });
  assert.equal(candidate.capabilityProposal.proposedCapabilityId, proposal.proposedCapabilityId);
  assert.equal(candidate.steps[0].type, 'capability_gap');
});

test('contract sandbox produces benchmark evidence without granting verification', () => {
  const candidate = buildAutomationCandidate({
    patternKey: 'capability:core.automation', occurrences: 5, verifiedCount: 5,
    successRate: 1, risk: 'normal', capabilityIds: ['core.automation'],
  });
  const suite = buildSandboxSuite(candidate, { trials: 10 });
  assert.equal(suite.checks.allCapabilitiesRegistered, true);
  const run = runCapabilitySandbox(candidate, { trials: 10 });
  assert.equal(run.evaluation.state, 'sandboxed');
  assert.equal(run.evaluation.verified, false);
  assert.equal(run.evaluation.verificationScope, 'contract_safety');
  assert.equal(run.evaluation.promotion, 'functional_benchmark_required');
  assert.equal(run.externalExecutionPerformed, false);
  assert.equal(run.productionMutationPerformed, false);
  assert.equal(run.authorityExpansionPerformed, false);
});
test('sandbox blocks capability gaps and remains side-effect free', () => {
  const candidate = buildAutomationCandidate({
    patternKey: 'goal:new-gap', occurrences: 5, verifiedCount: 5,
    successRate: 1, risk: 'normal', capabilityIds: [],
  });
  const run = runCapabilitySandbox(candidate, { trials: 8 });
  assert.equal(run.suite.checks.allCapabilitiesRegistered, false);
  assert.equal(run.evaluation.promotion, 'blocked');
  assert.equal(run.evaluation.verified, false);
  assert.equal(CAPABILITY_SANDBOX_POLICY.externalExecution, false);
  assert.equal(CAPABILITY_SANDBOX_POLICY.directProductionMutation, false);
});

test('sandbox evidence has an additive production persistence lane', () => {
  const migration = fs.readFileSync(new URL('../migrations/0077_capability_sandbox_evidence.sql', import.meta.url), 'utf8');
  const store = fs.readFileSync(new URL('../ekodi-capability-ecosystem-store.js', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS capability_sandbox_runs/);
  assert.match(store, /INSERT OR REPLACE INTO capability_sandbox_runs/);
  assert.match(store, /SELECT 1 FROM capability_sandbox_runs LIMIT 0/);
});
