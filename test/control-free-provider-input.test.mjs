import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroqFreeProvider} from '../groq-free-provider-adapter.js';
import {createOpenRouterFreeProvider} from '../openrouter-free-provider-adapter.js';
import {buildCoreAiGateway} from '../core-ai-gateway.js';

function setup(kind){
  const calls=[];
  const env={ENVIRONMENT:'test',AI_MULTI_PROVIDER_ENABLED:'true',
    EKODI_PROVIDER_GROQ_FREE_ENABLED:kind==='groq'?'true':'false',
    EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:kind==='openrouter'?'true':'false',
    GROQ_API_KEY:kind==='groq'?'local-test':'',
    OPENROUTER_API_KEY:kind==='openrouter'?'local-test':'',
  };
  const fetchImpl=async(url,options)=>{
    const body=JSON.parse(options.body);
    calls.push({url:String(url),body});
    return new Response(JSON.stringify({choices:[{message:{content:'AI 정상 응답'}}]}),{
      status:200,headers:{'content-type':'application/json'},
    });
  };
  return {env,calls,fetchImpl};
}

for(const kind of ['groq','openrouter']){
  const name=kind==='groq'?'Groq':'OpenRouter';
  test(name+' accepts gateway {taskName,context.message} and rejects empty input',async()=>{
    const {env,calls,fetchImpl}=setup(kind);
    const provider=kind==='groq'?createGroqFreeProvider(env,{fetchImpl}):createOpenRouterFreeProvider(env,{fetchImpl});
    assert.equal(provider.available,true);
    const result=await provider.invoke({taskName:'admin-assist',context:{message:'서남권 게시판 권한 확인'}});
    assert.equal(result.text,'AI 정상 응답');
    assert.equal(calls.length,1);
    assert.match(calls[0].body.messages[0].content,/서남권 게시판 권한 확인/);
    await assert.rejects(provider.invoke({taskName:'admin-assist',context:{}}),/prompt_required/);
    assert.equal(calls.length,1,'no provider request when prompt is empty');
  });
}
