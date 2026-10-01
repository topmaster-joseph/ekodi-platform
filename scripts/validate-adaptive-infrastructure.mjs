import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync('config/adaptive-infrastructure-policy.json','utf8'));
const concurrentTraffic=JSON.parse(fs.readFileSync('config/concurrent-traffic-policy.json','utf8'));
const freeTier=JSON.parse(fs.readFileSync('config/free-tier-optimization-policy.json','utf8'));
const registry=JSON.parse(fs.readFileSync('config/evolution-resource-registry.json','utf8'));
const accountPool=JSON.parse(fs.readFileSync('config/cloudflare-account-pool.json','utf8'));
const runtime=fs.readFileSync('adaptive-resource-orchestrator.js','utf8');
const governor=fs.readFileSync('free-tier-resource-governor.js','utf8');
const budget=fs.readFileSync('scripts/cloudflare-production-budget.mjs','utf8');
const api=fs.readFileSync('api-cost-control.js','utf8');
const gate=fs.readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
const resourceWorkflow=fs.readFileSync('.github/workflows/free-tier-resource-governor.yml','utf8');

const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};

expect(policy.policyId==='EKODI-ADAPTIVE-INFRA-001','policy id drifted');
expect(policy.status==='enforced','adaptive policy must remain enforced');
expect(policy.scope?.inheritance==='all-current-and-future-sites-services-subsurfaces','all services/subsurfaces must inherit adaptive policy');
expect(policy.scope?.localOverride==='forbidden','service-local adaptive override must remain forbidden');
expect(policy.scope?.sourceOfTruth==='supabase-postgres','Supabase PostgreSQL must remain source of truth');
expect(policy.scope?.criticalProductionFailoverToAuxiliary===false,'critical production failover to auxiliary must remain forbidden');
expect(concurrentTraffic.policyId==='EKODI-CONCURRENT-TRAFFIC-10K-001','concurrent traffic policy must stay linked');
expect(concurrentTraffic.status==='enforced','concurrent traffic policy must remain enforced');
expect(concurrentTraffic.objective?.normalConcurrentUsers===100&&concurrentTraffic.objective?.busyConcurrentUsers===1000&&concurrentTraffic.objective?.surgeConcurrentUsers===10000,'traffic capacity tiers must remain 100/1000/10000');
expect(concurrentTraffic.promotion?.doNotUseConcurrencyAlone===true,'concurrency-alone promotion must remain forbidden');
expect(concurrentTraffic.sustainedDemand?.corroboratingPressureRequiredForProtection===true,'sustained capacity protection must require independent pressure');
expect(concurrentTraffic.sustainedDemand?.automaticPaidUpgrade===false,'sustained demand must not trigger automatic paid upgrade');

const usage=policy.signals?.usagePercent||{};
expect(usage.normalMaxExclusive===60&&usage.saveMaxExclusive===75&&usage.protectMaxExclusive===90&&usage.surviveMin===90,'usage thresholds must remain 60/75/90');
const burn=policy.signals?.burnRate||{};
expect(burn.normalMaxExclusive===0.7&&burn.saveMaxExclusive===1&&burn.protectMaxExclusive===1.5&&burn.surviveMin===1.5,'burn-rate thresholds must remain 0.7/1.0/1.5');
expect(burn.minUsagePercentForEscalation===2,'burn-rate noise floor must remain 2% usage');

for(const mode of ['normal','save','protect','survive']) expect(policy.modes?.[mode],'adaptive mode missing: '+mode);
for(const level of ['S0','S1','S2','S3']) expect(policy.criticality?.[level],'criticality class missing: '+level);
expect(policy.criticality?.S0?.staleFallbackAllowed===false,'S0 must never use stale fallback');
expect(policy.criticality?.S0?.auxiliaryProductionExecutionAllowed===false,'S0 must never execute on auxiliary production account');
expect(policy.invariants?.S0NeverUsesStaleSnapshot===true,'S0 stale protection invariant missing');
expect(policy.invariants?.S0NeverRunsOnAuxiliaryProductionAccount===true,'S0 auxiliary protection invariant missing');
expect(policy.invariants?.automaticPaidUpgrade===false,'adaptive policy must not buy paid capacity automatically');
expect(policy.invariants?.automaticBillingChange===false,'adaptive policy must not change billing automatically');
expect(policy.invariants?.failClosedForCriticalMutationWhenSourceUnavailable===true,'critical mutation must fail closed');

