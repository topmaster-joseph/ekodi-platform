import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_CONTROL_POLICY } from '../ai-control-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ai-change-orchestration-policy.json'), 'utf8'));

test('AI-ORCHESTRATE-001 is locked to origin-preserving five-way parallel execution', () => {
  assert.equal(policy.policyId, 'AI-ORCHESTRATE-001');
  assert.equal(policy.status, 'enforced');
  assert.ok(policy.schemaVersion >= 3);

  assert.equal(policy.execution.collaborationMode, 'parallel');
  assert.equal(policy.execution.alwaysParallel, true);
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
