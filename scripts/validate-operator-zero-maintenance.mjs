import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const text=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,'');
const failures=[];
const fail=message=>failures.push(message);

const policy=json('config/operator-zero-maintenance-policy.json');
const virtualization=json('config/virtualization-routing-policy.json');
const board=json('config/replaceable-board-engine-policy.json');
const boardRuntime=text('board-runtime-guard.js');
const boardProvider=text('replaceable-board-provider.js');
const seonammediBoard=text('seonammedi-civic-control.js');
const seonammediAdmin=text('seonammedi-admin-control.js');
const journalBoard=text('journal-worker.js');
const communityBoard=text('supabase/functions/community-api/index.ts');
const organizationBoard=text('supabase/migrations/20260914095000_organization_subsite_operations.sql');
const sharedSiteRelease=text('.github/workflows/deploy-site-core.yml');
const controlApiRelease=text('.github/workflows/deploy-control-api.yml');
const ui=text('config/ui-surface-policy.js');

if(policy.policyId!=='OPERATOR-ZERO-MAINTENANCE-001'||policy.status!=='enforced')fail('zero-maintenance policy must be enforced');
if(policy.principle!=='operators-manage-content-not-software')fail('content-first operator principle missing');
for(const key of ['sharedKernelRequired','declarativeManifestRequired','siteSpecificCrudForkForbidden','duplicateContentAdminUiForbidden','authenticatedAdminOperatesOnUserSurface','stableBackwardCompatibleContract']){
  if(policy.construction?.[key]!==true)fail('construction rule missing: '+key);
}
for(const key of ['ekodiOrchestratorOwnsLifecycle','nativeVirtualizationFirst','automatedRegressionRequired','automatedSecurityAndDependencyRemediation','canaryAndRollbackRequired','selfHealingAndReconcileRequired','externalProviderHotSwapRequired','operatorEscalationOnlyAfterAutomaticRecoveryExhausted']){
  if(policy.automation?.[key]!==true)fail('automation rule missing: '+key);
}
if(policy.contentFirst?.newBoardRequiresCodeCopy!==false)fail('new board code copy must be forbidden');
for(const input of ['manifest','content','role-policy'])if(!policy.contentFirst?.newBoardInputs?.includes(input))fail('new board input missing: '+input);
if(virtualization.owner!=='ekodi-orchestrator'||virtualization.selection?.nativeFirst!==true||virtualization.selection?.externalForbiddenWhenEligibleNativeHealthy!==true)fail('EKODI native virtualization-first contract drifted');
if(board.status!=='enforced'||board.appliesRecursivelyToAllServices!==true||board.architecture?.providerInterfaceRequired!==true||board.architecture?.nativeFallbackRequired!==true)fail('replaceable board policy must remain recursive and provider-independent');
for(const key of ['coreRuntimeGuardRequired','coreOperationsAlwaysUseEkodiAdapter','externalEngineMayNotOwnCanonicalCrud','aiSynchronousDependencyForbidden','aiFailureMustNotAffectCoreBoard','runtimeExtensionFailureIsolation'])if(board.architecture?.[key]!==true)fail('board resilience rule missing: '+key);
if(board.aiIndependence?.criticalPathAiDependency!=='forbidden'||board.aiIndependence?.synchronousAiProviderCalls!=='forbidden')fail('board AI independence policy drifted');
if(!boardRuntime.includes('aiIndependent:true')||!boardRuntime.includes("coreSource:'ekodi-board-adapter'"))fail('board runtime guard must declare AI-independent EKODI core ownership');
if(/fetch\s*\(|openai|anthropic|gemini|llm|ekodi-ai/i.test(boardRuntime))fail('board runtime guard must not call AI or external providers');
if(!boardProvider.includes('createBoardRuntimeGuard')||!boardProvider.includes("coreEngineId:'ekodi-native'"))fail('replaceable board provider must keep EKODI native core runtime');
if(!seonammediBoard.includes('createBoardRuntimeGuard({adapter:citizenVoiceAdapter})'))fail('seonammedi citizen board must use the AI-independent runtime guard');
if(!seonammediAdmin.includes("boardId:'seonammedi.notice'")||!seonammediAdmin.includes('createBoardRuntimeGuard({adapter:seonamNoticeAdapter})'))fail('seonammedi notice board must use the AI-independent runtime guard');
for(const action of ['list','read','search','create','edit','delete','attachments','health'])if(!seonammediAdmin.includes(`handleBoardAdapter(seonamNoticeBoard,{action:'${action}'`))fail(`seonammedi notice board bypasses runtime guard for ${action}`);
if(/api\\.openai\\.com|anthropic|generativelanguage\\.googleapis\\.com|workers[_-]?ai/i.test(journalBoard))fail('journal core posts path must remain AI-independent');
if(!organizationBoard.includes('organization_notices')||/openai|anthropic|gemini|llm/i.test(organizationBoard))fail('organization notices must remain native and AI-independent');
for(const marker of ['if (!OPENAI_API_KEY || !OPENAI_MODEL) return fallback','if (!response.ok) return fallback','community draft provider','return fallback'])if(!communityBoard.includes(marker))fail('community optional AI fallback drifted: '+marker);
const registeredBoardSurfaces=new Set((board.verifiedIndependentSurfaces||[]).map(item=>item.id));
for(const id of ['seonammedi.citizen_voice','seonammedi.notice','journal.posts','organization.notices','community'])if(!registeredBoardSurfaces.has(id))fail('existing board surface missing AI-independence registration: '+id);
for(const file of ['common-board-adapter.js','board-runtime-guard.js','replaceable-board-provider.js','board-engine-registry.js']){
  if(!sharedSiteRelease.includes(`'${file}'`))fail(`shared-site release must trigger on common board runtime change: ${file}`);
  if(!controlApiRelease.includes(`'${file}'`))fail(`control-api release must trigger on common board runtime change: ${file}`);
}
for(const file of ['config/replaceable-board-engine-policy.json','config/module-first-policy.json']){
  if(!sharedSiteRelease.includes(`'${file}'`))fail(`shared-site release must trigger on board policy change: ${file}`);
  if(!controlApiRelease.includes(`'${file}'`))fail(`control-api release must trigger on board policy change: ${file}`);
}
for(const marker of ['userSurfaceIsPrimaryOperationalSurface:true','authenticatedAdminOperatesInPlace:true','duplicateContentAdminUiForbidden:true','dedicatedAdminRestrictedToSystemControl:true'])if(!ui.includes(marker))fail('user/admin integration drifted: '+marker);

if(failures.length){
  console.error('OPERATOR-ZERO-MAINTENANCE-001 validation failed');
  for(const item of failures)console.error('- '+item);
  process.exit(1);
}
console.log('OPERATOR-ZERO-MAINTENANCE-001: OK');
console.log('- operators manage content, not board software');
console.log('- user/admin same-surface administration remains enforced');
console.log('- EKODI native virtualization is first-line verification/recovery');
console.log('- board CRUD/search remains AI-independent; replaceable engines are extension-only');
