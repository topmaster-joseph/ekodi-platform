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
  assert.equal(workers.resourceClass,'ekodi-shared-api');
});

test('enabled Workers AI actually executes through the command plane instead of falling back to Core-only', async () => {
  let calls=0;
  const gateway=buildCoreAiGateway({
    AI_MULTI_PROVIDER_ENABLED:'true',
    EKODI_PROVIDER_WORKERS_AI_ENABLED:'true',
    AI:{
      async run(){
        calls+=1;
        return {response:'EKODI_WORKERS_COMMAND_OK'};
      },
    },
  },[]);
  const result=await gateway.handlePulse({
    taskId:'workers-command-proof',
    goal:'Read-only provider execution proof.',
    risk:'low',
    target:{service:'core',capability:'platform_health',surface:'admin'},
    delegation:{allowed:true,reversible:true,audited:true,preflightVerified:true,verificationDefined:true},
    event:{id:'workers-command-event',kind:'manual_goal',summary:'Read-only provider execution proof.',changeClass:'green',actionable:true,requiresHumanDecision:false},
  });
  assert.notEqual(result.state,'core_only');
  assert.equal(result.evidence.providerDiversity,1);
  assert.ok(calls>=1);
});
