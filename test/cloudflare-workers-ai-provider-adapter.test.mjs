import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_WORKERS_AI_DEFAULTS,
  createCloudflareWorkersAiProvider,
  getCloudflareWorkersAiProviderStatus,
} from '../cloudflare-workers-ai-provider-adapter.js';

test('Workers AI provider is unavailable without a binding', () => {
  const provider=createCloudflareWorkersAiProvider({ENVIRONMENT:'test'});
  assert.equal(provider.available,false);
  assert.equal(provider.id,'cloudflare-workers-ai');
  assert.equal(provider.costClass,'account-managed');
});

test('Workers AI provider invokes the bound model in non-production tests without D1', async () => {
  let input=null;
  const provider=createCloudflareWorkersAiProvider({
    ENVIRONMENT:'test',
    AI:{async run(model,payload){input={model,payload};return{response:'EKODI_WORKERS_AI_OK'}}}
  });
  const result=await provider.invoke({taskName:'health proof',context:{safe:true}});
  assert.equal(result.text,'EKODI_WORKERS_AI_OK');
  assert.equal(input.model,CLOUDFLARE_WORKERS_AI_DEFAULTS.model);
  assert.equal(input.payload.max_tokens,CLOUDFLARE_WORKERS_AI_DEFAULTS.maxOutputTokens);
  assert.equal(input.payload.messages.length,2);
});

test('Workers AI production invocation fails closed when the daily-budget DB is unavailable', async () => {
  const provider=createCloudflareWorkersAiProvider({
    ENVIRONMENT:'production',
    AI:{async run(){throw new Error('must not run')}}
  });
  await assert.rejects(()=>provider.invoke({taskName:'blocked'}),/WORKERS_AI_BUDGET_DB_UNAVAILABLE/);
});

test('Workers AI status exposes no credential material', () => {
  const status=getCloudflareWorkersAiProviderStatus({
    ENVIRONMENT:'production',
    EKODI_WORKERS_AI_DAILY_CALL_LIMIT:'4',
    AI:{async run(){return{response:'ok'}}}
  });
  assert.deepEqual(status,{
    id:'cloudflare-workers-ai',
    configured:true,
    available:true,
    model:CLOUDFLARE_WORKERS_AI_DEFAULTS.model,
    dailyCallLimit:4,
    costClass:'account-managed'
  });
});

test('Workers AI defaults to the active fast Llama replacement', () => {
  assert.equal(CLOUDFLARE_WORKERS_AI_DEFAULTS.model,'@cf/meta/llama-3.1-8b-instruct-fast');
});

test('failed Workers AI calls refund the local daily reservation so recovery can retry', async () => {
  let count=0;
  const db={
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              if(sql.startsWith('INSERT OR IGNORE'))return{meta:{changes:0}};
              if(sql.includes('call_count=call_count+1')){
                const limit=Number(args.at(-1));
                if(count>=limit)return{meta:{changes:0}};
                count+=1;return{meta:{changes:1}};
              }
              if(sql.includes('call_count=CASE WHEN call_count>0')){
                count=Math.max(0,count-1);return{meta:{changes:1}};
              }
              return{meta:{changes:0}};
            },
            async first(){return{call_count:count}}
          };
        }
      };
    }
  };
  let attempts=0;
  const env={
    ENVIRONMENT:'production',
    EKODI_WORKERS_AI_DAILY_CALL_LIMIT:'1',
    DB:db,
    AI:{async run(){attempts+=1;if(attempts===1)throw new Error('MODEL_TEMPORARY_FAILURE');return{response:'RECOVERED'}}}
  };
  const provider=createCloudflareWorkersAiProvider(env);
  await assert.rejects(()=>provider.invoke({taskName:'first',context:{safe:true}}),/MODEL_TEMPORARY_FAILURE/);
  assert.equal(count,0);
  const recovered=await provider.invoke({taskName:'second',context:{safe:true}});
  assert.equal(recovered.text,'RECOVERED');
  assert.equal(count,1);
});
