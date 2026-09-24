import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('config/deployment-four-layer-policy.json','utf8'));
const router=fs.readFileSync('deployment-layer-router.js','utf8');
const cloudControl=fs.readFileSync('docs/operations/ekodi-cloud-control.md','utf8');
const workflow=fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
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

if(failures.length){
  for(const failure of failures)console.error('[EKODI-DEPLOYMENT-FOUR-LAYER-001] '+failure);
  process.exitCode=1;
}else{
  console.log('EKODI-DEPLOYMENT-FOUR-LAYER-001 validated: Runtime > Deploy > Cloud Control > Owner.');
}
