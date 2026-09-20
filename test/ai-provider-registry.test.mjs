import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEkodiAiProviderRegistry,
  getEkodiAiProviderRegistryStatus,
} from '../ekodi-ai-provider-registry.js';

test('provider registry is provider-neutral and safe when no credentials are configured', () => {
  const providers = createEkodiAiProviderRegistry({}, { fetchImpl: async () => { throw new Error('must not run'); } });
  assert.deepEqual(providers.map(provider => provider.id), ['cloudflare-workers-ai', 'openrouter-free', 'groq-free', 'openai', 'anthropic', 'gemini']);
  assert.deepEqual(providers.map(provider => provider.priority), [5, 20, 25, 10, 20, 30]);
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
  assert.deepEqual(status.map(item => item.id), ['cloudflare-workers-ai', 'openrouter-free', 'groq-free', 'openai', 'anthropic', 'gemini']);
});


test('free provider registry maps official zero-cost adapters into the governed EKODI shared pool', () => {
  const providers=createEkodiAiProviderRegistry({
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true',
    EKODI_PROVIDER_GROQ_FREE_ENABLED:'true',
    OPENROUTER_API_KEY:'openrouter-test-secret',
    GROQ_API_KEY:'groq-test-secret',
    AI:{async run(){return{response:'ok'}}},
  },{fetchImpl:async()=>new Response('{}',{status:503})});
  for(const id of ['cloudflare-workers-ai','openrouter-free','groq-free']){
    const provider=providers.find(item=>item.id===id);
    assert.ok(provider);
    assert.equal(provider.resourceClass,'ekodi-shared-api');
    assert.equal(['account-managed','free-preferred'].includes(provider.costClass),true);
  }
});
