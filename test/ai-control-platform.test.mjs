import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_CONTROL_POLICY,availableProviderIds,buildExecutionPlan,createTaskId,evaluateTaskMissionPolicy,normalizeTaskInput,rolePrompt,summarizeRuns} from '../ai-control-core.js';
import {providerCapabilities,providerStatus} from '../ai-control-provider-router.js';
import {truthContextForTask} from '../ai-control-worker.js';

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

test('mission governance blocks non-negotiable violations',()=>{
  const task=normalizeTaskInput({prompt:'lock in user',governance:{agentId:'chief',area:'bounded_action',violates:['no_artificial_lock_in']}}); const d=evaluateTaskMissionPolicy(task);
  assert.equal(d.tier,'forbidden'); assert.equal(d.allowModelConsultation,false);
});
test('high-impact actions remain analysis-only behind a human gate',()=>{
  const task=normalizeTaskInput({prompt:'change production secret',governance:{agentId:'infrastructure',area:'production_secret_change'}}); const d=evaluateTaskMissionPolicy(task);
  assert.equal(d.tier,'human_gate'); assert.equal(d.analysisOnly,true); assert.match(rolePrompt({...task,missionDecision:d},'primary',{missionDecision:d}),/analysis, review, and candidate preparation only/);
});
test('delegated reversible preflighted actions may pass the autonomous gate',()=>{
  const task=normalizeTaskInput({prompt:'update isolated preview',governance:{agentId:'platform',area:'bounded_preview_update',delegated:true,reversible:true,logged:true,preflightVerified:true}}); const d=evaluateTaskMissionPolicy(task);
  assert.equal(d.tier,'execute_reversible'); assert.equal(d.autonomousActionAllowed,true); assert.equal(d.analysisOnly,false);
});

test('role prompt carries verified EKODI truth context ahead of provider reasoning',()=>{
  const task=normalizeTaskInput({prompt:'에코디몰 주소가 뭐야?'});
  const truthContext={
    verified:true,
    service:{id:'mall',canonicalUrl:'https://ekodi.kr/ekodibiz/mall',runtimeState:'operational'},
    instruction:'Use these EKODI service facts as the current verified context.'
  };
  const prompt=rolePrompt(task,'primary',{truthContext});
  assert.match(prompt,/Verified EKODI service context/);
  assert.match(prompt,/https:\/\/ekodi\.kr\/ekodibiz\/mall/);
  assert.match(prompt,/current verified context/);
});

test('AI control prefetches EKODI truth before provider execution',async()=>{
  const task=normalizeTaskInput({prompt:'에코디몰 주소가 뭐야?'});
  const context=await truthContextForTask(task,{
    fetchFn:async()=>new Response('ok',{status:200})
  });
  assert.equal(context?.verified,true);
  assert.equal(context?.service?.id,'mall');
  assert.equal(context?.service?.canonicalUrl,'https://ekodi.kr/ekodibiz/mall');
});

test('AI control skips truth probing for unrelated prompts',async()=>{
  const task=normalizeTaskInput({prompt:'일반적인 글을 검토해줘'});
  const context=await truthContextForTask(task,{fetchFn:async()=>{throw new Error('must not run')}});
  assert.equal(context,null);
});
