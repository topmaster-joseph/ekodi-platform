import test from 'node:test';
import assert from 'node:assert/strict';
import {ollamaLocalEnabled,ollamaLocalModel,ollamaLocalReady,runOllamaLocal as runOllamaRaw} from '../scripts/ollama-local-provider.mjs';
const runOllamaLocal=(prompt,options={})=>runOllamaRaw(prompt,{freeMemoryBytes:2*1024**3,...options});
import {availableProviderIds,buildExecutionPlan} from '../ai-control-core.js';
import {providerStatus} from '../ai-control-provider-router.js';

const env={EKODI_ENABLE_OLLAMA_LOCAL:'true',OLLAMA_NO_CLOUD:'1',EKODI_OLLAMA_MODEL:'qwen3:0.6b'};
const fakeGet=async url=>{
  assert.equal(url,'http://127.0.0.1:11434/api/tags');
  return {ok:true,json:async()=>({models:[{name:'qwen3:0.6b'}]})};
};

test('local-only explicit opt-in and cloud models blocked',()=>{
  assert.equal(ollamaLocalEnabled(env),true);
  assert.equal(ollamaLocalEnabled({...env,OLLAMA_NO_CLOUD:'0'}),false);
  assert.equal(ollamaLocalEnabled({...env,EKODI_ENABLE_OLLAMA_LOCAL:'false'}),false);
  assert.equal(ollamaLocalModel(env),'qwen3:0.6b');
  assert.throws(()=>ollamaLocalModel({...env,EKODI_OLLAMA_MODEL:'remote:cloud'}),/invalid/);
  assert.throws(()=>ollamaLocalModel({...env,EKODI_OLLAMA_MODEL:'http://external'}),/invalid/);
});

test('detect installed model only through loopback',async()=>{
  assert.equal(await ollamaLocalReady({env,fetchImpl:fakeGet,freeMemoryBytes:2*1024**3}),true);
  assert.equal(await ollamaLocalReady({env,fetchImpl:fakeGet,freeMemoryBytes:1024}),false);
  assert.equal(await ollamaLocalReady({env:{...env,EKODI_OLLAMA_MODEL:'other:1'},fetchImpl:fakeGet,freeMemoryBytes:2*1024**3}),false);
  assert.equal(await ollamaLocalReady({env:{...env,EKODI_ENABLE_OLLAMA_LOCAL:'0'},fetchImpl:()=>{throw Error('must not call')}}),false);
});

test('invoke local-only chat, constrained token/memory settings, no tools',async()=>{
  const result=await runOllamaLocal('hello',{env,fetchImpl:async(url,init)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/chat');
    assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);
    assert.equal(body.model,'qwen3:0.6b');
    assert.equal(body.keep_alive,0);
    assert.equal(body.stream,false);
    assert.equal(body.think,false);
    assert.equal(body.options.num_ctx,1024);
    assert.equal(body.options.num_predict,160);
    assert.deepEqual(body.messages,[{role:'user',content:'hello'}]);
    return {ok:true,json:async()=>({message:{content:'done'}})};
  }});
  assert.equal(result,'done');
});

test('empty, overlong, disabled and failed invocations fail closed',async()=>{
  await assert.rejects(()=>runOllamaLocal('',{env}),/bounds/);
  await assert.rejects(()=>runOllamaLocal('x'.repeat(6001),{env}),/bounds/);
  await assert.rejects(()=>runOllamaLocal('hi',{env:{...env,OLLAMA_NO_CLOUD:'0'}}),/disabled/);
  await assert.rejects(()=>runOllamaLocal('hi',{env,fetchImpl:async()=>({ok:false,status:503})}),/503/);
  await assert.rejects(()=>runOllamaLocal('hi',{env,freeMemoryBytes:128}),/insufficient_free_memory/);
});

test('central routing only opts in safe non-code jobs',()=>{
  const capabilities={nodeProviders:['ollama-local']};
  const general={title:'short greeting',prompt:'Say hello',requestedProviders:['node:ollama-local'],needsCodeBranch:false};
  assert.deepEqual(availableProviderIds(capabilities,general),['node:ollama-local']);
  assert.equal(buildExecutionPlan(general,capabilities)[0].providerId,'node:ollama-local');
  assert.deepEqual(availableProviderIds(capabilities,{...general,requestedProviders:[]}),[]);
  assert.deepEqual(availableProviderIds(capabilities,{...general,needsCodeBranch:true}),[]);
  assert.deepEqual(availableProviderIds(capabilities,{...general,title:'code update'}),[]);
  assert.deepEqual(availableProviderIds(capabilities,{...general,title:'data analysis'}),[]);
});

test('node status uses local inference kind without claiming hosted model',()=>{
  const item=providerStatus({},['ollama-local']).find(p=>p.id==='node:ollama-local');
  assert.equal(item.kind,'local-inference');
  assert.equal(item.model,'node-selected');
});
