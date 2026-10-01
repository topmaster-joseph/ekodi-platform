import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEkodiAiProviderRegistry,
  getEkodiAiProviderRegistryStatus,
} from '../ekodi-ai-provider-registry.js';

test('provider registry is provider-neutral and safe when no credentials are configured', () => {
  const providers = createEkodiAiProviderRegistry({}, { fetchImpl: async () => { throw new Error('must not run'); } });
  assert.deepEqual(providers.map(provider => provider.id), ['cloudflare-workers-ai', 'gemini', 'openrouter-free', 'groq-free', 'huggingface-free-credit', 'openai', 'anthropic']);
  assert.deepEqual(providers.map(provider => provider.priority), [5, 10, 20, 30, 55, 60, 70]);
  assert.equal(providers.every(provider => provider.available === false), true);
});

test('provider status never exposes credentials', () => {
  const status = getEkodiAiProviderRegistryStatus({
    OPENAI_API_KEY: 'test-openai-secret',
    ANTHROPIC_API_KEY: 'test-anthropic-secret',
    GEMINI_API_KEY: 'test-gemini-secret',
    HF_TOKEN: 'test-huggingface-secret',
    EKODI_PROVIDER_HF_FREE_ENABLED: 'true',
  });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('test-openai-secret'), false);
  assert.equal(serialized.includes('test-anthropic-secret'), false);
  assert.equal(serialized.includes('test-gemini-secret'), false);
  assert.equal(serialized.includes('test-huggingface-secret'), false);
  assert.deepEqual(status.map(item => item.id), ['cloudflare-workers-ai', 'gemini', 'openrouter-free', 'groq-free', 'openai', 'anthropic']);
});