expect(freeTier.adaptiveInfrastructure?.policyId==='EKODI-ADAPTIVE-INFRA-001','free-tier policy must bind adaptive policy');
expect(freeTier.adaptiveInfrastructure?.appliesRecursivelyToAllServices===true,'free-tier policy must bind adaptive policy recursively');
expect(freeTier.adaptiveInfrastructure?.staleS0Fallback===false,'free-tier policy must forbid stale S0 fallback');
expect(freeTier.adaptiveInfrastructure?.criticalProductionFailoverToAuxiliary===false,'free-tier policy must forbid critical auxiliary failover');

const registered=(registry.explicitResources||[]).find(item=>item.id==='adaptive-infrastructure-policy');
expect(registered?.source==='config/adaptive-infrastructure-policy.json','adaptive policy must be registered in evolution registry');
expect(registered?.verificationState==='ci_gate','adaptive policy must remain CI-gated');

expect(accountPool.failover?.productionCriticalToAuxiliary==='forbidden','Cloudflare account pool must keep critical failover forbidden');
expect(runtime.includes("policyId:'EKODI-ADAPTIVE-INFRA-001'"),'runtime must identify adaptive policy');
expect(runtime.includes("S0:'live-direct-fail-closed'"),'survival mode must keep S0 live and fail closed');
expect(runtime.includes("S3:'paused'"),'protect/survive must pause S3');
expect(runtime.includes("cacheProfile:'aggressive-safe'"),'save mode must increase safe cache use');
expect(runtime.includes("readPath:'cdn-r2-snapshot-first'"),'save mode must prefer CDN/R2 snapshots');
expect(runtime.includes('metricBurnRate'),'runtime must calculate burn rate');
expect(runtime.includes('trafficSpikeRatio'),'runtime must support traffic-spike pressure');
expect(runtime.includes('trafficCapacityTierFromConcurrentSessions'),'runtime must classify 100/1000/10000 capacity tiers');
expect(runtime.includes("policyId:'EKODI-CONCURRENT-TRAFFIC-10K-001'"),'runtime must identify the concurrent traffic policy');
expect(runtime.includes('concurrencyAloneChangesProtectionMode:false'),'runtime must keep classification separate from protection');
expect(runtime.includes('dedicatedCapacityCandidate'),'runtime must flag sustained high-demand isolation candidates');

expect(governor.includes("import { buildAdaptiveInfrastructureDecision } from './adaptive-resource-orchestrator.js'"),'resource governor must use adaptive orchestrator');
expect(governor.includes('adaptiveInfrastructure'),'resource governor must publish adaptive decision');
expect(budget.includes("import { buildAdaptiveInfrastructureDecision } from '../adaptive-resource-orchestrator.js'"),'production budget must use adaptive orchestrator');
expect(budget.includes('adaptive.blockNonessential'),'production budget must let adaptive pressure suppress nonessential work');
expect(budget.includes('adaptive_mode'),'production budget must expose adaptive mode to workflows');
expect(budget.includes('adaptive_burn_rate'),'production budget must expose burn rate');
expect(api.includes('adaptiveInfrastructure: resourceGovernor.adaptiveInfrastructure'),'Admin resource API must expose adaptive decision');

expect(gate.includes('validate-adaptive-infrastructure.mjs'),'orchestration gate must validate adaptive policy');
expect(gate.includes('adaptive-resource-orchestrator.test.mjs'),'orchestration gate must run adaptive tests');
expect(resourceWorkflow.includes('validate-adaptive-infrastructure.mjs'),'resource governor workflow must validate adaptive policy');
expect(resourceWorkflow.includes('adaptive-resource-orchestrator.test.mjs'),'resource governor workflow must run adaptive tests');

if(failures.length){
  for(const failure of failures) console.error('[EKODI-ADAPTIVE-INFRA-001] '+failure);
  process.exitCode=1;
}else{
  console.log('EKODI-ADAPTIVE-INFRA-001 validated: traffic/burn-rate adaptive infrastructure is enforced.');
}
