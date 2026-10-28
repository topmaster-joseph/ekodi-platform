import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEkodiProtectedPromotion} from '../scripts/verify-ekodi-final-promotion-receipt.mjs';
const taskId='orch_0123456789abcdef0123456789abcdef',branchRef='ai/gpt6/'+taskId;
const releaseSha='a'.repeat(40),artifactDigest='sha256:'+'b'.repeat(64);
const valid={taskId,branchRef,releaseSha,artifactDigest};
const receipt={authorized:true,authority:'ekodi-orchestrator',...valid,
  purpose:'guarded-production-promotion-only',
  approvalId:'final_promotion_'+taskId+'_v4',productionDeployed:false};
test('exact receipt verified and no release action is performed',async()=>{
  let calls=0;
  const result=await verifyEkodiProtectedPromotion({
    ...valid,fetchImpl:async url=>{
      calls++;assert.equal(url.origin,'https://ekodi.kr');
      assert.equal(url.pathname,'/api/orchestrator/final-promotion-receipt');
      for(const [k,v] of Object.entries(valid))assert.equal(url.searchParams.get(k),v);
      return {status:200,json:async()=>receipt};
    },
  });
  assert.equal(calls,1);
  assert.equal(result.verified,true);
  assert.equal(result.productionDeployed,false);
});
test('invalid or missing task/branch/sha/digest never reaches network',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return {status:200,json:async()=>receipt}};
  for(const change of [
    {taskId:'fake'},{branchRef:'ai/claude/issue-1'},
    {releaseSha:'invalid'},{artifactDigest:'invalid'}, {artifactDigest:''},
  ])await assert.rejects(()=>verifyEkodiProtectedPromotion({...valid,...change,fetchImpl}),/EXACT_ARTIFACT_REQUIRED/);
  assert.equal(calls,0);
});
test('remote reply cannot authorize a mismatched release or forged status',async()=>{
  for(const override of [
    {authorized:false},{authority:'ai:claude'},{taskId:'fake'},
    {branchRef:'ai/claude/'+taskId},{releaseSha:'c'.repeat(40)},
    {artifactDigest:'sha256:'+'c'.repeat(64)},
    {approvalId:'fake'},{productionDeployed:true},
    {purpose:'general'},{approvalId:''},
  ]){
    const answer={...receipt,...override};
    await assert.rejects(
      ()=>verifyEkodiProtectedPromotion({...valid,fetchImpl:async()=>({
        status:override===undefined?400:200,json:async()=>answer,
      })}),
      /OWNER_APPROVAL_REQUIRED/,
    );
  }
});
test('network outage, non-200 responses and invalid JSON always fail closed',async()=>{
  await assert.rejects(()=>verifyEkodiProtectedPromotion({
    ...valid,fetchImpl:async()=>{throw Error('offline')},
  }),/RECEIPT_UNAVAILABLE/);
  await assert.rejects(()=>verifyEkodiProtectedPromotion({
    ...valid,fetchImpl:async()=>({status:503,json:async()=>({})}),
  }),/OWNER_APPROVAL_REQUIRED/);
  await assert.rejects(()=>verifyEkodiProtectedPromotion({
    ...valid,fetchImpl:async()=>({status:200,json:async()=>{throw Error('bad JSON')}}),
  }),/RECEIPT_INVALID/);
});
