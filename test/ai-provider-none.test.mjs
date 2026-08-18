import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_RESILIENCE_POLICY,
  getAiResilienceStatus,
  isAiProviderDisabled,
  resetAiResilienceCircuitsForTest,
  runAiEnhancedTask,
} from '../ai-resilience-runtime.js';

const NONE_ENV = Object.freeze({ AI_PROVIDER: 'NONE' });

test('AI_PROVIDER=NONE disables providers without throwing or invoking them', async () => {
  resetAiResilienceCircuitsForTest();
  let invoked = 0;
  const result = await runAiEnhancedTask({
    env: NONE_ENV,
    taskName: 'survival.none',
    providers: [{ id: 'paid-provider', invoke: async () => { invoked += 1; throw new Error('must not run'); } }],
    fallback: async () => ({ template: 'free-assist' }),
  });

  assert.equal(invoked, 0);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.degraded, true);
  assert.equal(result.provider, null);
  assert.deepEqual(result.value, { template: 'free-assist' });
});

test('provider failure silently falls back instead of escaping into the core request', async () => {
  resetAiResilienceCircuitsForTest();
  const result = await runAiEnhancedTask({
    env: {},
    taskName: 'survival.failure',
    providers: [{ id: 'openai', invoke: async () => { throw new Error('provider down'); } }],
    fallback: async ({ reason, attemptedProviders }) => ({ reason, attemptedProviders }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.reason, 'provider_unavailable');
  assert.deepEqual(result.attemptedProviders, ['openai']);
});

test('healthy provider is used when available', async () => {
  resetAiResilienceCircuitsForTest();
  const result = await runAiEnhancedTask({
    env: {},
    taskName: 'survival.healthy',
    providers: [{ id: 'provider-a', invoke: async () => ({ text: 'ok' }) }],
    fallback: async () => ({ text: 'fallback' }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'ai');
  assert.equal(result.degraded, false);
  assert.equal(result.provider, 'provider-a');
  assert.deepEqual(result.value, { text: 'ok' });
});

test('timeout degrades to free assist quickly', async () => {
  resetAiResilienceCircuitsForTest();
  const result = await runAiEnhancedTask({
    env: {},
    taskName: 'survival.timeout',
    timeoutMs: 5,
    providers: [{ id: 'slow-provider', invoke: () => new Promise(resolve => setTimeout(() => resolve('late'), 50)) }],
    fallback: async () => 'fallback-now',
  });

  assert.equal(result.mode, 'free_assist');
  assert.equal(result.value, 'fallback-now');
});

test('fallback failure returns core mode and still does not throw', async () => {
  resetAiResilienceCircuitsForTest();
  const result = await runAiEnhancedTask({
    env: NONE_ENV,
    taskName: 'survival.core',
    providers: [],
    fallback: async () => { throw new Error('assist unavailable'); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, 'core');
  assert.equal(result.degraded, true);
});

test('resilience policy reports provider-independent core', () => {
  assert.equal(AI_RESILIENCE_POLICY.providerIndependentCore, true);
  assert.equal(isAiProviderDisabled(NONE_ENV), true);
  const status = getAiResilienceStatus(NONE_ENV, [{ id: 'unused', invoke() {} }]);
  assert.equal(status.providerIndependentCore, true);
  assert.equal(status.providerDisabled, true);
  assert.equal(status.mode, 'free_assist');
});
