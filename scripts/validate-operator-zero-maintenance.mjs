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
