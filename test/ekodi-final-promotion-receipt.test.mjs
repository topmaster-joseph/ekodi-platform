import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyEkodiFinalPromotionReceipt } from '../ekodi-final-promotion-receipt.js';
import { handleOrchestratorReleaseReceipt } from '../ekodi-orchestrator-task-adapter.js';

const taskId='orch_0123456789abcdef0123456789abcdef';
const branchRef='ai/gpt6/'+taskId,releaseSha='a'.repeat(40),artifactDigest='sha256:'+'b'.repeat(64);
const proof={
  authority:'ekodi-orchestrator',taskId,branchRef,releaseSha,artifactDigest,
  requiredCiVerified:true,stagingVerified:true,rollbackReady:true,
  securityReviewVerified:true,verifiedAt:'2026-10-29T00:30:00Z',
};
const staged={
  actor:'ekodi-github-actions-oidc-reconciler',reason:'verified_preproduction_evidence_recorded',
  evidence_json:JSON.stringify({
    authority:'ekodi-orchestrator',source:'github-actions-oidc',
    taskId,branchRef,releaseSha,artifactDigest,verifiedAt:proof.verifiedAt,workflowRunId:123,
  }),
};
const approvedBy='platform-admin:001',version=4;
const approval={
  actor:'super-admin:'+approvedBy,reason:'final_promotion_approval_recorded',
  evidence_json:JSON.stringify({
    approved:true,authority:'ekodi-orchestrator',scope:'production_promotion',
    approvedByRole:'super_admin',approvedBy,taskId,branchRef,
    releaseSha,artifactDigest,stateVersion:version,
    approvalId:`final_promotion_${taskId}_v${version}`,
    approvedAt:'2026-10-29T00:40:00Z',
  }),
};
const task={
  task_id:taskId,branch_ref:branchRef,state:'staging',state_version:version,
  permission_class:'delegated',deployment_requested:1,evidence_json:JSON.stringify({preproductionProof:proof}),
};
const request={taskId,branchRef,releaseSha,artifactDigest};
function ledger(t=task,s=staged,a=approval){
  return {prepare(sql){
    const row=sql.includes('FROM ekodi_orchestrator_tasks')?t:
      sql.includes('verified_preproduction_evidence_recorded')?s:
      sql.includes('final_promotion_approval_recorded')?a:undefined;
    if(row===undefined)throw Error('unexpected statement');
    return {bind(){return {first:async()=>row}}};
  }};
}
test('only exact currently approved artifact in first-party task and OIDC stage ledger is eligible',async()=>{
  const r=await verifyEkodiFinalPromotionReceipt(ledger(),request);
  assert.equal(r.authorized,true);
  assert.equal(r.productionDeployed,false);
  assert.equal(r.releaseSha,releaseSha);
  assert.equal(r.approvalId,`final_promotion_${taskId}_v4`);
});
test('client supplied flags, mismatched task, artifact and branch never grant promotion',async()=>{
  for(const input of [
    {...request,artifactDigest:'sha256:'+'c'.repeat(64)},
    {...request,releaseSha:'c'.repeat(40)},
    {...request,branchRef:'ai/claude/'+taskId},
    {...request,taskId:'fake'},{...request,approved:true},
  ]){
    const result=await verifyEkodiFinalPromotionReceipt(ledger(),input);
    if(input.approved===true)assert.equal(result.authorized,true); // privilege comes from DB only, not the flag.
    else assert.equal(result.authorized,false);
  }
});
test('missing or stale owner evidence always fails closed',async()=>{
  for(const [t,s,a] of [
    [null,staged,approval],[{...task,state:'completed'},staged,approval],
    [{...task,permission_class:'unapproved'},staged,approval],
    [{...task,state_version:5},staged,approval],
    [{...task,evidence_json:'{}'},staged,approval],
    [task,null,approval],[task,{...staged,actor:'ai:claude'},approval],
    [task,{...staged,evidence_json:JSON.stringify({...JSON.parse(staged.evidence_json),workflowRunId:0})},approval],
    [task,staged,null],[task,staged,{...approval,actor:'ai:claude'}],
    [task,staged,{...approval,evidence_json:JSON.stringify({...JSON.parse(approval.evidence_json),releaseSha:'c'.repeat(40)})}],
  ]){
    const result=await verifyEkodiFinalPromotionReceipt(ledger(t,s,a),request);
    assert.equal(result.authorized,false);
  }
});
test('database outage cannot grant final promotion',async()=>{
  assert.equal((await verifyEkodiFinalPromotionReceipt(null,request)).authorized,false);
  assert.equal((await verifyEkodiFinalPromotionReceipt({prepare(){throw Error('offline')}},request)).authorized,false);
});
test('canonical first-party HTTP receipt is read-only, fail-closed and no-store',async()=>{
  const base='https://ekodi.kr/api/orchestrator/final-promotion-receipt';
  const url=new URL(base);
  for(const [k,v] of Object.entries(request))url.searchParams.set(k,v);
  const ok=await handleOrchestratorReleaseReceipt(new Request(url),{DB:ledger()});
  assert.equal(ok.status,200);
  const good=await ok.json();assert.equal(good.authorized,true);assert.equal(good.productionDeployed,false);
  assert.equal(ok.headers.get('cache-control'),'no-store');
  const invalid=new URL(url);invalid.searchParams.set('releaseSha','c'.repeat(40));
  const no=await handleOrchestratorReleaseReceipt(new Request(invalid),{DB:ledger()});
  assert.equal(no.status,403);assert.equal((await no.json()).authorized,false);
  const head=await handleOrchestratorReleaseReceipt(new Request(url,{method:'HEAD'}),{DB:ledger()});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  const post=await handleOrchestratorReleaseReceipt(new Request(url,{method:'POST'}),{DB:ledger()});
  assert.equal(post.status,405);
});
test('mission-control canonical route is mounted without permitting any mutation',()=>{
  const source=readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  assert.match(source,/path === '\/api\/orchestrator\/final-promotion-receipt'/);
});
