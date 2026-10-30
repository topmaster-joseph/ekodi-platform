import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagingPromotionApprovalIsValid, persistCompletionEvidence } from '../ekodi-orchestrator-task-adapter.js';

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


test('candidate endpoint avoids repeated GitHub API reads after authoritative staging event',()=>{
  const adapter=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/reconcile-orchestrator-completions.yml',import.meta.url),'utf8');
  assert.match(adapter,/AS staging_attested/);
  assert.match(adapter,/AS owner_confirmation_recorded/);
  assert.match(workflow,/candidate\.stagingAttested === true/);
  assert.match(workflow,/candidate\.ownerConfirmationRecorded !== true/);
  assert.match(workflow,/await_final_owner_confirmation/);
  assert.match(workflow,/action: 'complete'/);
});

test('production completion and audit commit together or not at all under CAS',async()=>{
  const evidence={
    source:'github-actions-authenticated-api',
    pr:{number:5555,url:'https://github.com/topmaster-joseph/ekodi-platform/pull/5555',mergeCommitSha:releaseSha},
    requiredWorkflows:[{name:'CI',conclusion:'success'}],
    deployments:[{workflow:'Deploy Control API',stagingJobs:['staging'],productionJobs:['production']}],
    live:{ok:true},
  };
  function fixture({failAudit=false,conflict=false}={}){
    const item={...task,requester_id:'person-1',result_json:'{}',production_evidence_json:null};
    const events=[];
    let batchCount=0;
    const db={
      prepare(sql){
        return {sql,bind(...args){return {
          sql,args,
          async first(){
            if(sql.includes('FROM ekodi_orchestrator_tasks'))return item;
            if(sql.includes('verified_preproduction_evidence_recorded'))return stage;
            if(sql.includes('final_promotion_approval_recorded'))return owner;
            return null;
          },
          async run(){return {meta:{changes:1}};},
        }}};
      },
      async batch(statements){
        batchCount++;
        if(statements.length!==2)return statements.map(()=>({meta:{changes:1}}));
        if(statements[0].sql.startsWith('UPDATE ekodi_orchestrator_tasks')){
          const [update,audit]=statements;
          assert.match(update.sql,/AND state_version=\?/);
          assert.match(audit.sql,/THEN \? ELSE NULL END/);
          if(failAudit)throw Error('D1 audit conflict');
          if(conflict){item.state_version++;throw Error('D1 lost CAS');}
          item.state='completed';
          item.state_version++;
          item.production_evidence_json=update.args[3];
          events.push(JSON.parse(audit.args[9]));
        }
        return statements.map(()=>({meta:{changes:1}}));
      },
    };
    return {db,item,events,getBatchCount:()=>batchCount};
  }
  const success=fixture();
  const completed=await persistCompletionEvidence(success.db,success.item,evidence);
  assert.equal(completed.state,'completed');
  assert.equal(completed.state_version,5);
  assert.equal(success.events.length,1);
  assert.equal(success.events[0].kind,'production-completion-reconciliation');
  for(const options of [{failAudit:true},{conflict:true}]){
    const state=fixture(options);
    const result=await persistCompletionEvidence(state.db,state.item,evidence);
    assert.equal(result.state,'staging');
    assert.equal(state.events.length,0);
  }
});
