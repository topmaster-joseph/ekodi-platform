import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invokeProvider, providerCapabilities, providerStatus } from '../ai-control-provider-router.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('AI control official providers execute only through the shared registry adapters',()=>{
  const source=read('ai-control-provider-router.js');
  assert.match(source,/createEkodiAiProviderRegistry/);
  assert.doesNotMatch(source,/api\.openai\.com/);
  assert.doesNotMatch(source,/api\.anthropic\.com/);
  assert.doesNotMatch(source,/generativelanguage\.googleapis\.com/);
  assert.match(source,/createOpenRouterFreeProvider/);
  assert.match(source,/createGroqFreeProvider/);
});

test('managed enable flags affect official providers without removing the free provider pool',()=>{
  const disabled=providerCapabilities({
    GEMINI_API_KEY:'test-gemini-key',
    EKODI_PROVIDER_GEMINI_ENABLED:'false',
    OPENROUTER_API_KEY:'test-openrouter-key',
  });
  assert.equal(disabled.geminiFree,false);
  assert.equal(disabled.openrouterFree,true);

  const enabled=providerCapabilities({
    GEMINI_API_KEY:'test-gemini-key',
    EKODI_PROVIDER_GEMINI_ENABLED:'true',
  });
  assert.equal(enabled.geminiFree,true);
});

test('provider status uses registry model overrides and separates configured from enabled',()=>{
  const rows=providerStatus({
    GEMINI_API_KEY:'test-gemini-key',
    EKODI_PROVIDER_GEMINI_ENABLED:'false',
    EKODI_PROVIDER_GEMINI_MODEL:'gemini-registry-test',
  });
  const gemini=rows.find(item=>item.id==='gemini-free');
  assert.equal(gemini.configured,true);
  assert.equal(gemini.available,false);
  assert.equal(gemini.model,'gemini-registry-test');
});

test('orchestrator Gemini invocation executes through the shared adapter contract',async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({
      candidates:[{content:{parts:[{text:'adapter-ok'}]}}],
      usageMetadata:{promptTokenCount:3,candidatesTokenCount:2,totalTokenCount:5},
    }),{status:200,headers:{'content-type':'application/json','x-request-id':'gemini-test-request'}});
  };
  try{
    const output=await invokeProvider({
      ENVIRONMENT:'development',
      GEMINI_API_KEY:'test-gemini-key',
      EKODI_PROVIDER_GEMINI_ENABLED:'true',
      EKODI_PROVIDER_GEMINI_MODEL:'gemini-registry-test',
    },'gemini-free','adapter routing proof',{id:'task-1',title:'adapter proof',origin:{provider:'ekodi'}},'reviewer');
    assert.equal(output,'adapter-ok');
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/generativelanguage\.googleapis\.com/);
    assert.match(calls[0].url,/gemini-registry-test/);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('shared Gemini adapter preserves free-quota exhaustion metadata for the quota ledger',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    error:{message:'Requests per day quota exhausted'},
  }),{status:429,headers:{'content-type':'application/json','retry-after':'60'}});
  try{
    await assert.rejects(
      invokeProvider({
        ENVIRONMENT:'development',
        GEMINI_API_KEY:'test-gemini-key',
        EKODI_PROVIDER_GEMINI_ENABLED:'true',
      },'gemini-free','quota proof',{id:'task-2',title:'quota proof'},'reviewer'),
      error=>error?.status===429&&error?.retryAfterSeconds===60&&error?.quota?.state==='exhausted',
    );
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('provider control synchronizes credentials to both runtime workers without exposing values',()=>{
  const source=read('ai-provider-control.js');
  assert.match(source,/\['ekodi-auth-api','ekodi-ai-control'\]/);
  assert.match(source,/runtimeTargets/);
  assert.match(source,/valueReturned:false/);
  assert.doesNotMatch(source,/valueReturned:true/);
});
