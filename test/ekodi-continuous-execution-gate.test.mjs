import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateEkodiContinuousExecution, evaluateEkodiContinuousExecutionFromLedger, EKODI_CONTINUOUS_EXECUTION_GATE } from '../ekodi-continuous-execution-gate.js';

const policy = JSON.parse(readFileSync(new URL('../config/ai-change-orchestration-policy.json', import.meta.url), 'utf8'));
const rule = policy.deploymentMinimumFriction.oneFinalPromotionConfirmation;
const taskId = 'orch_test_1234567890abcdef12345678';
const branchRef = 'ai/claude/' + taskId;
const releaseSha = 'a'.repeat(40);
const artifactDigest = 'sha256:' + 'b'.repeat(64);
const ready = {
  phase: 'production-promotion', taskId, branchRef, releaseSha, artifactDigest,
  requiredCiVerified: true, stagingVerified: true, rollbackReady: true, securityReviewVerified: true,
};
const receipt = {
  verifiedByTrustedServer: true, authority: 'ekodi-orchestrator',
  approvedByRole: 'super_admin', scope: 'production_promotion',
  taskId, branchRef, releaseSha, artifactDigest, stateVersion: 3,
  approvedAt: '2026-10-18T06:30:00Z',
};

test('one owner confirmation remains a machine enforced policy proposal, not an external AI privilege', () => {
  assert.equal(rule.status, 'enforced');
  assert.equal(rule.ownerFacingApprovalMoments, 'one-at-final-production-promotion');
  assert.equal(rule.confirmationDoesNotReplaceMandatoryEarlierHumanGates, true);
  assert.equal(rule.finalPromotionByEkodiOrchestratorOnly, true);
  assert.equal(policy.multiAiCommandAuthority.providerMayPromoteMergeOrDeployDirectly, false);
  assert.equal(rule.finalConfirmationOnlyAfterAllRequiredGatesAndStaging, true);
  assert.equal(EKODI_CONTINUOUS_EXECUTION_GATE.policyId, rule.policyId);
  assert.equal(EKODI_CONTINUOUS_EXECUTION_GATE.maxAutomaticRetries, 3);
});

for (const phase of EKODI_CONTINUOUS_EXECUTION_GATE.allowedAutomaticStages) {
  test(`stage ${phase} proceeds without repeatedly asking the owner`, () => {
    const result = evaluateEkodiContinuousExecution({ phase });
    assert.equal(result.decision, 'continue_automatically');
    assert.equal(result.productionDeployed, false);
  });
}

test('safe deterministic error automatically repairs then resumes only the failed stage', () => {
  const result = evaluateEkodiContinuousExecution({
    phase: 'retest', failed: true, safeToRetry: true, idempotent: true, attempts: 1,
  });
  assert.equal(result.decision, 'auto_repair_and_resume');
  assert.equal(result.resumeAt, 'retest');
  assert.equal(result.remainingAutomaticRetries, 2);
});

test('unsafe, ambiguous, or exhausted retry never fans out blindly', () => {
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: false, idempotent: false,
  }).decision, 'hold_with_evidence');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: true, idempotent: true, attempts: 3,
  }).reason, 'retry_budget_exhausted');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', ambiguousSideEffect: true,
  }).decision, 'reconcile_before_retry');
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'test', failed: true, safeToRetry: true, idempotent: true,
    sideEffectOccurred: true,
  }).reason, 'prior_side_effect_not_rolled_back');
});

test('mandatory early owner/safety gates remain in force for protected risks', () => {
  for (const risk of EKODI_CONTINUOUS_EXECUTION_GATE.protectedEarlyRisks) {
    assert.equal(evaluateEkodiContinuousExecution({ phase: 'implement', riskFlags: [risk] }).decision, 'await_mandatory_early_gate');
  }
  assert.equal(evaluateEkodiContinuousExecution({
    phase: 'implement', riskFlags: ['destructive_data'], separateSafetyApprovalVerified: true,
  }).decision, 'await_mandatory_early_gate');
});

test('final confirmation is not requested before authoritative CI, staging, rollback and provenance', () => {
  assert.equal(evaluateEkodiContinuousExecution({ phase: 'production-promotion' }).reason, 'orchestrator_provenance_or_artifact_missing');
  assert.equal(evaluateEkodiContinuousExecution({
    ...ready, stagingVerified: false,
  }).decision, 'continue_preproduction_verification');
  assert.equal(evaluateEkodiContinuousExecution({
    ...ready, requiredCiVerified: false,
  }).decision, 'continue_preproduction_verification');
});

test('last owner confirmation is required for the exact production artifact only', () => {
  const decision = evaluateEkodiContinuousExecution(ready);
  assert.equal(decision.decision, 'await_final_owner_confirmation');
  assert.equal(decision.taskId, taskId);
  assert.equal(decision.releaseSha, releaseSha);
  assert.equal(decision.productionDeployed, false);
});

test('client-supplied approval fields, mismatched SHA and stale state all fail closed', () => {
  const attempts = [
    { ...receipt, verifiedByTrustedServer: false },
    { ...receipt, approvedByRole: 'worker' },
    { ...receipt, taskId: 'orch_fake_1234567890abcdef12345678' },
    { ...receipt, releaseSha: 'c'.repeat(40) },
    { ...receipt, branchRef: 'ai/chatgpt/' + taskId },
    { ...receipt, stateVersion: 0 },
    { ...receipt, approvedAt: '' },
  ];
  for (const confirmation of attempts) {
    assert.equal(evaluateEkodiContinuousExecution({
      ...ready, trustedOrchestratorConfirmation: confirmation,
    }).decision, 'await_final_owner_confirmation');
  }
});

