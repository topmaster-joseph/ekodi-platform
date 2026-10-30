import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordVerifiedEkodiPreproductionEvidence} from '../ekodi-preproduction-evidence-ledger.js';

const taskId='orch_0123456789abcdef0123456789abcdef',branchRef='ai/gpt6/'+taskId;
const releaseSha='b'.repeat(40),artifactDigest='sha256:'+'c'.repeat(64);
const archiveDigest='sha256:'+'d'.repeat(64);
const oidc={ok:true,repository:'topmaster-joseph/ekodi-platform',ref:'refs/heads/main',
  workflowRef:'topmaster-joseph/ekodi-platform/.github/workflows/reconcile-orchestrator-completions.yml@refs/heads/main',runId:'5020'};
const evidence=()=>({
  verified:true,source:'github-actions-staging-verifier',taskId,branchRef,releaseSha,
  artifactDigest,archiveDigest,applicationDigestSource:'staging-validated-immutable-manifest',
  releaseAuthorized:false,productionDeployed:false,
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
            if(sql.includes('FROM ekodi_orchestrator_task_events')){
              if(sql.includes('verified_preproduction_evidence_recorded')){
                return options.fakeAudit?{actor:'ai:worker',evidence_json:'{}'}:
                  calls.events.length?{actor:'ekodi-github-actions-oidc-reconciler',reason:'verified_preproduction_evidence_recorded',evidence_json:JSON.stringify(calls.events.at(-1))}:null;
              }
              return options.approved?{reason:'final_promotion_approval_recorded'}:null;
            }
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
      assert.equal(update.args[2],record.state);
      assert.equal(update.args[3],record.state_version);
      assert.equal(update.args[5],record.evidence_json);
      if(options.conflict)return [{meta:{changes:0}},{meta:{changes:0}}];
      assert.doesNotMatch(update.sql,/SET evidence_json=/);
      record.state_version++;
      record.state='staging';
      calls.updates.push(update);
      assert.match(insert.sql,/THEN \? ELSE NULL END/);
      assert.equal(insert.args[0],taskId);
      assert.equal(insert.args[1],record.state_version);
      calls.events.push(JSON.parse(insert.args[6]));
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
    {artifactDigest:'sha256:invalid'},{archiveDigest:'sha256:invalid'},
    {applicationDigestSource:'worker-supplied'},{stagingRunId:0},
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
  assert.equal(calls.events[0].archiveDigest,archiveDigest);
  assert.equal(calls.events[0].requiredCiVerified,true);
  assert.equal(calls.events[0].securityReviewVerified,true);
  assert.equal(task.evidence_json,'[]','command-ledger evidence stays byte-for-byte unchanged');
  assert.equal(calls.events[0].verifiedAt,proof.verifiedAt);
  assert.equal(calls.events[0].rollbackReady,true);
  const again=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(again.recorded,true);
  assert.equal(again.idempotent,true);
  assert.equal(calls.batches,1);
});
test('OIDC verified staging proof is the sole path from production_verifying into staging',async()=>{
  const task={...row(),state:'production_verifying',evidence_json:JSON.stringify({commandLedger:{state:'verified'}})};
  const {db,calls}=dbMock(task);
  const verified=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(verified.recorded,true);
  assert.equal(verified.fromState,'production_verifying');
  assert.equal(verified.toState,'staging');
  assert.equal(task.state,'staging');
  assert.equal(task.state_version,4);
  assert.equal(calls.events.length,1);
  assert.deepEqual(JSON.parse(task.evidence_json),{commandLedger:{state:'verified'}});
  const replay=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(replay.recorded,true);
  assert.equal(replay.idempotent,true);
  assert.equal(calls.batches,1);
});
test('unverified stage cannot advance a completed command into owner confirmation',async()=>{
  const task={...row(),state:'production_verifying'};
  const {db,calls}=dbMock(task);
  for(const change of [{stagingVerified:false},{rollbackReady:false},{verified:false},
    {artifactDigest:'invalid'},{archiveDigest:'invalid'}]){
    const answer=await recordVerifiedEkodiPreproductionEvidence(db,{...evidence(),...change},oidc);
    assert.equal(answer.recorded,false);
    assert.equal(task.state,'production_verifying');
  }
  assert.equal(calls.batches,0);
});
test('a prior staging audit cannot resurrect an out-of-order production_verifying task',async()=>{
  const task=row(),{db,calls}=dbMock(task);
  assert.equal((await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc)).recorded,true);
  task.state='production_verifying';
  const answer=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(answer.recorded,false);
  assert.equal(answer.reason,'prior_staging_attestation_not_releasable');
  assert.equal(calls.batches,1);
});
test('worker-authored matching task proof without OIDC audit cannot claim idempotent success',async()=>{
  const proof=evidence();
  const existing={...row(),evidence_json:JSON.stringify({preproductionProof:{
    authority:'ekodi-orchestrator',taskId,branchRef,releaseSha,artifactDigest,archiveDigest,
    requiredCiVerified:true,securityReviewVerified:true,stagingVerified:true,
    rollbackReady:true,verifiedAt:proof.verifiedAt,
  }})};
  const {db,calls}=dbMock(existing,{fakeAudit:true});
  const r=await recordVerifiedEkodiPreproductionEvidence(db,proof,oidc);
  assert.equal(r.recorded,false);
  assert.equal(r.reason,'conflicting_or_untrusted_stage_attestation');
  assert.equal(calls.batches,0);
});

