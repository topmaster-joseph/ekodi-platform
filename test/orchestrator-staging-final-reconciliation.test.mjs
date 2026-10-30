import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagingPromotionApprovalIsValid } from '../ekodi-orchestrator-task-adapter.js';

const taskId='orch_0123456789abcdef0123456789abcdef';
const branchRef='ai/gpt6/'+taskId,releaseSha='a'.repeat(40);
const artifactDigest='sha256:'+'b'.repeat(64),archiveDigest='sha256:'+'c'.repeat(64);
const verifiedAt=new Date(Date.now()-120_000).toISOString();
const approvedAt=new Date(Date.now()-60_000).toISOString();
const task={
  task_id:taskId,branch_ref:branchRef,state:'staging',state_version:4,
  permission_class:'delegated',deployment_requested:1,
  evidence_json:'[]',
};
const stage={
  actor:'ekodi-github-actions-oidc-reconciler',
  reason:'verified_preproduction_evidence_recorded',
  evidence_json:JSON.stringify({
    authority:'ekodi-orchestrator',source:'github-actions-oidc',taskId,branchRef,
    releaseSha,artifactDigest,archiveDigest,verifiedAt,workflowRunId:5020,
    requiredCiVerified:true,stagingVerified:true,rollbackReady:true,securityReviewVerified:true,
  }),
};
const owner={
  actor:'super-admin:platform-admin:001',
  reason:'final_promotion_approval_recorded',
  evidence_json:JSON.stringify({
    approved:true,authority:'ekodi-orchestrator',scope:'production_promotion',
    approvedByRole:'super_admin',approvedBy:'platform-admin:001',
    taskId,branchRef,releaseSha,artifactDigest,stateVersion:4,
    approvalId:`final_promotion_${taskId}_v4`,approvedAt,
  }),
};
const production={pr:{mergeCommitSha:releaseSha}};
function dbFixture({taskRow=task,stageEvent=stage,ownerEvent=owner,throwQuery=false}={}){
  const queries=[];
  return {queries,db:{prepare(sql){
    queries.push(sql);
    if(throwQuery)throw Error('database offline');
    const r=sql.includes('FROM ekodi_orchestrator_tasks')?taskRow:
      sql.includes('verified_preproduction_evidence_recorded')?stageEvent:
      sql.includes('final_promotion_approval_recorded')?ownerEvent:null;
    return {bind(){return {first:async()=>r}}};
  }}};
}

test('stage with verified post-staging owner receipt may enter separate completion verification',async()=>{
  const {db,queries}=dbFixture();
  assert.equal(await stagingPromotionApprovalIsValid(db,task,production),true);
  assert.ok(queries.some(q=>q.includes('verified_preproduction_evidence_recorded')));
  assert.ok(queries.some(q=>q.includes('final_promotion_approval_recorded')));
});
test('missing or untrusted owner, wrong merged SHA and incomplete OIDC proof hold',async()=>{
  const cases=[
    {stageEvent:null},{ownerEvent:null},
    {ownerEvent:{...owner,actor:'ai:worker'}},
    {ownerEvent:{...owner,evidence_json:JSON.stringify({...JSON.parse(owner.evidence_json),releaseSha:'d'.repeat(40)})}},
    {stageEvent:{...stage,evidence_json:JSON.stringify({...JSON.parse(stage.evidence_json),rollbackReady:false})}},
    {taskRow:{...task,state_version:5}}, {throwQuery:true},
  ];
  for(const params of cases){
    const {db}=dbFixture(params);
    assert.equal(await stagingPromotionApprovalIsValid(db,task,production),false);
  }
  const {db}=dbFixture();
  assert.equal(await stagingPromotionApprovalIsValid(db,task,{pr:{mergeCommitSha:'e'.repeat(40)}}),false);
});
test('legacy non-staged completion remains independently verified, but staged tasks never skip approval',async()=>{
  assert.equal(await stagingPromotionApprovalIsValid(dbFixture({stageEvent:null}).db,{...task,state:'production_verifying'},production),true);
  assert.equal(await stagingPromotionApprovalIsValid(dbFixture({stageEvent:null}).db,task,production),false);
  assert.equal(await stagingPromotionApprovalIsValid(dbFixture({stageEvent:stage}).db,{...task,state:'production_verifying'},production),false);
});
test('protected completion is also enforced on canonical completion route and state-version CAS',()=>{
  const source=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/reconcile-orchestrator-completions.yml',import.meta.url),'utf8');
  assert.match(source,/if\(!await stagingPromotionApprovalIsValid\(db,row,body\.evidence\)\)/);
  assert.match(source,/if\(!await stagingPromotionApprovalIsValid\(db,row,evidence\)\)return row/);
  assert.match(source,/AND state_version=\?/);
  assert.match(workflow,/candidate\.state === 'staging' \|\| candidate\.state === 'production_verifying'/);
  assert.match(workflow,/production_completion_check/);
  assert.match(workflow,/action: 'complete'/);
});
