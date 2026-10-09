import fs from 'node:fs';

const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
const policy=JSON.parse(read('config/orchestrator-completion-reconciliation-policy.json'));
const adapter=read('ekodi-orchestrator-task-adapter.js');
const oidc=read('github-actions-oidc.js');
const evidence=read('scripts/github-actions-completion-evidence.mjs');
const workflow=read('.github/workflows/reconcile-orchestrator-completions.yml');
const controlWorkflow=read('.github/workflows/deploy-control-api.yml');
const failures=[];
const fail=message=>failures.push(message);

if(policy.schemaVersion<3)fail('completion policy schema must include OIDC backstop and fair candidate rotation');
if(policy.policyId!=='EKODI-ORCHESTRATOR-COMPLETION-001'||policy.status!=='enforced')fail('completion policy must remain enforced');
if(policy.owner!=='ekodi-orchestrator')fail('EKODI Orchestrator must own completion');

for(const [key,value] of Object.entries({
  externalAiMayMarkCompleted:false,
  requesterMayForgeEvidence:false,
  orchestratorOwnsTerminalTransition:true,
  requesterIsolationRequired:true,
  issuedBranchMatchRequired:true,
  githubActionsOidcRequiredForPushEvidence:true,
  staticGitHubTokenRequired:false,
})){
  if(policy.authority?.[key]!==value)fail('authority rule mismatch: '+key);
}

for(const name of ['CI','EKODI AI Orchestration Gate']){
  if(!policy.requiredEvidence?.requiredCiWorkflowSuccess?.includes(name))fail('required workflow missing: '+name);
}
const cgmaStagingEquivalent=policy.requiredEvidence?.workflowSpecificStagingEquivalents?.['Deploy CGMA Apex Edge'];
if(cgmaStagingEquivalent?.job!=='validate')fail('CGMA staging-equivalent must use validate job');
if(!cgmaStagingEquivalent?.requiredSteps?.includes('Validate CGMA edge contract'))fail('CGMA staging-equivalent must require the edge contract step');
if(cgmaStagingEquivalent?.scope!=='cgma-edge-only')fail('CGMA staging-equivalent scope must remain CGMA-only');
const boardStagingEquivalent=policy.requiredEvidence?.workflowSpecificStagingEquivalents?.['Deploy Independent Board'];
if(boardStagingEquivalent?.job!=='validate'||!boardStagingEquivalent?.requiredSteps?.includes('Validate standalone board contract')||boardStagingEquivalent?.scope!=='independent-board-only')fail('independent board staging-equivalent must require its exact validate contract');
if(!evidence.includes("'Deploy Independent Board'"))fail('authenticated collector must verify independent board staging-equivalent');

for(const key of [
  'mergedPullRequestToMain',
  'allTriggeredDeployWorkflowsMustSucceed',
  'stagingSuccessRequired',
  'productionPromotionSuccessRequired',
  'liveProductionHealthRequired',
  'authenticatedGitHubReverificationRequired',
  'ekodiLiveHealthReverificationRequired',
  'internalCanonicalHealthHandlerRequired',
  'completionWorkerSelfFetchForbidden',
]){
  if(policy.requiredEvidence?.[key]!==true)fail('required evidence rule missing: '+key);
}
for(const key of [
  'getTaskStatusSelfHealsWhenRuntimeGitHubLookupAvailable',
  'githubActionsOidcReceiptBackstopRequired',
  'workflowRunTriggerRequired',
  'scheduledRetryRequired',
  'idempotent',
  'safeToRetry',
  'supersedingSuccessfulDeploymentMayRecoverCancelledOrTransientRelease',
  'commandLedgerAlignedOnCompletion',
  'externalReferencesRecorded',
  'productionEvidencePersisted',
  'completionEventRequired',
  'falseCompletionForbidden',
  'candidateFairRotationRequired',
  'newUnattemptedCandidatesPrioritized',
  'deferredCandidatesMustNotStarveNewerTasks',
  'checkedAtMetadataRequired',
]){
  if(policy.reconciliation?.[key]!==true)fail('reconciliation rule missing: '+key);
}
if(policy.reconciliation?.candidateBatchLimit!==50)fail('completion reconciliation candidate batch limit must remain bounded at 50');
for(const name of ['Deploy Control API','Deploy EKODI Shared Site Core','Deploy CGMA Apex Edge','Deploy Business OS','Deploy Independent Board']){
  if(!policy.reconciliation?.workflowRunTriggerWorkflows?.includes(name))fail('completion workflow trigger missing from policy: '+name);
  if(!workflow.includes('- '+name))fail('completion workflow trigger missing: '+name);
}

