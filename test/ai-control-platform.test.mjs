import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_CONTROL_POLICY,availableProviderIds,buildExecutionPlan,createTaskId,normalizeTaskInput,rolePrompt,summarizeRuns} from '../ai-control-core.js';

test('coding work requests an isolated branch',()=>{
  const task=normalizeTaskInput({prompt:'관리자 페이지 코딩을 수정하고 Git 브랜치에서 검증해',mode:'primary-review'});
  assert.equal(task.needsCodeBranch,true);
  assert.equal(task.mode,'primary-review');
});

test('free official provider stays ahead of external workers',()=>{
  const task=normalizeTaskInput({prompt:'검토해줘',mode:'parallel'});
  const plan=buildExecutionPlan(task,{geminiFree:true,workerProviders:['claude','chatgpt','notebooklm']});
  assert.deepEqual(plan.map(item=>item.providerId),['gemini-free','worker:claude','worker:chatgpt']);
  assert.equal(plan.length,AI_CONTROL_POLICY.maxParallelProviders);
});

test('primary-review assigns two workers when available',()=>{
  const task=normalizeTaskInput({prompt:'이 설계를 상호 검토해줘'});
  const plan=buildExecutionPlan(task,{geminiFree:true,workerProviders:['claude']});
  assert.deepEqual(plan,[{providerId:'gemini-free',role:'primary'},{providerId:'worker:claude',role:'reviewer'}]);
});

test('provider inventory is normalized and unique',()=>{
  assert.deepEqual(availableProviderIds({geminiFree:true,workerProviders:['Claude','chatgpt','Claude']}),['gemini-free','worker:claude','worker:chatgpt']);
});

test('role prompt carries branch and central gate context',()=>{
  const task=normalizeTaskInput({prompt:'코드를 수정해'});
  const prompt=rolePrompt(task,'reviewer',{branch:'ai/generic/task-1'});
  assert.match(prompt,/ai\/generic\/task-1/);
  assert.match(prompt,/central review, merge, and deployment gate/);
});

test('successful AI work still needs human approval',()=>{
  const summary=summarizeRuns([{providerId:'gemini-free',ok:true},{providerId:'worker:claude',ok:false}]);
  assert.equal(summary.successful,1);
  assert.equal(summary.failed,1);
  assert.equal(summary.needsHumanApproval,true);
});

test('task ids are branch-safe identifiers',()=>{
  const id=createTaskId(new Date('2026-09-02T00:00:00.000Z'),()=>0.5);
  assert.match(id,/^task-20260902000000-[a-z0-9]{4}$/);
});
