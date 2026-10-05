import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('config/orchestrator-completion-reconciliation-policy.json','utf8').replace(/^\uFEFF/,''));
const adapter=fs.readFileSync('ekodi-orchestrator-task-adapter.js','utf8').replace(/^\uFEFF/,'');
const failures=[];
const fail=message=>failures.push(message);

if(policy.policyId!=='EKODI-ORCHESTRATOR-COMPLETION-001'||policy.status!=='enforced')fail('completion policy must remain enforced');
if(policy.owner!=='ekodi-orchestrator')fail('EKODI Orchestrator must own completion');
if(policy.authority?.externalAiMayMarkCompleted!==false)fail('external AI must never mark tasks completed');
if(policy.authority?.orchestratorOwnsTerminalTransition!==true)fail('orchestrator terminal authority missing');
if(policy.authority?.requesterIsolationRequired!==true)fail('requester isolation missing');
if(policy.authority?.issuedBranchMatchRequired!==true)fail('issued branch match missing');

for(const name of ['CI','EKODI AI Orchestration Gate']){
  if(!policy.requiredEvidence?.requiredCiWorkflowSuccess?.includes(name))fail('required workflow missing: '+name);
}
for(const key of ['mergedPullRequestToMain','allTriggeredDeployWorkflowsMustSucceed','stagingSuccessRequired','productionPromotionSuccessRequired','liveProductionHealthRequired','publicSourceReverificationRequired']){
  if(policy.requiredEvidence?.[key]!==true)fail('required evidence rule missing: '+key);
}
for(const key of ['getTaskStatusSelfHealsStaleDeploymentState','idempotent','safeToRetry','supersedingSuccessfulDeploymentMayRecoverCancelledOrTransientRelease','commandLedgerAlignedOnCompletion','externalReferencesRecorded','productionEvidencePersisted','completionEventRequired','falseCompletionForbidden']){
  if(policy.reconciliation?.[key]!==true)fail('reconciliation rule missing: '+key);
}

for(const marker of [
  'collectOrchestratorCompletionEvidence',
  'github-public-api-and-live-health',
  "state='completed'",
  "state='verified'",
  'production_evidence_json',
  'verified_production_evidence_reconciled',
  "INSERT OR IGNORE INTO ekodi_orchestrator_external_refs",
  'reconcileCompletionRow(db,env,row',
]){
  if(!adapter.includes(marker))fail('adapter marker missing: '+marker);
}

const statusFunction=adapter.slice(adapter.indexOf('export async function getOrchestratorTaskStatus'),adapter.indexOf('export async function cancelOrchestratorTask'));
if(!statusFunction.includes('reconcileCompletionRow'))fail('get_task_status must self-heal stale deployment tasks');
if(statusFunction.indexOf('reconcileCompletionRow')>statusFunction.indexOf('syncFromCommandLedger'))fail('production evidence reconciliation must run before command-ledger terminal mapping');

if(failures.length){
  console.error('EKODI-ORCHESTRATOR-COMPLETION-001 validation failed');
  for(const item of failures)console.error('- '+item);
  process.exit(1);
}
console.log('EKODI-ORCHESTRATOR-COMPLETION-001: OK');
console.log('- completion authority remains inside EKODI Orchestrator');
console.log('- merged PR, CI, staging, production and live health are reverified');
console.log('- stale deployment tasks self-heal on status read');
console.log('- false completion remains fail-closed');
