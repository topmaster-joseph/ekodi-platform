import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_CONTROL_POLICY } from '../ai-control-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ai-change-orchestration-policy.json'), 'utf8'));

test('AI-ORCHESTRATE-001 uses need-based consultation while preserving origin and bounded parallel capacity', () => {
  assert.equal(policy.policyId, 'AI-ORCHESTRATE-001');
  assert.equal(policy.status, 'enforced');
  assert.ok(policy.schemaVersion >= 3);

  assert.equal(policy.execution.collaborationMode, 'adaptive');
  assert.equal(policy.execution.alwaysParallel, false);
  assert.equal(policy.consultationDecision.policyId, 'AI-CONSULT-001');
  assert.equal(policy.consultationDecision.mode, 'need-and-risk-based');
  assert.equal(policy.consultationDecision.completionClaimRequiresActualExecutionEvidence, true);
  assert.equal(policy.execution.maxParallelProviders, 5);
  assert.equal(policy.execution.originPreservation, true);
  assert.deepEqual(policy.execution.originEnvelopeFields, ['provider', 'requestedProvider', 'channel', 'requestId']);
  assert.equal(policy.execution.originFamilyPinnedIntoExecutionPlan, true);
  assert.equal(policy.execution.finalSynthesis, 'origin-family-provider');
  assert.equal(policy.execution.finalResponseRoute, 'origin-channel');
  assert.equal(policy.execution.finalSynthesisAddsNewSupplier, false);
});

test('machine-readable orchestration policy and AI runtime remain aligned', () => {
  assert.equal(AI_CONTROL_POLICY.defaultMode, 'parallel');
  assert.deepEqual([...AI_CONTROL_POLICY.modes], ['parallel']);
  assert.equal(AI_CONTROL_POLICY.maxParallelProviders, policy.execution.maxParallelProviders);
  assert.equal(AI_CONTROL_POLICY.maxParallelProviders, 5);
  assert.equal(AI_CONTROL_POLICY.originPreservation, policy.execution.originPreservation);
  assert.equal(AI_CONTROL_POLICY.originPreservation, true);
  assert.equal(AI_CONTROL_POLICY.finalSynthesisRole, 'origin-synthesis');
});
