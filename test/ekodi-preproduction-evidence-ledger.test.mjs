import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordVerifiedEkodiPreproductionEvidence} from '../ekodi-preproduction-evidence-ledger.js';

const taskId='orch_0123456789abcdef0123456789abcdef',branchRef='ai/gpt6/'+taskId;
const releaseSha='b'.repeat(40),artifactDigest='sha256:'+'c'.repeat(64);
const oidc={ok:true,repository:'topmaster-joseph/ekodi-platform',ref:'refs/heads/main',
  workflowRef:'topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main',runId:'5020'};
const evidence=()=>({
  verified:true,source:'github-actions-staging-verifier',taskId,branchRef,releaseSha,
  artifactDigest,releaseAuthorized:false,productionDeployed:false,
  requiredCiVerified:true,securityReviewVerified:true,stagingVerified:true,rollbackReady:true,
  stagingRunId:4500,artifactId:5500,sourceHeadSha:'a'.repeat(40),
  verifiedAt:new Date().toISOString(),
});
const row=()=>({task_id:taskId,branch_ref:branchRef,state:'staging',state_version:3,
  permission_class:'delegated',deployment_requested:1,evidence_json:'[]'});

function dbMock(record=row(),options={}){
  const calls={events:[],updates:[],batches:0};
  return {calls,db:{
    prepare(sql){
      return {bind(...args){
        return {
          sql,args,
          first:async()=>{
            if(sql.includes('FROM ekodi_orchestrator_tasks'))return record;
            if(sql.includes('FROM ekodi_orchestrator_task_events'))return options.approved?{reason:'final_promotion_approval_recorded'}:null;
            throw Error('unexpected SQL');
          },
        };
      }};
    },
    async batch(statements){
      calls.batches++;
      if(options.throwBatch)throw Error('D1 unavailable');
      const [update,insert]=statements;
      assert.match(update.sql,/state_version=state_version\+1/);
      assert.match(insert.sql,/verified_preproduction_evidence_recorded/);
      assert.equal(update.args[3],record.state_version);
      assert.equal(update.args[5],record.evidence_json);
      if(options.conflict)return [{meta:{changes:0}},{meta:{changes:0}}];
      record.evidence_json=update.args[0];
      record.state_version++;
      calls.updates.push(update);
      assert.match(insert.sql,/THEN \? ELSE NULL END/);
      assert.equal(insert.args[0],taskId);
      assert.equal(insert.args[1],record.state_version);
      calls.events.push(JSON.parse(insert.args[5]));
      return [{meta:{changes:1}},{meta:{changes:1}}];
    },
  }};
}
test('signed main-branch reconciliation workflow is mandatory, no client boolean can bypass it',async()=>{
  const {db,calls}=dbMock();
  for(const claim of [{},{...oidc,ok:false},{...oidc,ref:'refs/pull/1/merge'},
    {...oidc,workflowRef:'owner/repo/.github/workflows/reconcile-orchestrator-completions.yml@main'},
    {...oidc,runId:'0'},
    {...oidc,workflowRef:'topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main-evil'}]){
    const res=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),claim);
    assert.equal(res.recorded,false);
    assert.equal(res.reason,'trusted_reconciler_oidc_required');
  }
  assert.equal(calls.batches,0);
});
test('unsafe, invalid and stale staging inputs fail before task write',async()=>{
  for(const change of [
    {verified:false},{source:'model'},{releaseAuthorized:true},{productionDeployed:true},
    {requiredCiVerified:false},{securityReviewVerified:false},{stagingVerified:false},{rollbackReady:false},
    {artifactDigest:'sha256:invalid'},{stagingRunId:0},
    {branchRef:'ai/claude/issue-3805'},{verifiedAt:'2020-01-01T00:00:00Z'},
  ]){
    const {db,calls}=dbMock();
    const res=await recordVerifiedEkodiPreproductionEvidence(db,{...evidence(),...change},oidc);
    assert.equal(res.recorded,false);
    assert.equal(calls.batches,0);
  }
});
test('task state, branch and existing final approval block recording',async()=>{
  for(const changed of [
    {state:'assigned'},{state:'completed'},{branch_ref:'ai/claude/'+taskId},
    {permission_class:'unapproved'},{deployment_requested:0},
  ]){
    const {db,calls}=dbMock({...row(),...changed});
    assert.equal((await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc)).recorded,false);
    assert.equal(calls.batches,0);
  }
  const {db}=dbMock(row(),{approved:true});
  assert.equal((await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc)).reason,'approval_already_recorded');
});
test('one authenticated staged proof commits a versioned task record and audit event, not a deployment',async()=>{
  const task=row(),{db,calls}=dbMock(task),proof=evidence();
  const res=await recordVerifiedEkodiPreproductionEvidence(db,proof,oidc);
  assert.equal(res.recorded,true);
  assert.equal(res.approvalGranted,false);
  assert.equal(res.productionDeployed,false);
  assert.equal(res.stateVersion,4);
  assert.equal(task.state_version,4);
  assert.equal(calls.events.length,1);
  assert.equal(calls.events[0].source,'github-actions-oidc');
  assert.equal(calls.events[0].workflowRunId,5020);
  assert.equal(calls.events[0].artifactDigest,artifactDigest);
  const taskProof=JSON.parse(task.evidence_json).preproductionProof;
  assert.equal(taskProof.verifiedAt,proof.verifiedAt);
  assert.equal(taskProof.rollbackReady,true);
  const again=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(again.recorded,true);
  assert.equal(again.idempotent,true);
  assert.equal(calls.batches,1);
});
test('stale concurrent CAS and D1 outage fail closed',async()=>{
  for(const options of [{conflict:true},{throwBatch:true}]){
    const {db}=dbMock(row(),options);
    const res=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
    assert.equal(res.recorded,false);
    assert.equal(res.productionDeployed,false);
  }
});
test('OIDC receiver and scheduled verifier remain first-party and never deploy',()=>{
  const adapter=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/reconcile-orchestrator-completions.yml',import.meta.url),'utf8');
  assert.match(adapter,/verifyGitHubActionsOidc\(bearer\(request\)/);
  assert.match(adapter,/recordVerifiedEkodiPreproductionEvidence\(db,body.evidence,oidc\)/);
  assert.match(workflow,/collectEkodiPreproductionEvidence/);
  assert.match(workflow,/candidate.state === 'staging'/);
  assert.match(workflow,/action:'attest_staging'/);
  assert.doesNotMatch(workflow,/automatic_final_owner_approval/);
});
