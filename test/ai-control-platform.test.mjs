import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_CONTROL_POLICY,availableProviderIds,buildExecutionPlan,createTaskId,normalizeTaskInput,rolePrompt,summarizeRuns} from '../ai-control-core.js';
import {providerCapabilities,providerStatus} from '../ai-control-provider-router.js';

test('coding work requests an isolated branch and stays in development',()=>{
  const task=normalizeTaskInput({prompt:'관리자 페이지 코딩을 수정하고 Git 브랜치에서 검증해',mode:'primary-review'});
  assert.equal(task.needsCodeBranch,true);
  assert.equal(task.mode,'primary-review');
  assert.equal(task.executionEnvironment,'development');
});

test('free API and account nodes stay ahead of paid API fallbacks',()=>{
  const task=normalizeTaskInput({prompt:'검토해줘',mode:'parallel'});
  const plan=buildExecutionPlan(task,{geminiFree:true,nodeProviders:['codex','gemini-cli'],openaiApi:true,anthropicApi:true,workerProviders:['claude']});
  assert.deepEqual(plan.map(item=>item.providerId),['gemini-free','node:codex','node:gemini-cli']);
  assert.equal(plan.length,AI_CONTROL_POLICY.maxParallelProviders);
});

test('primary-review uses Gemini free then ChatGPT account Codex',()=>{
  const task=normalizeTaskInput({prompt:'이 설계를 상호 검토해줘'});
  const plan=buildExecutionPlan(task,{geminiFree:true,nodeProviders:['codex'],openaiApi:true});
  assert.deepEqual(plan,[{providerId:'gemini-free',role:'primary'},{providerId:'node:codex',role:'reviewer'}]);
});

test('account node can become primary when no free direct API key is configured',()=>{
  const task=normalizeTaskInput({prompt:'분석해줘',mode:'single'});
  const plan=buildExecutionPlan(task,{geminiFree:false,nodeProviders:['codex'],openaiApi:true});
  assert.deepEqual(plan,[{providerId:'node:codex',role:'primary'}]);
});

test('provider inventory is normalized and unique across classes',()=>{
  assert.deepEqual(availableProviderIds({geminiFree:true,nodeProviders:['Codex','codex'],openaiApi:true,anthropicApi:true,workerProviders:['Claude','Claude']}),['gemini-free','node:codex','openai-api','anthropic-api','worker:claude']);
});

test('provider capability status labels plan-included account execution',()=>{
  const env={GEMINI_API_KEY:'g',OPENAI_API_KEY:'o',ANTHROPIC_API_KEY:'a'};
  assert.deepEqual(providerCapabilities(env,['codex']).nodeProviders,['codex']);
  const status=providerStatus(env,['codex']);
  assert.equal(status.find(item=>item.id==='node:codex')?.costClass,'chatgpt-plan-included');
  assert.equal(status.find(item=>item.id==='openai-api')?.costClass,'paid-opt-in');
});

test('role prompt carries branch, development boundary and immutable promotion context',()=>{
  const task=normalizeTaskInput({prompt:'코드를 수정해'});
  const prompt=rolePrompt(task,'reviewer',{branch:'ai/generic/task-1'});
  assert.match(prompt,/ai\/generic\/task-1/);
  assert.match(prompt,/Execution environment: development/);
  assert.match(prompt,/central review, merge, and deployment gate/);
  assert.match(prompt,/Never mutate production directly/);
  assert.match(prompt,/verified immutable artifact/);
});

test('successful AI work still needs human approval',()=>{
  const summary=summarizeRuns([{providerId:'gemini-free',ok:true},{providerId:'node:codex',ok:false}]);
  assert.equal(summary.successful,1);
  assert.equal(summary.failed,1);
  assert.equal(summary.needsHumanApproval,true);
});

test('task ids are branch-safe identifiers',()=>{
  const id=createTaskId(new Date('2026-09-02T00:00:00.000Z'),()=>0.5);
  assert.match(id,/^task-20260902000000-[a-z0-9]{4}$/);
});
