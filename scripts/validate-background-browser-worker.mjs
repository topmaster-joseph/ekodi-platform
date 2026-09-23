import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const policy=read('config/background-browser-worker-policy.json');
const surface=read('config/surface-system-verification-policy.json');
const fabric=read('config/autonomous-execution-fabric-policy.json');
const constitution=read('governance/constitution/constitution.json');
const evidence=read('evidence/runtime/background-browser-worker/2026-09-22-initial-proof.json');
const workerWorkflow=fs.readFileSync(path.join(root,'.github/workflows/ekodi-background-browser-worker.yml'),'utf8');
const sharedRelease=fs.readFileSync(path.join(root,'.github/workflows/deploy-site-core.yml'),'utf8');
const failures=[];
const fail=m=>failures.push(m);

if(policy.schemaVersion!==1||policy.policyId!=='EKODI-BROWSER-WORKER-001'||policy.status!=='enforced') fail('background browser worker policy identity/status mismatch');
if(policy.owner!=='ekodi-orchestrator') fail('EKODI Orchestrator must own the browser worker');
if(policy.canonicalOrigin!=='https://ekodi.kr'||policy.originPolicy?.canonicalOriginOnly!==true||policy.originPolicy?.subdomainTargetsForbidden!==true) fail('browser worker navigation must stay on canonical ekodi.kr');
if(policy.isolation?.ephemeralBrowserContextRequired!==true||policy.isolation?.persistentUserProfileForbidden!==true||policy.isolation?.activeUserProfileReuseForbidden!==true) fail('browser worker isolation contract drifted');
if(policy.isolation?.clipboardIntegration!==false||policy.isolation?.hostInputInjection!==false||policy.isolation?.headlessDefault!==true) fail('browser worker must remain headless and detached from user input/clipboard');
for(const action of ['goto','click','fill','press','waitFor','assertText','snapshot','screenshot']) if(!policy.taskProtocol?.allowedActions?.includes(action)) fail(`browser worker action missing: ${action}`);
if(policy.taskProtocol?.rawJavascriptForbidden!==true||policy.taskProtocol?.arbitraryShellForbidden!==true) fail('raw JS and arbitrary shell must remain forbidden');
if(policy.networkSafety?.defaultMutationMode!=='block-non-idempotent-http'||policy.networkSafety?.mutationGrantDefault!==false||policy.networkSafety?.mutationRequiresExplicitTaskGrant!==true) fail('browser worker mutation safety drifted');
if(policy.provider?.orchestration!=='ekodi-owned'||policy.provider?.externalBrowserServiceRequired!==false||policy.provider?.underlyingComputeReplaceable!==true) fail('browser worker must remain EKODI-owned and provider-replaceable');
if(policy.evidence?.initialRuntimeProof!=='evidence/runtime/background-browser-worker/2026-09-22-initial-proof.json'||policy.evidence?.runtimeProven!==true) fail('browser worker runtime proof binding missing');
if(evidence.policyId!=='EKODI-BROWSER-WORKER-001'||evidence.runtimeResult?.ok!==true||evidence.runtimeResult?.mode!=='ekodi-owned-background-browser') fail('browser worker runtime evidence invalid');
if(evidence.runtimeResult?.headless!==true||evidence.runtimeResult?.ephemeralContext!==true||evidence.runtimeResult?.activeUserProfileReused!==false||evidence.runtimeResult?.hostInputInjection!==false) fail('browser worker runtime evidence does not prove isolation');
if(evidence.claimBoundary?.nativeBackgroundBrowserRuntimeProven!==true||evidence.claimBoundary?.productionRemoteComputerCutoverProven!==false) fail('browser worker claim boundary drifted');
if(surface.execution?.defaultHarness!=='ekodi-owned-isolated-browser-runtime') fail('surface verification must select the EKODI-owned browser harness');
if(surface.execution?.nativeWorkerPolicy!=='config/background-browser-worker-policy.json') fail('surface verification must bind the native browser worker policy');
const browserMethod=(fabric.orchestration?.methodCatalog||[]).find(x=>x.id==='browser-e2e')||{};
if(browserMethod.ownership!=='ekodi'||browserMethod.defaultProvider!=='ekodi-background-browser-worker') fail('execution fabric browser-e2e method must use EKODI background browser worker');
if(browserMethod.state!=='runtime-proven'||browserMethod.evidence!=='evidence/runtime/background-browser-worker/2026-09-22-initial-proof.json') fail('execution fabric browser-e2e lane must retain runtime proof');
if(constitution.virtualizationSovereigntyPolicy?.ekodiOwnedVirtualizationFirst!==true) fail('constitutional virtualization sovereignty must remain native-first');
if(!/workflow_call:\s*[\s\S]*?surface_path:/m.test(workerWorkflow)||!/workflow_call:\s*[\s\S]*?device_profile:/m.test(workerWorkflow)) fail('background browser workflow must remain reusable through workflow_call');
if(!sharedRelease.includes('native_surface_verification_desktop:')||!sharedRelease.includes('native_surface_verification_mobile:')) fail('shared-site production release must invoke the EKODI browser worker for desktop and mobile');
if((sharedRelease.match(/uses:\s*\.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g)||[]).length<2) fail('shared-site production release must retain both native browser verification lanes');
if(!sharedRelease.includes('needs: deploy')) fail('native browser verification must run after guarded production deploy');
if(!sharedRelease.includes('device_profile: desktop')||!sharedRelease.includes('device_profile: mobile-portrait')) fail('release browser verification must cover desktop and mobile portrait');

if(failures.length){
  console.error(`EKODI Background Browser Worker validation failed (${failures.length})`);
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('EKODI Background Browser Worker: OK');
console.log('- canonical ekodi.kr navigation only');
console.log('- ephemeral headless Playwright context, no active user profile reuse');
console.log('- read-only network by default; mutation requires an explicit task grant');
console.log('- external browser service dependency: none');
console.log('- isolated browser runtime proof: registered');
console.log('- shared-site guarded release: desktop + mobile native browser verification required');
