import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqFreeProvider } from '../groq-free-provider-adapter.js';
import { createOpenRouterFreeProvider } from '../openrouter-free-provider-adapter.js';

test('OpenRouter free adapter stays unavailable without a key',()=>{
  assert.equal(createOpenRouterFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true'}).available,false);
});

test('OpenRouter free adapter only uses the zero-price router model by default',async()=>{
  let request=null;
  const provider=createOpenRouterFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true',OPENROUTER_API_KEY:'test'},{
    fetchImpl:async(url,options)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:'openrouter-ok'}}]}),{status:200,headers:{'content-type':'application/json'}})}
  });
  const result=await provider.invoke({prompt:'hello'});
  assert.equal(result.text,'openrouter-ok');
  assert.equal(request.body.model,'openrouter/free');
  assert.match(request.url,/openrouter\.ai\/api\/v1\/chat\/completions/);
});

test('Groq free adapter is fail-closed until free-tier use is explicitly enabled',()=>{
  assert.equal(createGroqFreeProvider({ENVIRONMENT:'test',GROQ_API_KEY:'test'}).available,false);
});

test('Groq free adapter works through the bounded free-tier path when explicitly enabled',async()=>{
  let request=null;
  const provider=createGroqFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_GROQ_FREE_ENABLED:'true',GROQ_API_KEY:'test'},{
    fetchImpl:async(url,options)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:'groq-ok'}}]}),{status:200,headers:{'content-type':'application/json','x-ratelimit-remaining-requests':'899'}})}
  });
  const result=await provider.invoke({prompt:'hello'});
  assert.equal(result.text,'groq-ok');
  assert.equal(result.quota.remainingRequests,899);
  assert.match(request.url,/api\.groq\.com\/openai\/v1\/chat\/completions/);
});
