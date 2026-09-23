import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const routing=read('config/virtualization-routing-policy.json');
const constitution=read('governance/constitution/constitution.json');
const fabric=read('config/autonomous-execution-fabric-policy.json');
const surface=read('config/surface-system-verification-policy.json');
const remote=read('config/remote-computer-execution-policy.json');
const browser=read('config/background-browser-worker-policy.json');
const failures=[];
const fail=m=>failures.push(m);

if(routing.policyId!=='EKODI-VIRTUALIZATION-ROUTING-001'||routing.status!=='enforced'||routing.owner!=='ekodi-orchestrator') fail('virtualization routing policy identity/ownership drifted');
if(routing.constitutionalPolicy!=='VIRTUALIZATION-SOVEREIGNTY-001') fail('routing policy must bind virtualization sovereignty constitution');
if(routing.selection?.nativeFirst!==true||routing.selection?.externalForbiddenWhenEligibleNativeHealthy!==true) fail('routing must force native EKODI virtualization when healthy');
if(routing.selection?.externalFallbackRequiresAllEligibleNativeUnusable!==true||routing.selection?.failClosedWhenNoEligibleProvider!==true) fail('external fallback must require all eligible native routes to be unusable and otherwise fail closed');
for(const task of ['browser-ui-validation','synthetic-surface-verification','isolated-browser-execution','isolated-desktop-execution','computer-use-automation','isolated-engineering-execution']) if(!Array.isArray(routing.taskClasses?.[task])||routing.taskClasses[task].length===0) fail(`native task mapping missing: ${task}`);
if(routing.taskClasses?.['browser-ui-validation']?.[0]!=='ekodi-background-browser-worker') fail('browser UI validation must default to EKODI background browser worker');
if(routing.taskClasses?.['computer-use-automation']?.[0]!=='ekodi-native-remote-computer') fail('computer-use automation must default to EKODI native remote computer');
for(const reason of ['native-capability-not-production-ready','native-capability-unavailable','required-capability-not-yet-implemented','native-capacity-or-runtime-failure']) if(!routing.externalFallback?.allowedReasons?.includes(reason)) fail(`external fallback reason missing: ${reason}`);
for(const flag of ['auditIdRequired','nativeCapabilityGapRecordRequired','allEligibleNativeFailureEvidenceRequired','securityEquivalentOrStrongerRequired','paidUpgradeForbidden','providerLockInForbidden','fallbackDecisionMustBeMachineReadable']) if(routing.externalFallback?.[flag]!==true) fail(`external fallback guard missing: ${flag}`);
if(routing.recovery?.nativeCapabilityMustBeRetriedOnNextEligibleExecution!==true||routing.recovery?.fallbackMustNotBecomeDefaultByHistory!==true) fail('external fallback must not become sticky/default');

const sovereignty=constitution.virtualizationSovereigntyPolicy||{};
if(sovereignty.id!=='VIRTUALIZATION-SOVEREIGNTY-001'||sovereignty.ekodiOwnedVirtualizationFirst!==true) fail('constitutional native-first virtualization sovereignty missing');
if(fabric.orchestration?.selection?.ekodiOwnedVirtualizationFirst!==true||fabric.providers?.virtualization?.nativeFirst!==true) fail('execution fabric native-first policy missing');
if(fabric.orchestration?.selection?.virtualizationRoutingPolicy!=='config/virtualization-routing-policy.json'||fabric.orchestration?.selection?.externalVirtualizationForbiddenWhenEligibleNativeHealthy!==true||fabric.orchestration?.selection?.externalVirtualizationRequiresAllEligibleNativeUnusable!==true) fail('execution fabric runtime routing guards missing');
if(fabric.providers?.virtualization?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||fabric.providers?.virtualization?.externalFallbackRequiresAllEligibleNativeUnusable!==true||fabric.providers?.virtualization?.fallbackMustRetryNativeOnNextEligibleExecution!==true) fail('execution fabric provider fallback guards missing');
if(surface.execution?.virtualizationProviderPolicy?.nativeFirst!==true||surface.execution?.nativeWorkerId!=='ekodi-background-browser-worker') fail('surface verification native browser policy missing');
if(surface.execution?.virtualizationProviderPolicy?.routingPolicy!=='config/virtualization-routing-policy.json'||surface.execution?.virtualizationProviderPolicy?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||surface.execution?.virtualizationProviderPolicy?.externalFallbackRequiresAllEligibleNativeUnusable!==true||surface.execution?.virtualizationProviderPolicy?.fallbackMustRetryNativeOnNextEligibleExecution!==true) fail('surface verification hard native routing guards missing');
if(remote.strategy?.nativeFirst!==true||remote.transition?.nativeTargetProvider!=='ekodi-native-remote-computer') fail('remote-computer native target missing');
if(remote.strategy?.virtualizationRoutingPolicy!=='config/virtualization-routing-policy.json'||remote.strategy?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||remote.strategy?.externalFallbackRequiresAllEligibleNativeUnusable!==true||remote.strategy?.fallbackMustRetryNativeOnNextEligibleExecution!==true||remote.transition?.temporaryProviderAfterNativeHealthy!=='forbidden-by-default') fail('remote-computer hard native routing guards missing');
if(browser.provider?.orchestration!=='ekodi-owned'||browser.evidence?.runtimeProven!==true) fail('background browser must remain EKODI-owned and runtime-proven');

if(failures.length){
  console.error(`EKODI virtualization routing validation failed (${failures.length})`);
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('EKODI Virtualization Routing: OK');
console.log('- healthy eligible EKODI-native virtualization is mandatory');
console.log('- external virtualization is blocked unless every eligible native path is unusable with explicit evidence');
console.log('- fallback requires audit + native gap record + equal/stronger isolation and can never become sticky');
