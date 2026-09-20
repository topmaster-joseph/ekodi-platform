import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutionPlan, isOriginPreserved, normalizeTaskInput, resolveOriginResponseProvider } from '../ai-control-core.js';
import { invokeProvider } from '../ai-control-provider-router.js';
import { createEkodiAiProviderRegistry } from '../ekodi-ai-provider-registry.js';

test('new worker providers enter the default plan without a hardcoded provider name', () => {
  const task = normalizeTaskInput({ prompt: 'compare the available providers' });
  const capabilities = {
    workerProviders: ['future-ai', 'research-engine'],
    providerProfiles: {
      'worker:future-ai': { costClass: 'account-managed' },
      'worker:research-engine': { costClass: 'account-managed' },
    },
  };
  const plan = buildExecutionPlan(task, capabilities);
  assert.deepEqual(plan.map(item => item.providerId), ['worker:future-ai', 'worker:research-engine']);
});

test('unclassified future workers remain blocked until cost policy is declared or budget is delegated', () => {
  const task = normalizeTaskInput({ prompt: 'use a new provider safely' });
  assert.deepEqual(buildExecutionPlan(task, { workerProviders: ['future-ai'] }), []);
  const paidTask = normalizeTaskInput({
    prompt: 'use a new provider with delegated budget',
    governance: { paidCommitment: true, explicitDelegatedBudget: true },
  });
  assert.deepEqual(buildExecutionPlan(paidTask, { workerProviders: ['future-ai'] }).map(item => item.providerId), ['worker:future-ai']);
});

test('future origin identities are preserved through matching worker adapters', () => {
  const task = normalizeTaskInput({ prompt: 'answer from my origin', originProvider: 'future-ai' });
  const capabilities = {
    workerProviders: ['future-ai', 'other-ai'],
    providerProfiles: {
      'worker:future-ai': { costClass: 'account-managed' },
      'worker:other-ai': { costClass: 'account-managed' },
    },
  };
  assert.equal(resolveOriginResponseProvider(task, capabilities), 'worker:future-ai');
  assert.equal(isOriginPreserved(task, 'worker:future-ai'), true);
});

test('the common worker contract invokes arbitrary provider ids and returns their result', async t => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ ok: true, output: 'future-result' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const output = await invokeProvider(
    { AI_WORKER_URL: 'https://worker.example', AI_WORKER_TOKEN: 'secret' },
    'worker:future-ai',
    'prompt',
    { id: 'task-1', origin: { provider: 'future-ai' } },
    'parallel-1',
  );
  assert.equal(output, 'future-result');
  assert.equal(captured.url, 'https://worker.example/v1/execute');
  assert.equal(captured.body.provider, 'future-ai');
  assert.equal(captured.body.task_id, 'task-1');
  assert.equal(captured.options.headers.authorization, 'Bearer secret');
});

test('trusted invoke adapters can extend the orchestrator registry without changing core code', async () => {
  const future = {
    id: 'future-ai',
    model: 'future-model',
    available: true,
    priority: 40,
    capabilities: ['text', 'reasoning'],
    costClass: 'account-managed',
    invoke: async () => ({ text: 'ok' }),
  };
  const providers = createEkodiAiProviderRegistry({}, {
    fetchImpl: async () => { throw new Error('built-ins must not be invoked'); },
    additionalProviders: [future],
  });
  assert.deepEqual(providers.map(provider => provider.id), ['cloudflare-workers-ai', 'openrouter-free', 'groq-free', 'openai', 'anthropic', 'gemini', 'future-ai']);
  assert.equal(typeof providers.at(-1).invoke, 'function');
  assert.equal(providers.at(-1).officialPath, false);
  assert.equal(providers.at(-1).automationAllowed, true);
});

test('extension registry fails closed on invalid or duplicate provider identities', () => {
  const noop = async () => ({ text: 'ok' });
  assert.throws(() => createEkodiAiProviderRegistry({}, { additionalProviders: [{ id: 'openai', invoke: noop }] }), /duplicate_provider_id/);
  assert.throws(() => createEkodiAiProviderRegistry({}, { additionalProviders: [{ id: '../unsafe', invoke: noop }] }), /invalid_provider_id/);
});
