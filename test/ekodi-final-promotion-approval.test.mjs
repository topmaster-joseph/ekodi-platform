import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordEkodiFinalPromotionApproval } from '../ekodi-final-promotion-approval.js';
import { evaluateEkodiContinuousExecutionFromLedger } from '../ekodi-continuous-execution-gate.js';

const taskId='orch_final_0123456789abcdefabcdef';
const branchRef='ai/gpt6/'+taskId;
const releaseSha='1'.repeat(40);
const artifactDigest='sha256:'+'2'.repeat(64);
const archiveDigest='sha256:'+'4'.repeat(64);
const actor='platform-admin:123';
const preproductionProof={
  authority:'ekodi-orchestrator',taskId,branchRef,releaseSha,artifactDigest,archiveDigest,
  requiredCiVerified:true,stagingVerified:true,rollbackReady:true,
  securityReviewVerified:true,verifiedAt:'2026-10-28T20:00:00Z',
};
const buildRow=()=>({
  task_id:taskId,branch_ref:branchRef,state:'staging',state_version:3,
  permission_class:'delegated',deployment_requested:1,
  evidence_json:JSON.stringify({items:[{source:'worker'}],commandLedger:{state:'running',attemptCount:2}}),
});
const request=(overrides={})=>({
  taskId,releaseSha,artifactDigest,expectedStateVersion:3,
  authorizedSuperAdminPersonId:actor,...overrides,
});

function mockDb(row=buildRow(),{commit=true,failBatch=false,stagingAttestation=true,stagingAttestationValid=true,stagingProofOverride={}}={}){
  const trace={sql:[],events:[],batchCalls:0};
  const stagingEvent={actor:'ekodi-github-actions-oidc-reconciler',reason:'verified_preproduction_evidence_recorded',evidence_json:JSON.stringify({authority:'ekodi-orchestrator',source:'github-actions-oidc',taskId,branchRef,releaseSha:stagingAttestationValid?releaseSha:'3'.repeat(40),artifactDigest,archiveDigest,verifiedAt:preproductionProof.verifiedAt,workflowRunId:123456,requiredCiVerified:true,stagingVerified:true,rollbackReady:true,securityReviewVerified:true,...stagingProofOverride})};
  const db={
    prepare(sql){
      trace.sql.push(sql);
      return {bind(...args){
        return {
          sql,args,
          first:async()=>{
            if(sql.includes('FROM ekodi_orchestrator_tasks'))return args[0]===row?.task_id?row:null;
            if(sql.includes('FROM ekodi_orchestrator_task_events'))return sql.includes('verified_preproduction_evidence_recorded')?(stagingAttestation?stagingEvent:null):(trace.events.at(-1)||null);
            throw Error('Unexpected query');
          },
        };
      }};
    },
    async batch(statements){
      trace.batchCalls++;
      if(failBatch)throw Error('DB outage');
      if(!commit)return [{meta:{changes:0}},{meta:{changes:0}}];
      const [update,insert]=statements;
      assert.match(update.sql,/state_version=state_version\+1/);
      assert.match(update.sql,/state='staging'/);
      assert.match(update.sql,/evidence_json=\?/);
      assert.match(insert.sql,/final_promotion_approval_recorded/);
      assert.match(insert.sql,/NOT EXISTS/);
      assert.match(insert.sql,/THEN \? ELSE NULL END/);
      assert.doesNotMatch(insert.sql,/json_extract/);
      if(trace.events.length){
        // The official D1 NOT NULL audit check aborts the entire batch,
        // even when a new owner submits a fresh stateVersion/approvalId.
        throw Error('DUPLICATE_FINAL_OWNER_APPROVAL');
      }
      if(!row || row.state_version!==update.args[2] ||
         row.evidence_json!==update.args[4])return [{meta:{changes:0}},{meta:{changes:0}}];
      row.state_version++;
      trace.events.push({
        actor:insert.args[7],reason:'final_promotion_approval_recorded',
        evidence_json:insert.args[8],
      });
      return [{meta:{changes:1}},{meta:{changes:1}}];
    },
  };
  return {db,trace,row};
}

test('final promotion approval stores exact artifact, one version increment and audit event',async()=>{
  const {db,row,trace}=mockDb();
  const answer=await recordEkodiFinalPromotionApproval(db,request());
  assert.equal(answer.approved,true);
  assert.equal(answer.productionDeployed,false);
  assert.equal(answer.requiresSeparateOfficialReleaseGate,true);
  assert.equal(answer.stateVersion,4);
  assert.equal(row.state_version,4);
  assert.equal(trace.batchCalls,1);
  assert.equal(trace.events.length,1);
  const receipt=JSON.parse(trace.events[0].evidence_json);
  assert.equal(receipt.approvalId,`final_promotion_${taskId}_v4`);
  assert.equal(receipt.releaseSha,releaseSha);
  assert.equal(receipt.artifactDigest,artifactDigest);
  assert.equal(trace.events[0].actor,`super-admin:${actor}`);

  const verified=await evaluateEkodiContinuousExecutionFromLedger(db,{
    phase:'production-promotion',taskId,branchRef,releaseSha,artifactDigest,
    requiredCiVerified:true,stagingVerified:true,securityReviewVerified:true,rollbackReady:true,
  });
  assert.equal(verified.decision,'ready_for_guarded_promotion');
  assert.equal(verified.productionDeployed,false);
});

