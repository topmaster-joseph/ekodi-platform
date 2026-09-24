import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('config/deployment-four-layer-policy.json','utf8'));
const router=fs.readFileSync('deployment-layer-router.js','utf8');
const cloudControl=fs.readFileSync('docs/operations/ekodi-cloud-control.md','utf8');
const workflow=fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
const sharedDeploy=fs.readFileSync('.github/workflows/deploy-site-core.yml','utf8');
const resolver=fs.readFileSync('scripts/resolve-deployment-four-layer.mjs','utf8');
const failures=[];
const expect=(ok,msg)=>{if(!ok)failures.push(msg)};

expect(policy.policyId==='EKODI-DEPLOYMENT-FOUR-LAYER-001','four-layer policy id drifted');
expect(policy.status==='enforced','four-layer policy must remain enforced');
expect(policy.automaticPaidUpgrade===false,'automatic paid upgrade must remain disabled');
expect(JSON.stringify(policy.priority.map(x=>x.id))===JSON.stringify(['runtime','guarded-deploy','cloud-control','owner']),'four-layer priority order must remain Runtime > Deploy > Cloud Control > Owner');
expect(policy.priority[1]?.cloudflareWorkersBuildsRequired===false,'guarded Deploy must not depend on Cloudflare Workers Builds');
expect(policy.priority[2]?.serviceDeploymentLane===false,'Cloud Control must not become a second service deployment lane');
expect(policy.priority[2]?.returnsTo==='guarded-deploy','Cloud Control repair must return to guarded Deploy');
expect(policy.priority[3]?.automation==='never','Owner authority must never be routine automation');
expect(policy.selectionRules?.runtimeFirst===true,'Runtime must remain first');
expect(policy.selectionRules?.unknownQuotaStateIsNotExhausted===true,'unknown quota state must not be invented as exhausted');
expect(policy.selectionRules?.runtimeQuotaExhaustionNeverWeakensSecurityCriticalRoutes===true,'runtime exhaustion must not weaken security routes');
expect(policy.selectionRules?.runtimeQuotaExhaustedCodeReleaseAction==='prepare-and-hold-before-production-mutation','exhausted runtime quota must prepare and hold code releases');
expect(policy.selectionRules?.runtimeQuotaProtectVerification==='essential-only','protect state must reduce verification to essential-only');
expect(policy.selectionRules?.deferredPromotionRequiresSameVerifiedArtifact===true,'deferred promotion must preserve the verified artifact');
expect(policy.selectionRules?.deferredPromotionNeverUsesCloudControlAsDeployLane===true,'deferred promotion must not abuse Cloud Control as a deploy lane');
expect(policy.cloudflareReference?.workersBuildsFree?.buildMinutesPerMonth===3000,'Cloudflare Workers Builds Free monthly minutes reference must be 3000');
expect(policy.cloudflareReference?.workersBuildsFree?.concurrentBuilds===1,'Cloudflare Workers Builds Free concurrency reference must be 1');
expect(policy.cloudflareReference?.workersFree?.requestsPerDay===100000,'Cloudflare Workers Free daily request reference must be 100000');

expect(router.includes("layer:'guarded-deploy'"),'router must select guarded Deploy');
expect(router.includes("cloudflareWorkersBuildsRequired:false"),'router must express Workers Builds independence');
expect(router.includes("serviceDeploymentLane:false"),'router must forbid Cloud Control service deployment');
expect(router.includes("returnsTo:'guarded-deploy'"),'router must return repaired Cloud Control flow to guarded Deploy');
expect(router.includes("security-critical-runtime-capacity-exhausted"),'router must fail closed for security-critical runtime exhaustion');
expect(cloudControl.includes('Cloud Control must not become a second deployment lane'),'existing Cloud Control boundary must remain explicit');
expect(workflow.includes('validate-deployment-four-layer.mjs'),'orchestration gate must validate the four-layer deployment contract');
expect(workflow.includes('deployment-four-layer.test.mjs'),'orchestration gate must run four-layer regression tests');
expect(resolver.includes("releaseAction='prepare-and-hold'"),'runtime resolver must support prepare-and-hold');
expect(resolver.includes("state==='protect'")&&resolver.includes("'essential-only'")&&resolver.includes("'full'"),'runtime resolver must support protect-state essential-only verification');
expect(sharedDeploy.includes('Resolve four-layer deployment continuity'),'Shared Site deploy must resolve the four-layer runtime decision');
expect(sharedDeploy.includes('Hold production promotion after artifact preparation'),'Shared Site deploy must hold only after artifact continuity evidence exists');
expect(sharedDeploy.includes("steps.continuity.outputs.release_action == 'prepare-and-hold'"),'Shared Site hold must be driven by continuity output');
expect(policy.selectionRules?.quotaResetScheduledRecovery===true,'quota reset recovery must be scheduled');
expect(policy.selectionRules?.quotaResetRecoveryCronUTC==='00:07','quota reset recovery must run after the 00:00 UTC reset boundary');
expect(policy.selectionRules?.staleHeldArtifactDirectPromotionForbidden===true,'stale held artifacts must never be promoted directly');
expect(policy.selectionRules?.mainAdvanceRequiresFreshGuardedRelease===true,'advanced main must require a fresh guarded release');
expect(sharedDeploy.includes("cron: '7 0 * * *'"),'Shared Site deploy must schedule quota-reset recovery at 00:07 UTC');
expect(sharedDeploy.includes('scheduled_release_gate:'),'Shared Site deploy must have one scheduled recovery gate');
expect(sharedDeploy.includes("reason='quota-reset-resume-same-sha'"),'scheduled recovery must identify same-SHA recovery');
expect(sharedDeploy.includes("reason='quota-reset-revalidate-current-main'"),'scheduled recovery must revalidate current main when SHA advanced');
expect(sharedDeploy.includes('No held artifact is promoted directly'),'scheduled recovery must never directly promote a stale held artifact');

if(failures.length){
  for(const failure of failures)console.error('[EKODI-DEPLOYMENT-FOUR-LAYER-001] '+failure);
  process.exitCode=1;
}else{
  console.log('EKODI-DEPLOYMENT-FOUR-LAYER-001 validated: Runtime > Deploy > Cloud Control > Owner.');
}
