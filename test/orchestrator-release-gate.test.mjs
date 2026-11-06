import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  ORCHESTRATOR_RELEASE_RECEIPT_ENDPOINT,
  parseOrchestratorReleaseBranch,
  validateOrchestratorReleaseReceiptPayload,
  verifyOrchestratorReleaseReceipt,
} from '../scripts/orchestrator-release-receipt.mjs';

const taskId='orch_00000000-0000-4000-8000-000000000001';
const branchRef=`ai/chatgpt/${taskId}`;

function body(overrides={}){
  return {
    authorized:true,
    taskId,
    branchRef,
    state:'assigned',
    authority:'ekodi-orchestrator',
    ...overrides,
  };
}

test('canonical release receipt verifier accepts only orchestrator branch shape',()=>{
  assert.deepEqual(parseOrchestratorReleaseBranch(branchRef),{agent:'chatgpt',taskId,branchRef});
  assert.equal(parseOrchestratorReleaseBranch('ai/chatgpt/feature-name'),null);
  assert.equal(ORCHESTRATOR_RELEASE_RECEIPT_ENDPOINT,'https://ekodi.kr/api/orchestrator/release-receipt');
});

test('authorized release receipt is verified against canonical task and branch',async()=>{
  let seen='';
  const fetchImpl=async url=>{
    seen=String(url);
    return new Response(JSON.stringify(body()),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl});
  assert.deepEqual(result,{taskId,branchRef,authority:'ekodi-orchestrator',state:'assigned'});
  const url=new URL(seen);
  assert.equal(url.origin,'https://ekodi.kr');
  assert.equal(url.pathname,'/api/orchestrator/release-receipt');
  assert.equal(url.searchParams.get('taskId'),taskId);
  assert.equal(url.searchParams.get('branchRef'),branchRef);
});

for(const [name,status,payload,pattern] of [
  ['404 not_found',404,{authorized:false,reason:'not_found'},/not_found/],
  ['branch mismatch',404,{authorized:false,reason:'branch_mismatch'},/branch_mismatch/],
  ['non-deployment receipt',404,{authorized:false,reason:'deployment_not_delegated'},/deployment_not_delegated/],
  ['non-releasable task',404,{authorized:false,reason:'task_not_releasable'},/task_not_releasable/],
]){
  test(`release receipt payload fails closed for ${name}`,()=>{
    assert.throws(
      ()=>validateOrchestratorReleaseReceiptPayload({status,body:payload,branchRef}),
      pattern,
    );
  });
}

test('release receipt verifier fails closed on network and timeout errors',async()=>{
  await assert.rejects(
    verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>{throw new Error('connection refused')}}),
    /verifier unavailable: connection refused/,
  );
  await assert.rejects(
    verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>{const error=new Error('timed out');error.name='TimeoutError';throw error}}),
    /verifier unavailable: timeout/,
  );
});

test('release receipt verifier fails closed on malformed response JSON',async()=>{
  await assert.rejects(
    verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>new Response('not-json',{status:200})}),
    /malformed JSON/,
  );
});

test('receipt branch, task id and authority must match exactly',()=>{
  assert.throws(
    ()=>validateOrchestratorReleaseReceiptPayload({status:200,body:body(),branchRef:'ai/chatgpt/not-an-orchestrator-task'}),
    /must be orchestrator-issued/,
  );
  assert.throws(
    ()=>validateOrchestratorReleaseReceiptPayload({status:200,body:body(),branchRef,explicitTaskId:'orch_00000000-0000-4000-8000-000000000099'}),
    /taskId does not match/,
  );
  assert.throws(
    ()=>validateOrchestratorReleaseReceiptPayload({status:200,body:body({branchRef:`ai/codex/${taskId}`}),branchRef}),
    /branch mismatch/,
  );
  assert.throws(
    ()=>validateOrchestratorReleaseReceiptPayload({status:200,body:body({authority:'external-ai'}),branchRef}),
    /authority mismatch/,
  );
});

test('receipt verifier returns only bounded non-sensitive authority evidence',()=>{
  const result=validateOrchestratorReleaseReceiptPayload({
    status:200,
    branchRef,
    body:body({
      requester:'private-requester',
      intent:'private-intent',
      bearerToken:'private-token',
      refreshToken:'private-refresh',
    }),
  });
  const serialized=JSON.stringify(result);
  assert.doesNotMatch(serialized,/private-requester|private-intent|private-token|private-refresh/);
  assert.match(serialized,/ekodi-orchestrator/);
});


test('deployment workflows accept the canonical orchestrator task-id grammar',async()=>{
  const files=['deploy-site-core.yml','deploy-independent-board.yml','stage-shared-site-shell.yml'];
  for(const name of files){
    const source=await readFile(new URL('../.github/workflows/'+name,import.meta.url),'utf8');
    assert.ok(source.includes('(orch_[A-Za-z0-9_-]+)'),name);
    assert.equal(source.includes('(orch_[A-Za-z0-9-]+)'),false,name);
  }
  const underscored='ai/openai/orch_shared_site_dispatch_contract_20261007';
  assert.ok(parseOrchestratorReleaseBranch(underscored));
});

test('temporary release-receipt server 500 recovers only after a fresh exact authorized 200',async()=>{
  let attempts=0;
  const fetchImpl=async()=>{
    attempts++;
    if(attempts===1)return new Response('{"ok":false,"reason":"ORCHESTRATOR_RELEASE_RECEIPT_ERROR"}',{status:500});
    return new Response(JSON.stringify(body()),{status:200});
  };
  const receipt=await verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl});
  assert.equal(attempts,2);
  assert.deepEqual(receipt,{taskId,branchRef,authority:'ekodi-orchestrator',state:'assigned'});
});

test('persistent release-receipt 5xx cannot be mistaken for approval after bounded retries',async()=>{
  let attempts=0;
  await assert.rejects(verifyOrchestratorReleaseReceipt(branchRef,{
    fetchImpl:async()=>{attempts++;return new Response('upstream unavailable',{status:503})}
  }),/orchestrator release receipt rejected: http_503/);
  assert.equal(attempts,3);
});

test('release authorization denial, malformed successful response and wrong branch are never retried',async()=>{
  for(const [status,payload,expected] of [
    [403,{authorized:false,reason:'permission_denied'},/permission_denied/],
    [404,{authorized:false,reason:'not_found'},/not_found/],
    [200,body({authorized:false,reason:'deployment_not_delegated'}),/deployment_not_delegated/],
    [200,body({branchRef:'ai/codex/'+taskId}),/branch mismatch/],
  ]){
    let attempts=0;
    await assert.rejects(verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>{
      attempts++;
      return new Response(JSON.stringify(payload),{status});
    }}),expected);
    assert.equal(attempts,1,'denied receipts must not be retried');
  }
  let attempts=0;
  await assert.rejects(verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>{
    attempts++;
    return new Response('not JSON',{status:200});
  }}),/malformed JSON/);
  assert.equal(attempts,1);
});

test('one transient timeout may retry but must still verify actual authority',async()=>{
  let attempts=0;
  const answer=await verifyOrchestratorReleaseReceipt(branchRef,{fetchImpl:async()=>{
    attempts++;
    if(attempts===1){const e=new Error('network timeout');e.name='TimeoutError';throw e}
    return new Response(JSON.stringify(body()),{status:200});
  }});
  assert.equal(attempts,2);
  assert.equal(answer.authority,'ekodi-orchestrator');
});