const durableReceipt = {
  ...receipt,
  approved:true, approvedBy:'owner-1',
  approvalId:`final_promotion_${taskId}_v3`,
};
const preproductionProof = {
  authority:'ekodi-orchestrator', taskId, branchRef, releaseSha, artifactDigest, archiveDigest:'sha256:'+'f'.repeat(64),
  requiredCiVerified:true, stagingVerified:true, rollbackReady:true,
  securityReviewVerified:true, verifiedAt:'2026-10-18T06:29:00Z',
};
const taskRow = {
  task_id:taskId, branch_ref:branchRef, state:'staging',
  state_version:3, permission_class:'delegated', deployment_requested:1,
  evidence_json:JSON.stringify({items:[{source:'worker'}],commandLedger:{state:'running'}}),
};
const stagingEvent = {
  actor:'ekodi-github-actions-oidc-reconciler',
  reason:'verified_preproduction_evidence_recorded',
  evidence_json:JSON.stringify({
    authority:'ekodi-orchestrator',source:'github-actions-oidc',
    taskId,branchRef,releaseSha,artifactDigest,archiveDigest:preproductionProof.archiveDigest,verifiedAt:preproductionProof.verifiedAt,
    requiredCiVerified:true,stagingVerified:true,rollbackReady:true,securityReviewVerified:true,
    workflowRunId:123456,
  }),
};
const eventRow = {
  actor:'super-admin:owner-1', reason:'final_promotion_approval_recorded',
  evidence_json:JSON.stringify(durableReceipt),
};
function ledger(task=taskRow,event=eventRow,stage=stagingEvent) {
  return { prepare(sql){
    if(sql.includes('FROM ekodi_orchestrator_tasks')){
      return {bind(id){return {first:async()=>id===taskId?task:null}}};
    }
    if(sql.includes('FROM ekodi_orchestrator_task_events')){
      const row=sql.includes('verified_preproduction_evidence_recorded')?stage:event;
      return {bind(id){return {first:async()=>id===taskId?row:null}}};
    }
    throw Error('Unexpected SQL');
  }};
}

test('model supplied truthy approval flag cannot authorize final promotion',async()=>{
  const fake=evaluateEkodiContinuousExecution({
    ...ready, trustedOrchestratorConfirmation:receipt,
  });
  assert.equal(fake.decision,'await_final_owner_confirmation');
  assert.equal(fake.productionDeployed,false);
  const withoutDb=await evaluateEkodiContinuousExecutionFromLedger(null,{
    ...ready, trustedOrchestratorConfirmation:receipt,
  });
  assert.equal(withoutDb.decision,'await_final_owner_confirmation');
});

test('only real scoped EKODI ledger evidence can pass advisory final preflight',async()=>{
  const decision=await evaluateEkodiContinuousExecutionFromLedger(ledger(),ready);
  assert.equal(decision.decision,'ready_for_guarded_promotion');
  assert.equal(decision.reason,'durable_task_approval_verified');
  assert.equal(decision.requiresSeparateOfficialReleaseGate,true);
  assert.equal(decision.productionDeployed,false);
});

test('stale, mismatched, corrupt or unprivileged DB approvals fail closed',async()=>{
  for (const [task,event,stage] of [
    [null,eventRow],
    [{...taskRow,state:'blocked'},eventRow],
    [{...taskRow,branch_ref:'ai/gpt6/'+taskId},eventRow],
    [{...taskRow,state_version:4},eventRow],
    [{...taskRow,permission_class:'unapproved'},eventRow],
    [{...taskRow,state:'assigned'},eventRow],
    [taskRow,eventRow,{...stagingEvent,actor:'worker'}],
    [taskRow,eventRow,{...stagingEvent,evidence_json:JSON.stringify({...JSON.parse(stagingEvent.evidence_json),requiredCiVerified:false})}],
    [taskRow,eventRow,{...stagingEvent,evidence_json:JSON.stringify({...JSON.parse(stagingEvent.evidence_json),archiveDigest:'sha256:'+'e'.repeat(64)})}],
    [taskRow,eventRow,null],

    [{...taskRow,deployment_requested:0},eventRow],
    [taskRow,null],
    [taskRow,{...eventRow,actor:'ai:claude'}],
    [taskRow,{...eventRow,evidence_json:'{not-json'}],
    [taskRow,{...eventRow,evidence_json:JSON.stringify({...durableReceipt,releaseSha:'c'.repeat(40)})}],
    [taskRow,{...eventRow,evidence_json:JSON.stringify({...durableReceipt,approvedBy:'other'})}],
    [taskRow,{...eventRow,evidence_json:JSON.stringify({...durableReceipt,stateVersion:4})}],
  ]){
    const result=await evaluateEkodiContinuousExecutionFromLedger(ledger(task,event,stage===undefined?stagingEvent:stage),ready);
    assert.equal(result.decision,'await_final_owner_confirmation');
  }
  const db={prepare(){throw Error('DB unavailable')}};
  assert.equal((await evaluateEkodiContinuousExecutionFromLedger(db,ready)).decision,'await_final_owner_confirmation');
});

test('worker-controlled task evidence refresh does not revoke authenticated staging audit',async()=>{
  for(const evidence_json of ['[]','{}',JSON.stringify({preproductionProof:{approved:false,verifiedAt:'wrong'}})]){
    const result=await evaluateEkodiContinuousExecutionFromLedger(ledger({...taskRow,evidence_json}),ready);
    assert.equal(result.decision,'ready_for_guarded_promotion');
  }
});

test('unknown stages are not treated as production-ready', () => {
  assert.equal(evaluateEkodiContinuousExecution({ phase: 'magic-deploy' }).decision, 'hold_with_evidence');
});
