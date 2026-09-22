import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const policy=readJson('config/surface-system-verification-policy.json');
const constitution=readJson('governance/constitution/constitution.json');
const failures=[];
const fail=m=>failures.push(m);

if(policy.schemaVersion!==1) fail('surface system verification schemaVersion must be 1');
if(policy.policyId!=='SURFACE-SYSTEM-VERIFICATION-001'||policy.status!=='active') fail('surface system verification policy must remain active');
if(policy.canonicalOrigin!=='https://ekodi.kr') fail('surface production verification canonical origin must be https://ekodi.kr');
if(policy.scope?.inheritFutureSurfaces!==true) fail('future governed surfaces must inherit verification automatically');

for(const surface of ['public-home','workspace-or-service-my-page','operator-page','workspace-or-service-admin','platform-super-admin','platform-my']){
  if(!policy.scope?.surfaceClasses?.includes(surface)) fail(`surface class missing: ${surface}`);
}
for(const pattern of ['/{slug}','/{slug}/my','/{slug}/operator','/{slug}/admin','/{slug}/{service}/admin','/my','/admin']){
  if(!policy.scope?.canonicalPatterns?.includes(pattern)) fail(`canonical verification pattern missing: ${pattern}`);
}

if(policy.execution?.orchestrator!=='ekodi-orchestrator') fail('EKODI Orchestrator must own surface verification coordination');
if(policy.execution?.virtualizationRequiredWhenAvailable!==true||policy.execution?.virtualizationOnly!==false) fail('verification must use virtualization as a method without becoming virtualization-only');
if(policy.execution?.realProductionCanaryRequired!==true) fail('real production canary is mandatory');
if(policy.execution?.manualUserTestDefaultGate!==false) fail('manual user testing must not be the default completion gate');

for(const actor of ['guest','authenticated-user','workspace-member','operator','workspace-or-service-admin','platform-super-admin']){
  if(!policy.syntheticActors?.some(item=>item.id===actor)) fail(`synthetic actor missing: ${actor}`);
}
for(const state of ['guest','valid-session','expired-session','invalid-session','insufficient-role','authorized-role']){
  if(!policy.authStates?.includes(state)) fail(`authentication state missing: ${state}`);
}
for(const device of ['compact-mobile','mobile-portrait','mobile-landscape','tablet','desktop']){
  if(!policy.deviceProfiles?.some(item=>item.id===device)) fail(`device profile missing: ${device}`);
}
for(const layer of ['route-and-canonical-url','authentication-session-and-token-hygiene','authorization-role-capability','safe-public-projection','functional-interaction','responsive-layout-and-overflow','natural-language-word-integrity','accessibility-baseline','secure-projection-and-secret-leakage','api-and-data-contract','observability-and-error-surface','real-production-host-canary']){
  if(!policy.requiredLayers?.includes(layer)) fail(`verification layer missing: ${layer}`);
}

const responsive=policy.responsiveContentAssertions||{};
if(responsive.mandatory!==true) fail('responsive content assertions must be mandatory');
if(responsive.naturalLanguageWordOrEojeolIntegrity!==true||responsive.layoutOnlyHardLineBreakForbidden!==true||responsive.viewportAdaptiveReflowRequired!==true) fail('responsive content copy/reflow contract is incomplete');
if(responsive.reflowBeforeFontShrink!==true||responsive.pageHorizontalOverflowForbidden!==true||responsive.technicalIdentifierBreakAnywhereExplicitOnly!==true) fail('responsive content layout/exception contract is incomplete');
if(JSON.stringify(responsive.viewportWidths)!==JSON.stringify([320,390,768,1366,1440])) fail('responsive verification widths must remain 320/390/768/1366/1440');
for(const check of ['no-mid-word-or-mid-eojeol-break','no-clipped-primary-copy','no-overlapping-primary-content','no-horizontal-page-overflow','responsive-control-and-grid-reflow']){
  if(!responsive.visualChecks?.includes(check)) fail(`responsive visual assertion missing: ${check}`);
}

if(policy.productionSafety?.destructiveMutationForbidden!==true||policy.productionSafety?.reversibleOrIdempotentWritesOnly!==true) fail('production canary mutation safety drifted');
if(policy.productionSafety?.productionSecretsInBrowserForbidden!==true) fail('production secrets must stay out of browser verification contexts');
for(const field of ['task_id','branch_or_commit','surface','canonical_url','synthetic_actor','device_profile','auth_state','checks','production_host','observability_result','verification_timestamp','result']){
  if(!policy.evidence?.fields?.includes(field)) fail(`verification evidence field missing: ${field}`);
}
if(JSON.stringify(policy.states?.completion)!==JSON.stringify(['SYSTEM_VERIFIED'])) fail('SYSTEM_VERIFIED must be the only normal completion state');
for(const state of ['DEPLOYED_AWAITING_SYSTEM_VERIFICATION','VERIFICATION_EXCEPTION','FAILED']){
  if(!policy.states?.nonCompletion?.includes(state)) fail(`non-completion state missing: ${state}`);
}
if(JSON.stringify(policy.recovery)!==JSON.stringify(['repair','retest','redeploy','reverify'])) fail('verification failure recovery sequence drifted');

const c=constitution.surfaceSystemVerificationPolicy||{};
if(c.id!==policy.policyId||c.status!=='active') fail('operational surface verification policy must align with constitution');
if(c.completionRule!=='system-verified-before-complete'||c.manualUserTestingDefaultGateForbidden!==true) fail('constitutional completion gate drifted');
if(c.productionCanary?.required!==true||c.productionCanary?.realCanonicalHostRequired!==true) fail('constitutional production canary gate drifted');
const rc=c.responsiveContentIntegrity||{};
if(rc.mandatory!==true||rc.appliesToDesignCopywritingAndImplementation!==true||rc.arbitraryWordOrEojeolSplittingForbidden!==true||rc.layoutOnlyHardLineBreakForbidden!==true) fail('constitutional responsive content integrity drifted');
if(rc.viewportAdaptiveReflowRequired!==true||rc.reflowBeforeFontShrink!==true||rc.horizontalPageOverflowForbidden!==true||rc.repeatedDefectPromotesToSharedGuardrail!==true) fail('constitutional responsive reflow guard drifted');
if(JSON.stringify(rc.viewportWidths)!==JSON.stringify([320,390,768,1366,1440])) fail('constitutional responsive viewport matrix drifted');

if(failures.length){
  console.error(`EKODI surface system verification validation failed (${failures.length})`);
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('EKODI Surface System Verification: OK');
console.log('- all public/My/operator/admin surface classes inherit automated verification');
console.log('- synthetic role + 320/390/768/1366/1440 responsive device matrix registered');
console.log('- real canonical production canary required before SYSTEM_VERIFIED');
console.log('- manual user testing is additive, not the default completion gate');