if(policy.oidcBoundary?.issuer!=='https://token.actions.githubusercontent.com')fail('GitHub Actions OIDC issuer mismatch');
if(policy.oidcBoundary?.audience!=='ekodi-orchestrator-completion')fail('OIDC audience mismatch');
if(policy.oidcBoundary?.repository!=='topmaster-joseph/ekodi-platform')fail('OIDC repository mismatch');
if(policy.oidcBoundary?.ref!=='refs/heads/main')fail('OIDC ref must be main');
if(policy.oidcBoundary?.workflow!=='.github/workflows/reconcile-orchestrator-completions.yml')fail('OIDC workflow mismatch');
for(const event of ['workflow_run','workflow_dispatch','schedule']){
  if(!policy.oidcBoundary?.allowedEvents?.includes(event))fail('OIDC event missing: '+event);
}

for(const marker of [
  'collectOrchestratorCompletionEvidence',
  'handleOrchestratorCompletionReconciliation',
  'github-actions-oidc-and-internal-canonical-health',
  'internal-canonical-health-handler',
  "state='completed'",
  "state='verified'",
  'production_evidence_json',
  'verified_oidc_production_evidence_reconciled',
  "INSERT OR IGNORE INTO ekodi_orchestrator_external_refs",
  'reconcileCompletionRow(db,env,row',
  'reconciliation_checked_at ASC, updated_at DESC',
  "selection:'fair-round-robin'",
]){
  if(!adapter.includes(marker))fail('adapter marker missing: '+marker);
}

for(const marker of [
  'https://token.actions.githubusercontent.com',
  'ekodi-orchestrator-completion',
  'refs/heads/main',
  'reconcile-orchestrator-completions.yml@',
  'crypto.subtle.verify',
]){
  if(!oidc.includes(marker))fail('OIDC verifier marker missing: '+marker);
}

for(const marker of [
  'STAGING_EQUIVALENTS',
  'Deploy CGMA Apex Edge',
  'Validate CGMA edge contract',
  'preproduction-equivalent',
  'collectAuthenticatedCompletionEvidence',
  'listWorkflowRunsForRepo',
  'listJobsForWorkflowRun',
  'compareCommits',
  'production_promotion_evidence_missing',
]){
  if(!evidence.includes(marker))fail('authenticated evidence collector marker missing: '+marker);
}

for(const marker of [
  'workflow_run:',
  "cron: '*/15 * * * *'",
  'id-token: write',
  'actions: read',
  'pull-requests: read',
  'core.getIDToken',
  'collectAuthenticatedCompletionEvidence',
  '/api/orchestrator/completion-reconciliation',
]){
  if(!workflow.includes(marker))fail('completion workflow marker missing: '+marker);
}
if(/permissions:[\s\S]*contents:\s*write/.test(workflow))fail('completion workflow must not receive contents write');
if(/secrets\.|GH_PAT|PERSONAL_ACCESS_TOKEN|EKODI_GITHUB_ADMIN_TOKEN/.test(workflow))fail('completion workflow must not depend on static privileged secrets');

for(const path of [
  "github-actions-oidc.js",
  "scripts/github-actions-completion-evidence.mjs",
  "test/github-actions-oidc.test.mjs",
  "test/github-actions-completion-evidence.test.mjs",
  "test/orchestrator-completion-reconciliation-endpoint.test.mjs",
  ".github/workflows/reconcile-orchestrator-completions.yml",
]){
  if(!controlWorkflow.includes(`- '${path}'`))fail('Control API deploy trigger missing: '+path);
}

const statusFunction=adapter.slice(adapter.indexOf('export async function getOrchestratorTaskStatus'),adapter.indexOf('export async function cancelOrchestratorTask'));
if(!statusFunction.includes('reconcileCompletionRow'))fail('get_task_status must retain runtime self-heal path');
if(statusFunction.indexOf('reconcileCompletionRow')>statusFunction.indexOf('syncFromCommandLedger'))fail('production evidence reconciliation must run before command-ledger terminal mapping');

const healthFunction=adapter.slice(adapter.indexOf('async function currentLiveHealth'),adapter.indexOf('function bearer'));
if(!healthFunction.includes('authCore.fetch'))fail('OIDC completion health must use the internal canonical health handler');
if(healthFunction.includes('fetchImpl(')||healthFunction.includes('fetch(LIVE_HEALTH_URL'))fail('OIDC completion health must not self-fetch the public EKODI endpoint');

if(failures.length){
  console.error('EKODI-ORCHESTRATOR-COMPLETION-001 validation failed');
  for(const item of failures)console.error('- '+item);
  process.exit(1);
}
console.log('EKODI-ORCHESTRATOR-COMPLETION-001: OK');
console.log('- EKODI Orchestrator remains the only completion authority');
console.log('- runtime GitHub lookup remains a best-effort self-heal path');
console.log('- GitHub Actions OIDC provides the durable authenticated backstop');
console.log('- merged PR, CI, staging, production and live health remain mandatory');
console.log('- false completion remains fail-closed');
