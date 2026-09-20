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

test('opt-in registry attaches bounded Workers AI plus OpenAI Anthropic and Gemini without exposing credentials', () => {
  const gateway = buildCoreAiGateway({
    AI_MULTI_PROVIDER_ENABLED: 'true',
    OPENAI_API_KEY: 'openai-test-secret',
    ANTHROPIC_API_KEY: 'anthropic-test-secret',
    GEMINI_API_KEY: 'gemini-test-secret',
  }, []);
  const status = gateway.status();
  assert.equal(status.multiProviderEnabled, true);
  assert.deepEqual(status.orchestration.configuredProviders.map(provider => provider.id), ['cloudflare-workers-ai', 'openai', 'anthropic', 'openrouter-free', 'groq-free', 'gemini']);
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


test('multi-provider pool exposes the active Workers AI model when the binding is enabled', () => {
  const gateway=buildCoreAiGateway({
    AI_MULTI_PROVIDER_ENABLED:'true',
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    AI:{async run(){return{response:'ok'}}},
  },[]);
  const workers=gateway.status().orchestration.configuredProviders.find(provider=>provider.id==='cloudflare-workers-ai');
  assert.ok(workers);
  assert.equal(workers.available,true);
  assert.equal(workers.resourceClass,'ekodi-shared-api');
});


test('active Workers AI is an executable zero-cost Core provider instead of falling back to core_only', async () => {
  let calls=0;
  const gateway=buildCoreAiGateway({
    ENVIRONMENT:'test',
    AI_MULTI_PROVIDER_ENABLED:'true',
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    AI:{async run(){calls+=1;return{response:'workers-ai-runtime-ok'}}},
  },[]);
  const result=await gateway.run({
    taskName:'workers-ai-runtime-proof',
    context:{message:'무료 경로 실행 확인'},
    fallback:()=>({text:'unexpected-core-fallback'}),
  });
  assert.equal(result.mode,'ai');
  assert.equal(result.provider,'cloudflare-workers-ai');
  assert.equal(result.value.text,'workers-ai-runtime-ok');
  assert.equal(calls,1);
});
