import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiOrchestrationPlan,
  buildEkodiAiOrchestrator,
} from '../ai-orchestrator-runtime.js';

function provider(id, priority, value, capabilities = ['text']) {
  return {
    id,
    priority,
    capabilities,
    available: true,
    costClass: 'account-managed',
    async invoke({ context }) {
      return { text: value, role: context?.collaboration?.role || '' };
    },
  };
}

test('orchestration plan chooses the highest-priority eligible provider', () => {
  const plan = buildAiOrchestrationPlan({ taskName: 'plan.primary' }, [
    provider('second', 20, 'second'),
    provider('first', 10, 'first'),
  ]);
  assert.equal(plan.mode, 'primary');
  assert.equal(plan.primaryProvider, 'first');
  assert.equal(plan.reviewerProvider, null);
});

test('high-risk orchestration requests an independent second provider review', () => {
  const plan = buildAiOrchestrationPlan({ taskName: 'plan.review', risk: 'high' }, [
    provider('primary', 10, 'primary'),
    provider('reviewer', 20, 'reviewer'),
  ]);
  assert.equal(plan.mode, 'review');
  assert.equal(plan.primaryProvider, 'primary');
  assert.equal(plan.reviewerProvider, 'reviewer');
  assert.equal(plan.reviewAvailable, true);
});

test('review augments the primary result without silently replacing it', async () => {
  const orchestrator = buildEkodiAiOrchestrator({}, [
    provider('primary', 10, 'primary-answer'),
    provider('reviewer', 20, 'review-answer'),
  ]);
  const result = await orchestrator.run({
    taskName: 'run.review',
    risk: 'high',
    fallback: () => ({ text: 'fallback' }),
  });
  assert.equal(result.mode, 'ai');
  assert.equal(result.provider, 'primary');
  assert.equal(result.value.text, 'primary-answer');
  assert.equal(result.orchestration.reviewer.provider, 'reviewer');
  assert.equal(result.orchestration.reviewer.value.text, 'review-answer');
  assert.equal(result.orchestration.reviewDegraded, false);
});

test('capability requirements exclude providers that cannot perform the task', () => {
  const plan = buildAiOrchestrationPlan({
    taskName: 'plan.vision',
    requiredCapabilities: ['vision'],
  }, [
    provider('text-only', 10, 'text', ['text']),
    provider('vision', 20, 'vision', ['text', 'vision']),
  ]);
  assert.equal(plan.primaryProvider, 'vision');
  assert.deepEqual(plan.eligibleProviders, ['vision']);
});

test('AI_PROVIDER=NONE preserves the non-AI fallback path', async () => {
  let invoked = 0;
  const orchestrator = buildEkodiAiOrchestrator({ AI_PROVIDER: 'NONE' }, [{
    id: 'blocked-provider',
    priority: 1,
    capabilities: ['text'],
    async invoke() {
      invoked += 1;
      return { text: 'must-not-run' };
    },
  }]);
  const result = await orchestrator.run({
    taskName: 'run.none',
    fallback: () => ({ text: 'core-fallback' }),
  });
  assert.equal(invoked, 0);
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.value.text, 'core-fallback');
});


test('prompt-native providers receive the actual user request rather than an empty prompt', async () => {
  const received = [];
  const orchestrator = buildEkodiAiOrchestrator({}, [{
    id: 'prompt-native', priority: 1, capabilities: ['text'],
    costClass: 'account-managed', available: true,
    async invoke({ prompt, taskName, context }) {
      received.push({ prompt, taskName, context });
      return { text: 'handled' };
    },
  }]);
  const result = await orchestrator.run({
    taskName: 'admin-assist',
    context: { message: '관리자 페이지 오류를 점검해 줘' },
    fallback: () => ({ text: 'fallback' }),
  });
  assert.equal(result.mode, 'ai');
  assert.equal(received.length, 1);
  assert.equal(received[0].taskName, 'admin-assist');
  assert.match(received[0].prompt, /관리자 페이지 오류를 점검해 줘/);
  assert.equal(received[0].context.message, '관리자 페이지 오류를 점검해 줘');
});

test('independent reviewer receives a meaningful request, review instruction and primary evidence', async () => {
  const seen = [];
  const makeProvider = (id, priority) => ({
    id, priority, capabilities: ['text'], costClass: 'account-managed', available: true,
    async invoke(input) { seen.push({ id, ...input }); return { text: id + '-answer' }; },
  });
  const orchestrator = buildEkodiAiOrchestrator({}, [
    makeProvider('primary-prompt', 1), makeProvider('review-prompt', 2),
  ]);
  const result = await orchestrator.run({
    taskName: 'task_pulse_test', risk: 'high',
    context: { commandGoal: '시민의견 저장 문제를 분석', commandPlane: { objective: 'Analyze without modifying production' } },
    fallback: () => ({ text: 'fallback' }),
  });
  assert.equal(result.mode, 'ai');
  assert.equal(seen.length, 2);
  assert.match(seen[0].prompt, /시민의견 저장 문제를 분석/);
  assert.match(seen[0].prompt, /Analyze without modifying production/);
  assert.match(seen[1].prompt, /시민의견 저장 문제를 분석/);
  assert.match(seen[1].prompt, /Independently review/);
  assert.equal(seen[1].context.collaboration.primaryValue.text, 'primary-prompt-answer');
});
