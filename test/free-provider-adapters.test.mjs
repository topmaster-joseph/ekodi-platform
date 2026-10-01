import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqFreeProvider } from '../groq-free-provider-adapter.js';
import { createOpenRouterFreeProvider } from '../openrouter-free-provider-adapter.js';
import { createCerebrasFreeProvider, createQwenFreeProvider, createDeepSeekFreeCreditProvider } from '../extended-free-provider-adapters.js';

test('OpenRouter free adapter stays unavailable without a key',()=>{
  assert.equal(createOpenRouterFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true'}).available,false);
});

test('OpenRouter free adapter only uses the zero-price router model by default',async()=>{
  let request=null;
  const provider=createOpenRouterFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true',OPENROUTER_API_KEY:'test'},{
    fetchImpl:async(url,options)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:'openrouter-ok'}}]}),{status:200,headers:{'content-type':'application/json'}})}
  });
  const result=await provider.invoke({prompt:'contact test@example.com'});
  assert.equal(result.text,'openrouter-ok');
  assert.doesNotMatch(request.body.messages[0].content,/test@example\.com/);
  assert.match(request.body.messages[0].content,/REDACTED_EMAIL/);
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
  const result=await provider.invoke({prompt:'contact test@example.com'});
  assert.equal(result.text,'groq-ok');
  assert.doesNotMatch(request.body.messages[0].content,/test@example\.com/);
  assert.match(request.body.messages[0].content,/REDACTED_EMAIL/);
  assert.equal(result.quota.remainingRequests,899);
  assert.match(request.url,/api\.groq\.com\/openai\/v1\/chat\/completions/);
});


test('Cerebras free adapter requires explicit free-trial-only confirmation',()=>{
  assert.equal(createCerebrasFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_CEREBRAS_FREE_ENABLED:'true',CEREBRAS_API_KEY:'test'}).available,false);
  assert.equal(createCerebrasFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_CEREBRAS_FREE_ENABLED:'true',EKODI_CEREBRAS_FREE_TRIAL_ONLY:'true',CEREBRAS_API_KEY:'test'}).available,true);
});

test('Cerebras free adapter uses the official OpenAI-compatible endpoint with bounded free-trial routing',async()=>{
  let request=null;
  const provider=createCerebrasFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_CEREBRAS_FREE_ENABLED:'true',EKODI_CEREBRAS_FREE_TRIAL_ONLY:'true',CEREBRAS_API_KEY:'test'},{
    fetchImpl:async(url,options)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:'cerebras-ok'}}]}),{status:200,headers:{'content-type':'application/json'}})}
  });
  const result=await provider.invoke({prompt:'contact test@example.com'});
  assert.equal(result.text,'cerebras-ok');
  assert.match(request.url,/api\.cerebras\.ai\/v1\/chat\/completions/);
  assert.doesNotMatch(request.body.messages[0].content,/test@example\.com/);
});

test('Qwen free adapter stays fail-closed until Free Quota Only is confirmed',()=>{
  const base={ENVIRONMENT:'test',EKODI_PROVIDER_QWEN_FREE_ENABLED:'true',QWEN_API_KEY:'test',QWEN_BASE_URL:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'};
  assert.equal(createQwenFreeProvider(base).available,false);
  assert.equal(createQwenFreeProvider({...base,EKODI_QWEN_FREE_QUOTA_ONLY_CONFIRMED:'true'}).available,true);
});

test('Qwen free adapter uses configured OpenAI-compatible regional endpoint',async()=>{
  let request=null;
  const provider=createQwenFreeProvider({ENVIRONMENT:'test',EKODI_PROVIDER_QWEN_FREE_ENABLED:'true',EKODI_QWEN_FREE_QUOTA_ONLY_CONFIRMED:'true',QWEN_API_KEY:'test',QWEN_BASE_URL:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'},{
    fetchImpl:async(url,options)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:'qwen-ok'}}]}),{status:200,headers:{'content-type':'application/json'}})}
  });
  const result=await provider.invoke({prompt:'qwen proof'});
  assert.equal(result.text,'qwen-ok');
  assert.match(request.url,/dashscope-intl\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions/);
});

test('DeepSeek free-credit adapter refuses topped-up balance and only uses granted balance',async()=>{
  const calls=[];
  const provider=createDeepSeekFreeCreditProvider({ENVIRONMENT:'test',EKODI_PROVIDER_DEEPSEEK_FREE_ENABLED:'true',DEEPSEEK_API_KEY:'test'},{
    fetchImpl:async(url,options={})=>{
      calls.push(String(url));
      if(String(url).endsWith('/user/balance'))return new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'USD',granted_balance:'1.00',topped_up_balance:'0.00'}]}),{status:200,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({choices:[{message:{content:'deepseek-ok'}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
  });
  const result=await provider.invoke({prompt:'deepseek proof'});
  assert.equal(result.text,'deepseek-ok');
  assert.deepEqual(calls,['https://api.deepseek.com/user/balance','https://api.deepseek.com/chat/completions']);
});

test('DeepSeek free-credit adapter blocks when paid topped-up balance is present',async()=>{
  const provider=createDeepSeekFreeCreditProvider({ENVIRONMENT:'test',EKODI_PROVIDER_DEEPSEEK_FREE_ENABLED:'true',DEEPSEEK_API_KEY:'test'},{
    fetchImpl:async()=>new Response(JSON.stringify({is_available:true,balance_infos:[{currency:'USD',granted_balance:'1.00',topped_up_balance:'5.00'}]}),{status:200,headers:{'content-type':'application/json'}})
  });
  await assert.rejects(provider.invoke({prompt:'must not spend paid balance'}),/deepseek_paid_balance_present/);
});
