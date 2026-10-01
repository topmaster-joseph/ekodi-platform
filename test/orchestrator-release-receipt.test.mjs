import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrchestratorReleaseReceipt, verifyOrchestratorReleaseReceipt } from '../ekodi-orchestrator-task-adapter.js';

const taskId='orch_00000000-0000-4000-8000-000000000001';
const branchRef=`ai/chatgpt/${taskId}`;

function envWith(row){
  return {
    DB:{
      prepare(sql){
        assert.match(sql,/SELECT task_id,branch_ref,state,permission_class,deployment_requested FROM ekodi_orchestrator_tasks/);
        return {
          bind(id){
            return {first:async()=>id===row?.task_id?row:null};
          },
        };
      },
    },
  };
}

test('release receipt authorizes only a delegated deployment task on its orchestrator-issued branch',async()=>{
  const row={
    task_id:taskId,
    branch_ref:branchRef,
    state:'assigned',
    permission_class:'delegated',
    deployment_requested:1,
    requester_id:'must-not-leak',
    intent:'must-not-leak',
  };
  const result=await verifyOrchestratorReleaseReceipt(envWith(row),{taskId,branchRef});
  assert.deepEqual(result,{
    authorized:true,
    taskId,
    branchRef,
    state:'assigned',
    authority:'ekodi-orchestrator',
  });
  assert.doesNotMatch(JSON.stringify(result),/must-not-leak/);
});

test('release receipt fails closed for branch mismatch, non-deployment and terminal failures',async()=>{
  const base={task_id:taskId,branch_ref:branchRef,state:'assigned',permission_class:'delegated',deployment_requested:1};
  let result=await verifyOrchestratorReleaseReceipt(envWith(base),{taskId,branchRef:`ai/codex/${taskId}`});
  assert.equal(result.authorized,false);
  assert.equal(result.reason,'branch_mismatch');

  result=await verifyOrchestratorReleaseReceipt(envWith({...base,deployment_requested:0}),{taskId,branchRef});
  assert.equal(result.reason,'deployment_not_delegated');

  result=await verifyOrchestratorReleaseReceipt(envWith({...base,state:'failed'}),{taskId,branchRef});
  assert.equal(result.reason,'task_not_releasable');
});

test('public receipt endpoint returns only bounded non-sensitive authority evidence',async()=>{
  const row={task_id:taskId,branch_ref:branchRef,state:'executing',permission_class:'delegated',deployment_requested:1,requester_id:'private',intent:'private'};
  const request=new Request(`https://ekodi.kr/api/orchestrator/release-receipt?taskId=${encodeURIComponent(taskId)}&branchRef=${encodeURIComponent(branchRef)}`);
  const response=await handleOrchestratorReleaseReceipt(request,envWith(row));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.authorized,true);
  assert.equal(body.authority,'ekodi-orchestrator');
  assert.doesNotMatch(JSON.stringify(body),/private/);
});

test('public receipt endpoint does not reveal whether malformed identifiers exist',async()=>{
  const response=await handleOrchestratorReleaseReceipt(
    new Request('https://ekodi.kr/api/orchestrator/release-receipt?taskId=bad&branchRef=bad'),
    envWith(null),
  );
  assert.equal(response.status,400);
  const body=await response.json();
  assert.deepEqual(body,{ok:false,authorized:false,reason:'invalid_receipt'});
});
