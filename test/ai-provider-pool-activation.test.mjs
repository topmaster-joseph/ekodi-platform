import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoreAiGateway } from '../core-ai-gateway.js';

function suppliedProvider(id = 'supplied') {
  return {
    id,
    available: true,
    async invoke() {
      return { text: 'supplied' };
    },
  };
}

test('multi-provider registry is opt-in so existing callers keep their current provider set', () => {
  const gateway = buildCoreAiGateway({}, [suppliedProvider()]);
  const status = gateway.status();
  assert.equal(status.multiProviderEnabled, false);
  assert.deepEqual(status.orchestration.configuredProviders.map(provider => provider.id), ['supplied']);
});

test('opt-in registry attaches OpenAI Anthropic and Gemini without exposing credentials', () => {
  const gateway = buildCoreAiGateway({
    AI_MULTI_PROVIDER_ENABLED: 'true',
    OPENAI_API_KEY: 'openai-test-secret',
    ANTHROPIC_API_KEY: 'anthropic-test-secret',
    GEMINI_API_KEY: 'gemini-test-secret',
  }, []);
  const status = gateway.status();
  assert.equal(status.multiProviderEnabled, true);
  assert.deepEqual(status.orchestration.configuredProviders.map(provider => provider.id), ['openai', 'anthropic', 'gemini']);
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('openai-test-secret'), false);
  assert.equal(serialized.includes('anthropic-test-secret'), false);
  assert.equal(serialized.includes('gemini-test-secret'), false);
});

test('AI_PROVIDER=NONE overrides opt-in provider pooling and preserves Core fallback', async () => {
  const gateway = buildCoreAiGateway({
    AI_MULTI_PROVIDER_ENABLED: 'true',
    AI_PROVIDER: 'NONE',
    OPENAI_API_KEY: 'openai-test-secret',
    ANTHROPIC_API_KEY: 'anthropic-test-secret',
    GEMINI_API_KEY: 'gemini-test-secret',
  }, []);
  const result = await gateway.run({
    taskName: 'pool.none',
    fallback: () => ({ text: 'core-fallback' }),
  });
  assert.equal(result.mode, 'free_assist');
  assert.equal(result.value.text, 'core-fallback');
});
