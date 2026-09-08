import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  AI_CONTROL_POLICY,
  buildExecutionPlan,
  buildOriginSynthesisPrompt,
  isOriginPreserved,
  normalizeTaskInput,
  resolveOriginResponseProvider,
  taskOrigin,
} from '../ai-control-core.js';

const fullCapabilities={
  geminiFree:true,
  nodeProviders:['codex','gemini-cli','claude-code'],
  openaiApi:true,
  anthropicApi:true,
  workerProviders:['chatgpt','claude','gemini','notebooklm','aistudio'],
};

test('AI control always normalizes work to five-provider parallel policy',()=>{
  assert.equal(AI_CONTROL_POLICY.defaultMode,'parallel');
  assert.deepEqual(AI_CONTROL_POLICY.modes,['parallel']);
  assert.equal(AI_CONTROL_POLICY.maxParallelProviders,5);
  for(const requestedMode of ['single','primary-review','parallel','anything-legacy']){
    const task=normalizeTaskInput({prompt:'inspect the service',mode:requestedMode});
    assert.equal(task.mode,'parallel');
    assert.equal(task.requestedMode,requestedMode);
  }
});

test('origin envelope is immutable and survives inside persisted governance JSON',()=>{
  const task=normalizeTaskInput({prompt:'review this',origin:{provider:'GPT',channel:'chatgpt-web',requestId:'req-42'}});
  assert.deepEqual(task.origin,{provider:'chatgpt',channel:'chatgpt-web',requestId:'req-42',requestedProvider:'gpt'});
  assert.deepEqual(task.governance.origin,task.origin);
  assert.deepEqual(taskOrigin({governance:JSON.parse(JSON.stringify(task.governance))}),task.origin);
  assert.equal(Object.isFrozen(task.origin),true);
});

test('execution plan uses at most five distinct suppliers and pins the origin family first',()=>{
  const task=normalizeTaskInput({prompt:'build it',originProvider:'chatgpt'});
  const plan=buildExecutionPlan(task,fullCapabilities);
  assert.equal(plan.length,5);
  assert.equal(new Set(plan.map(item=>item.providerId)).size,5);
  assert.equal(plan[0].providerId,'node:codex');
  assert.equal(plan[0].role,'origin-primary');
  assert.ok(plan.slice(1).every(item=>item.role.startsWith('parallel-')));
});

test('explicit collaborator list cannot evict the available origin responder',()=>{
  const task=normalizeTaskInput({prompt:'compare',originProvider:'claude',providers:['gemini-free','node:codex','node:gemini-cli','openai-api','worker:chatgpt']});
  const plan=buildExecutionPlan(task,fullCapabilities);
  assert.equal(plan.length,5);
  assert.equal(plan[0].providerId,'node:claude-code');
  assert.equal(new Set(plan.map(item=>item.providerId)).size,5);
});

test('origin responder falls back within the same AI family before cross-family fallback',()=>{
  const task=normalizeTaskInput({prompt:'answer',originProvider:'chatgpt'});
  const capabilities={geminiFree:true,nodeProviders:[],openaiApi:true,anthropicApi:true,workerProviders:[]};
  assert.equal(resolveOriginResponseProvider(task,capabilities),'openai-api');
  assert.equal(isOriginPreserved(task,'openai-api'),true);
  assert.equal(isOriginPreserved(task,'anthropic-api'),false);
});

test('origin synthesis combines successful parallel outputs into one user-facing handoff',()=>{
  const task=normalizeTaskInput({prompt:'Which option should we ship?',origin:{provider:'claude',channel:'claude-web',requestId:'c-7'}});
  const prompt=buildOriginSynthesisPrompt(task,[
    {providerId:'anthropic-api',role:'origin-primary',ok:true,output:'Option A has lower risk.'},
    {providerId:'gemini-free',role:'parallel-2',ok:true,output:'Option B is faster.'},
    {providerId:'openai-api',role:'parallel-3',ok:false,output:''},
  ]);
  assert.match(prompt,/claude origin/);
  assert.match(prompt,/Option A has lower risk/);
  assert.match(prompt,/Option B is faster/);
  assert.doesNotMatch(prompt,/Parallel result 3/);
});

test('worker and direct router contain real concurrent fan-out plus origin synthesis',async()=>{
  const worker=await readFile(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const router=await readFile(new URL('../ai-control-provider-router.js',import.meta.url),'utf8');
  assert.match(worker,/Promise\.all\(plan\.map/);
  assert.match(router,/Promise\.all\(plan\.map/);
  assert.match(worker,/buildOriginSynthesisPrompt/);
  assert.match(worker,/state='synthesizing'/);
  assert.match(router,/role:'origin-synthesis'/);
});
