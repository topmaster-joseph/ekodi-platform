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
  assert.deepEqual(status.orchestration.configuredProviders.map(provider => provider.id), ['cloudflare-workers-ai', 'openai', 'anthropic', 'gemini']);
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
});


test('Core Assist blocks paid-opt-in providers until an explicit delegated budget exists', async () => {
  let invoked=0;
  const paid={
    id:'paid-test',
    available:true,
    costClass:'paid-opt-in',
    async invoke(){invoked+=1;return{text:'paid'}},
  };
  const gateway=buildCoreAiGateway({},[paid]);
  const blocked=await gateway.run({
    taskName:'cost.blocked',
    context:{},
    fallback:()=>({text:'fallback'}),
  });
  assert.equal(invoked,0);
  assert.equal(blocked.mode,'free_assist');
  assert.deepEqual(blocked.blockedProviders,[{
    provider:'paid-test',
    costClass:'paid-opt-in',
    blockedBy:'paid_or_unclassified_cost_requires_explicit_budget',
  }]);

  const allowed=await gateway.run({
    taskName:'cost.allowed',
    context:{governance:{paidCommitment:true,explicitDelegatedBudget:true}},
    fallback:()=>({text:'fallback'}),
  });
  assert.equal(invoked,1);
  assert.equal(allowed.mode,'ai');
  assert.equal(allowed.provider,'paid-test');
  assert.equal(allowed.costClass,'paid-opt-in');
});
