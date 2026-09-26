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

const automaticExecution=constitution.automaticExecutionLifecyclePolicy||{};
if(automaticExecution.id!=='AUTOMATIC-EXECUTION-LIFECYCLE-001'||automaticExecution.status!=='enforced'||automaticExecution.mode!=='mandatory') fail('automatic execution lifecycle constitution missing or not enforced');
if(automaticExecution.defaultExecutionMode!=='background-only'||automaticExecution.userBrowserTabCreation!==false||automaticExecution.foregroundWindowDefault!==false) fail('constitutional automatic execution must remain background-only and non-foreground');
if(automaticExecution.ownedAutomationSurfaceAutoClose!==true||automaticExecution.authRequiredDisposition!=='record-and-close'||automaticExecution.authRequiredMustNotOpenInteractiveLogin!==true||automaticExecution.preserveUserOwnedWindowsAndTabs!==true) fail('constitutional automatic execution cleanup/auth boundary drifted');
if(automaticExecution.localOverrideForbidden!==true||automaticExecution.serviceOrAgentWaiverForbidden!==true||automaticExecution.policyRegressionBlocksCi!==true) fail('automatic execution constitution must be non-waivable and CI-blocking');
if(remote.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001'||remote.nonDisruptiveExecution?.automaticExecutionLifecycle?.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001') fail('remote execution must bind automatic execution constitution');
if(!fabric.constitutionalPolicies?.includes('AUTOMATIC-EXECUTION-LIFECYCLE-001')||fabric.automaticExecutionLifecycle?.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001') fail('execution fabric must bind automatic execution constitution');

if(!routing.constitutionalPolicies?.includes('AUTOMATIC-EXECUTION-LIFECYCLE-001')||routing.automaticExecutionLifecycle?.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001') fail('virtualization routing must bind automatic execution constitution');
if(routing.automaticExecutionLifecycle?.defaultMode!=='background-only'||routing.automaticExecutionLifecycle?.userBrowserTabCreation!==false||routing.automaticExecutionLifecycle?.foregroundWindowDefault!==false||routing.automaticExecutionLifecycle?.localOverrideForbidden!==true) fail('virtualization routing automatic execution lifecycle drifted');
if(browser.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001'||browser.executionLifecycle?.constitutionalPolicy!=='AUTOMATIC-EXECUTION-LIFECYCLE-001') fail('background browser must bind automatic execution constitution');
if(browser.executionLifecycle?.mode!=='background-only'||browser.executionLifecycle?.userBrowserTabCreation!==false||browser.executionLifecycle?.ownedAutomationSurfaceAutoClose!==true||browser.executionLifecycle?.authRequiredDisposition!=='record-and-close'||browser.executionLifecycle?.authRequiredMustNotOpenInteractiveLogin!==true||browser.executionLifecycle?.preserveUserOwnedWindowsAndTabs!==true||browser.executionLifecycle?.localOverrideForbidden!==true) fail('background browser constitutional lifecycle drifted');

const sovereignty=constitution.virtualizationSovereigntyPolicy||{};
if(sovereignty.id!=='VIRTUALIZATION-SOVEREIGNTY-001'||sovereignty.ekodiOwnedVirtualizationFirst!==true) fail('constitutional native-first virtualization sovereignty missing');
if(fabric.orchestration?.selection?.ekodiOwnedVirtualizationFirst!==true||fabric.providers?.virtualization?.nativeFirst!==true) fail('execution fabric native-first policy missing');
if(fabric.orchestration?.selection?.virtualizationRoutingPolicy!=='config/virtualization-routing-policy.json'||fabric.orchestration?.selection?.externalVirtualizationForbiddenWhenEligibleNativeHealthy!==true||fabric.orchestration?.selection?.externalVirtualizationRequiresAllEligibleNativeUnusable!==true) fail('execution fabric runtime routing guards missing');
if(fabric.providers?.virtualization?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||fabric.providers?.virtualization?.externalFallbackRequiresAllEligibleNativeUnusable!==true||fabric.providers?.virtualization?.fallbackMustRetryNativeOnNextEligibleExecution!==true) fail('execution fabric provider fallback guards missing');
if(surface.execution?.virtualizationProviderPolicy?.nativeFirst!==true||surface.execution?.nativeWorkerId!=='ekodi-background-browser-worker') fail('surface verification native browser policy missing');
if(surface.execution?.virtualizationProviderPolicy?.routingPolicy!=='config/virtualization-routing-policy.json'||surface.execution?.virtualizationProviderPolicy?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||surface.execution?.virtualizationProviderPolicy?.externalFallbackRequiresAllEligibleNativeUnusable!==true||surface.execution?.virtualizationProviderPolicy?.fallbackMustRetryNativeOnNextEligibleExecution!==true) fail('surface verification hard native routing guards missing');
if(remote.strategy?.nativeFirst!==true||remote.transition?.nativeTargetProvider!=='ekodi-native-remote-computer') fail('remote-computer native target missing');
if(remote.strategy?.virtualizationRoutingPolicy!=='config/virtualization-routing-policy.json'||remote.strategy?.externalFallbackForbiddenWhenEligibleNativeHealthy!==true||remote.strategy?.externalFallbackRequiresAllEligibleNativeUnusable!==true||remote.strategy?.fallbackMustRetryNativeOnNextEligibleExecution!==true||remote.transition?.temporaryProviderAfterNativeHealthy!=='forbidden-by-default') fail('remote-computer hard native routing guards missing');
const lifecycle=remote.nonDisruptiveExecution?.automaticExecutionLifecycle||{};
if(lifecycle.defaultMode!=='background-only'||lifecycle.foregroundWindowDefault!==false||lifecycle.userBrowserTabCreation!==false) fail('automatic execution must remain background-only without user browser tab creation');
if(lifecycle.ownedAutomationSurfaceAutoClose!==true||lifecycle.authRequiredDisposition!=='record-and-close'||lifecycle.authRequiredMustNotOpenInteractiveLogin!==true) fail('automatic execution must close EKODI-owned surfaces and record auth-required without opening login UI');
if(lifecycle.preserveUserOwnedWindowsAndTabs!==true||lifecycle.temporaryAutomationProfilesMustBeRemoved!==true||lifecycle.backgroundApiPreferredOverBrowserForApiChecks!==true) fail('automatic execution must preserve user-owned surfaces, remove temp profiles and prefer API checks');
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