test('worker progress evidence never replaces the OIDC staging audit or receives its authority',async()=>{
  const userProgress={commandLedger:{state:'running',attemptCount:2},items:[{source:'worker',result:'unverified'}]};
  const rowWithProgress={...row(),evidence_json:JSON.stringify(userProgress)};
  const {db,calls}=dbMock(rowWithProgress);
  const first=await recordVerifiedEkodiPreproductionEvidence(db,evidence(),oidc);
  assert.equal(first.recorded,true);
  assert.deepEqual(JSON.parse(rowWithProgress.evidence_json),userProgress);
  assert.equal(calls.events.length,1);
  assert.equal(calls.events[0].authority,'ekodi-orchestrator');
  const changedArtifact=await recordVerifiedEkodiPreproductionEvidence(db,{
    ...evidence(),artifactDigest:'sha256:'+'e'.repeat(64),
  },oidc);
  assert.equal(changedArtifact.recorded,false);
  assert.equal(changedArtifact.reason,'conflicting_or_untrusted_stage_attestation');
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
test('verified command progress cannot erase staging hold or mutable task evidence',()=>{
  const adapter=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  const stageWriter=readFileSync(new URL('../ekodi-preproduction-evidence-ledger.js',import.meta.url),'utf8');
  assert.match(adapter,/next=row\.state==='staging'\?'staging':'production_verifying'/);
  assert.match(adapter,/const evidencePayload=rawEvidence/);
  assert.doesNotMatch(stageWriter,/SET evidence_json=\?/);
  assert.match(stageWriter,/audit event is the sole authoritative source/);
});

test('OIDC receiver and scheduled verifier remain first-party and never deploy',()=>{
  const adapter=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/reconcile-orchestrator-completions.yml',import.meta.url),'utf8');
  assert.match(adapter,/verifyGitHubActionsOidc\(bearer\(request\)/);
  assert.match(adapter,/recordVerifiedEkodiPreproductionEvidence\(db,body.evidence,oidc\)/);
  assert.match(workflow,/collectEkodiPreproductionEvidence/);
  assert.match(workflow,/candidate.state === 'staging' \|\| candidate.state === 'production_verifying'/);
  assert.match(workflow,/action:'attest_staging'/);
  assert.doesNotMatch(workflow,/automatic_final_owner_approval/);
});
