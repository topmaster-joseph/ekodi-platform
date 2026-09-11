import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'ai-change-orchestration-policy.json'), 'utf8'));

test('consultation policy is need-based rather than always-parallel', () => {
  assert.equal(policy.execution.alwaysParallel, false);
  assert.equal(policy.execution.collaborationMode, 'adaptive');
  assert.equal(policy.consultationDecision.policyId, 'AI-CONSULT-001');
  assert.equal(policy.consultationDecision.mode, 'need-and-risk-based');
});

test('consultation completion requires actual evidence and private reasoning stays excluded', () => {
  assert.equal(policy.consultationDecision.plannedAndActualProvidersMustBeSeparate, true);
  assert.equal(policy.consultationDecision.completionClaimRequiresActualExecutionEvidence, true);
  assert.equal(policy.consultationDecision.zeroActualCallsMayNotClaimConsultationCompleted, true);
  assert.equal(policy.consultationDecision.privateReasoningExcluded, true);
  assert.equal(policy.consultationDecision.receiptRequired, true);
});

test('high-impact categories cannot silently skip consultation', () => {
  const forced = new Set(policy.consultationDecision.forcedMultiConsultCategories);
  for (const category of ['authentication', 'authorization', 'security', 'secrets', 'payment', 'permission', 'data_migration', 'destructive_data', 'production', 'deployment', 'dns']) {
    assert.equal(forced.has(category), true, category);
  }
});
