import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEkodiConsultationReceipt,
  decideEkodiConsultation,
  sanitizeConsultationPublicValue,
  summarizeConsultationExecution,
} from '../ai-consultation-governance.js';
import { buildEkodiCommandPlan } from '../ekodi-command-plane.js';

const provider = (id, capabilities = ['text', 'reasoning', 'review']) => ({
  id,
  available: true,
  priority: 1,
  capabilities,
  costClass: 'core-only',
  invoke: async () => ({ ok: true }),
});

test('read-only deterministic work does not require consultation', () => {
  const decision = decideEkodiConsultation({ goal: '현재 상태 조회', risk: 'low', readOnly: true });
  assert.equal(decision.status, 'not_required');
  assert.equal(decision.requirements.consultationProviders, 0);
});

test('ordinary reversible mutation receives a single review', () => {
  const decision = decideEkodiConsultation({ goal: '일반 UI 문구 수정', risk: 'normal', mutation: true });
  assert.equal(decision.status, 'single_review');
  assert.equal(decision.requirements.sentinel, true);
});

test('security, auth, payment and production changes force multi consultation', () => {
  for (const goal of ['OAuth 인증 변경', '결제 정책 변경', '운영 배포']) {
    const decision = decideEkodiConsultation({ goal, risk: 'normal', mutation: true });
    assert.equal(decision.status, 'multi_consult', goal);
    assert.equal(decision.forced, true, goal);
  }
});

test('critical risk or low router confidence escalates consultation', () => {
  assert.equal(decideEkodiConsultation({ goal: '구조 변경', risk: 'critical', mutation: true }).status, 'reverified');
  assert.equal(decideEkodiConsultation({ goal: '일반 변경', risk: 'normal', mutation: true, routerScore: 40 }).status, 'multi_consult');
});

test('planned provider capacity is not treated as actual consultation', () => {
  const decision = decideEkodiConsultation({ goal: 'OAuth 인증 변경', risk: 'normal', mutation: true });
  const execution = summarizeConsultationExecution({ plan: { consultationDecision: decision }, specialists: [], sentinel: null });
  assert.equal(execution.status, 'failed');
  assert.equal(execution.actualCallCount, 0);
  assert.equal(execution.actualProviderCount, 0);
});

test('actual multi-provider evidence can claim consultation complete', () => {
  const decision = decideEkodiConsultation({ goal: 'OAuth 인증 변경', risk: 'normal', mutation: true });
  const execution = summarizeConsultationExecution({
    plan: { consultationDecision: decision },
    specialists: [
      { role: 'planner', provider: 'alpha', mode: 'ai', ok: true },
      { role: 'operator', provider: 'beta', mode: 'ai', ok: true },
    ],
    sentinel: { role: 'sentinel', provider: 'gamma', mode: 'ai', ok: true },
  });
  assert.equal(execution.status, 'multi_consult');
  assert.equal(execution.actualProviderCount, 3);
  assert.equal(execution.consultationProviderCount, 2);
});

test('command plan uses consultation decision to limit fanout', () => {
  const providers = [provider('alpha'), provider('beta'), provider('gamma')];
  const simple = buildEkodiCommandPlan({ taskId: 'simple', goal: '상태 조회', risk: 'low', readOnly: true }, providers);
  assert.equal(simple.consultationDecision.status, 'not_required');
  assert.equal(simple.parallel, false);
  assert.equal(simple.assignments.length, 1);
  assert.equal(simple.sentinelProvider, null);

  const protectedPlan = buildEkodiCommandPlan({ taskId: 'auth', goal: 'OAuth 인증 변경', risk: 'normal', mutation: true }, providers);
  assert.equal(protectedPlan.consultationDecision.status, 'multi_consult');
  assert.equal(protectedPlan.parallel, true);
  assert.notEqual(protectedPlan.sentinelProvider, null);
});

test('receipt excludes private reasoning and carries a tamper-evident hash link', async () => {
  const decision = decideEkodiConsultation({ goal: '상태 조회', risk: 'low', readOnly: true });
  const receipt = await buildEkodiConsultationReceipt({
    task: { id: 'task-1', goal: '상태 조회', risk: 'low', context: { chainOfThought: 'never expose' } },
    result: {
      state: 'verified',
      plan: { consultationDecision: decision },
      specialists: [{ role: 'operator', provider: 'alpha', mode: 'ai', ok: true, reasoning: 'hidden' }],
      consensus: { summary: '검증됨', rawReasoning: 'hidden' },
    },
    attempt: 2,
    previousHash: 'abc123',
    createdAt: '2026-09-10T00:00:00.000Z',
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.execution.status, 'not_required');
  assert.equal(receipt.previousHash, 'abc123');
  assert.equal(receipt.hash.length >= 8, true);
  assert.equal(serialized.includes('never expose'), false);
  assert.equal(serialized.includes('rawReasoning'), false);
  assert.equal(receipt.links.detail, '/api/control/ai/v8/tasks/task-1/consultation');
});

test('public sanitizer removes private reasoning fields recursively', () => {
  const value = sanitizeConsultationPublicValue({
    summary: 'safe',
    nested: { reasoning: 'private', evidence: 'public' },
  });
  assert.deepEqual(value, { summary: 'safe', nested: { evidence: 'public' } });
});