test('a second approval with stale state version cannot record another event',async()=>{
  const {db,trace}=mockDb();
  assert.equal((await recordEkodiFinalPromotionApproval(db,request())).approved,true);
  assert.equal((await recordEkodiFinalPromotionApproval(db,request())).reason,'stale_task_state');
  assert.equal(trace.events.length,1);
});

test('a second final confirmation with fresh version and another owner never renews the original',async()=>{
  const {db,row,trace}=mockDb();
  const original=await recordEkodiFinalPromotionApproval(db,request());
  assert.equal(original.approved,true);
  assert.equal(row.state_version,4);
  const replay=await recordEkodiFinalPromotionApproval(db,request({
    expectedStateVersion:4,
    authorizedSuperAdminPersonId:'platform-admin:another-owner',
  }));
  assert.equal(replay.approved,false);
  assert.equal(replay.reason,'final_promotion_approval_transaction_failed');
  assert.equal(row.state_version,4);
  assert.equal(trace.events.length,1);
  assert.equal(JSON.parse(trace.events[0].evidence_json).approvalId,original.approvalId);
});

test('missing DB, forged actor, malformed task, SHA and artifact do not approve',async()=>{
  assert.equal((await recordEkodiFinalPromotionApproval(null,request())).approved,false);
  for(const overrides of [
    {authorizedSuperAdminPersonId:'ai:claude'},
    {authorizedSuperAdminPersonId:'owner'},
    {taskId:'fake'},
    {releaseSha:'123'},
    {artifactDigest:'wrong'},
    {expectedStateVersion:0},
  ]){
    const {db,trace}=mockDb();
    const result=await recordEkodiFinalPromotionApproval(db,request(overrides));
    assert.equal(result.approved,false);
    assert.equal(trace.batchCalls,0);
  }
});

test('staging or delegated permission errors block owner approval; worker evidence cannot change authority',async()=>{
  for(const mutation of [
    {state:'assigned'}, {state:'blocked'}, {permission_class:'unapproved'},
    {branch_ref:'ai/claude/'+taskId}, {deployment_requested:0},
  ]){
    const {db,trace}=mockDb({...buildRow(),...mutation});
    assert.equal((await recordEkodiFinalPromotionApproval(db,request())).approved,false);
    assert.equal(trace.batchCalls,0);
  }
  for(const workerEvidence of ['[]','{}',
    JSON.stringify({preproductionProof:{requiredCiVerified:false,releaseSha:'4'.repeat(40)}})]){
    const row={...buildRow(),evidence_json:workerEvidence};
    const {db,trace}=mockDb(row);
    const result=await recordEkodiFinalPromotionApproval(db,request());
    assert.equal(result.approved,true,'OIDC audit is independent of worker progress evidence');
    assert.equal(row.evidence_json,workerEvidence);
    assert.equal(trace.batchCalls,1);
  }
});

test('unverified, missing or forged staging attestation cannot create an owner receipt',async()=>{
  for(const config of [
    {stagingAttestation:false},{stagingAttestationValid:false},
    {stagingProofOverride:{securityReviewVerified:false}},
    {stagingProofOverride:{archiveDigest:'invalid-archive-digest'}},
    {stagingProofOverride:{requiredCiVerified:false}},
    {stagingProofOverride:{workflowRunId:0}},
  ]){
    const {db,trace}=mockDb(buildRow(),config);
    const answer=await recordEkodiFinalPromotionApproval(db,request());
    assert.equal(answer.approved,false);
    assert.equal(trace.batchCalls,0);
    assert.equal(trace.events.length,0);
  }
});

test('conflicted CAS and DB outage fail closed',async()=>{
  for(const opts of [{commit:false},{failBatch:true}]){
    const {db,trace}=mockDb(buildRow(),opts);
    const answer=await recordEkodiFinalPromotionApproval(db,request());
    assert.equal(answer.approved,false);
    assert.equal(trace.events.length,0);
  }
});

test('Admin API writer is same-origin, super-admin and ai:operate gated without deploying',()=>{
  const source=readFileSync(new URL('../ai-command-control.js',import.meta.url),'utf8');
  const marker=source.indexOf('finalPromotionMatch=url.pathname.match');
  assert.ok(marker>0);
  const route=source.slice(marker,marker+1900);
  assert.match(route,/requirePlatformSuperAdmin\('ai:operate'\)/);
  assert.match(route,/isSameOriginAdminMutation\(request\)/);
  assert.match(route,/approveOrchestratorFinalPromotionForPlatformAdmin\(/);
  assert.match(route,/productionDeployed:false/);
  const adapter=readFileSync(new URL('../ekodi-orchestrator-task-adapter.js',import.meta.url),'utf8');
  assert.match(adapter,/approveOrchestratorFinalPromotionForPlatformAdmin/);
  assert.match(adapter,/platformAdminIdentityFromSession\(db,session\)/);
});
