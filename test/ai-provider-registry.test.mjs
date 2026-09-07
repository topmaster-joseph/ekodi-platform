import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEkodiAiProviderRegistry,
  getEkodiAiProviderRegistryStatus,
} from '../ekodi-ai-provider-registry.js';

test('provider registry is provider-neutral and safe when no credentials are configured', () => {
  const providers = createEkodiAiProviderRegistry({}, { fetchImpl: async () => { throw new Error('must not run'); } });
  assert.deepEqual(providers.map(provider => provider.id), ['openai', 'anthropic', 'gemini']);
  assert.deepEqual(providers.map(provider => provider.priority), [10, 20, 30]);
  assert.equal(providers.every(provider => provider.available === false), true);
});

test('provider status never exposes credentials', () => {
  const status = getEkodiAiProviderRegistryStatus({
    OPENAI_API_KEY: 'test-openai-secret',
    ANTHROPIC_API_KEY: 'test-anthropic-secret',
    GEMINI_API_KEY: 'test-gemini-secret',
  });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('test-openai-secret'), false);
  assert.equal(serialized.includes('test-anthropic-secret'), false);
  assert.equal(serialized.includes('test-gemini-secret'), false);
  assert.deepEqual(status.map(item => item.id), ['openai', 'anthropic', 'gemini']);
});
