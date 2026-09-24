import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const policy=read('config/isolated-desktop-backend-policy.json');
const remote=read('config/remote-computer-execution-policy.json');
const routing=read('config/virtualization-routing-policy.json');
const failures=[];
const fail=m=>failures.push(m);

if(policy.policyId!=='EKODI-ISOLATED-DESKTOP-BACKEND-001'||policy.status!=='enforced-contract'||policy.owner!=='ekodi-orchestrator') fail('isolated desktop policy identity/owner drifted');
if(policy.nativeProvider!=='ekodi-native-remote-computer'||policy.routingPolicy!=='config/virtualization-routing-policy.json') fail('isolated desktop policy must bind EKODI native remote routing');
for(const key of ['foregroundUserSessionProtected','sharedInteractiveDesktopForbidden','userInputInjectionForbidden','clipboardSharingForbidden','hostCredentialCollectionForbidden','headlessOrNonInteractiveBackendRequired','boundedLeaseRequired','ephemeralGuestStateRequired','machineReadableProofRequired']) if(policy.requirements?.[key]!==true) fail(`required isolation guard missing: ${key}`);
if(policy.requirements?.minimizedWindowIsIsolation!==false) fail('minimized windows must never count as isolation');
const hyper=(policy.backends||[]).find(x=>x.id==='hyper-v-ekodi-base')||{};
const sandbox=(policy.backends||[]).find(x=>x.id==='windows-sandbox')||{};
if(hyper.kind!=='vm'||hyper.priority!==1||hyper.acceptedForActivation!==true||hyper.headless!==true) fail('Hyper-V EKODI base backend must remain the preferred accepted headless backend');
if(sandbox.kind!=='sandbox'||sandbox.acceptedForActivation!==false||sandbox.headless!==false) fail('Windows Sandbox must remain detection-only because it opens foreground UI');
if(policy.activation?.isolatedDesktopCapabilityDefault!==false||policy.activation?.probeCommand!=='computer.desktop.probe'||policy.activation?.canaryCommand!=='computer.desktop.canary'||policy.activation?.executionCommand!=='computer.desktop.session.execute') fail('isolated desktop activation defaults drifted');
if(policy.activation?.executionCommandMustRemainDisabledUntilVerifiedHeadlessBackend!==true||policy.activation?.canaryRequiredBeforeExecution!==true||policy.activation?.canaryDoesNotEnableExecutionByItself!==true) fail('isolated desktop execution must stay disabled until verified headless backend and canary proof');
if(policy.canary?.backend!=='hyper-v-ekodi-base'||policy.canary?.mode!=='ephemeral-differencing-vhdx'||policy.canary?.networkAttached!==false||policy.canary?.userDesktopAttached!==false||policy.canary?.cleanupRequired!==true||policy.canary?.executionCapabilityAfterCanary!==false) fail('isolated desktop Hyper-V canary contract drifted');
if(policy.activation?.guestCanaryCommand!=='computer.desktop.guest.canary'||policy.activation?.guestCanaryRequiredBeforeExecution!==true||policy.activation?.guestCanaryDoesNotEnableExecutionByItself!==true) fail('isolated desktop guest canary activation contract drifted');
if(policy.guestAgent?.id!=='ekodi-isolated-guest-agent'||policy.guestAgent?.version!=='1.1.0') fail('isolated guest agent identity/version drifted');
if(policy.guestAgent?.transport!=='offline-differencing-vhdx-task-and-receipt'||policy.guestAgent?.networkRequired!==false||policy.guestAgent?.guestCredentialsRequired!==false) fail('guest agent must use credentialless offline task/receipt transport');
if(policy.guestAgent?.executeAs!=='SYSTEM'||policy.guestAgent?.interactiveDesktopUsed!==false||policy.guestAgent?.clipboardShared!==false||policy.guestAgent?.userInputInjection!==false||policy.guestAgent?.credentialCollection!==false||policy.guestAgent?.hostProfileMounted!==false) fail('guest agent privacy/isolation guard drifted');
if(policy.guestAgent?.mutationScope!=='ephemeral-guest-only'||policy.guestAgent?.receiptRequired!==true||policy.guestAgent?.initialTaskType!=='guest.runtime.probe') fail('guest agent initial execution scope drifted');
if(policy.guestCanary?.requiresHyperVCanary!==true||policy.guestCanary?.backend!=='hyper-v-ekodi-base'||policy.guestCanary?.ephemeralDifferencingDisk!==true||policy.guestCanary?.networkAttached!==false) fail('guest canary backend/isolation drifted');
if(policy.guestCanary?.offlineTaskStaging!==true||policy.guestCanary?.offlineReceiptCollection!==true||policy.guestCanary?.heartbeatRequired!==true) fail('guest canary evidence transport drifted');
if(policy.guestCanary?.sessionVmCleanupRequired!==true||policy.guestCanary?.sessionDiskCleanupRequired!==true||policy.guestCanary?.executionCapabilityAfterGuestCanary!==false) fail('guest canary cleanup/fail-closed contract drifted');
if(policy.activation?.uiCanaryCommand!=='computer.desktop.ui.canary'||policy.activation?.uiCanaryRequiredBeforeExecution!==true||policy.activation?.uiCanaryDoesNotEnableGeneralDesktopExecutionByItself!==true) fail('isolated desktop UI canary activation contract drifted');
if(!Array.isArray(policy.guestAgent?.allowedTaskTypes)||!policy.guestAgent.allowedTaskTypes.includes('guest.runtime.probe')||!policy.guestAgent.allowedTaskTypes.includes('guest.ui.probe')) fail('guest agent task allowlist drifted');
if(policy.uiCanary?.requiresGuestRuntimeCanary!==true||policy.uiCanary?.backend!=='hyper-v-ekodi-base'||policy.uiCanary?.taskType!=='guest.ui.probe') fail('isolated UI canary dependency/backend/task contract drifted');
if(policy.uiCanary?.networkAttached!==false||policy.uiCanary?.hostInteractiveDesktopUsed!==false||policy.uiCanary?.sharedInteractiveDesktop!==false||policy.uiCanary?.semanticUiAutomation!==true||policy.uiCanary?.lowLevelInputInjection!==false) fail('isolated UI canary interaction boundary drifted');
if(policy.uiCanary?.clipboardShared!==false||policy.uiCanary?.credentialCollection!==false||policy.uiCanary?.hostProfileMounted!==false||policy.uiCanary?.syntheticUiOnly!==true) fail('isolated UI canary privacy boundary drifted');
if(policy.uiCanary?.expectedResultCode!=='EKODI_UI_OK'||policy.uiCanary?.sessionVmCleanupRequired!==true||policy.uiCanary?.sessionDiskCleanupRequired!==true||policy.uiCanary?.generalDesktopExecutionCapabilityAfterUiCanary!==false) fail('isolated UI canary proof/cleanup gate drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.backendPolicy!=='config/isolated-desktop-backend-policy.json') fail('remote computer policy must bind isolated desktop backend policy');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.probeCommand!=='computer.desktop.probe'||remote.nonDisruptiveExecution?.isolatedDesktop?.canaryCommand!=='computer.desktop.canary'||remote.nonDisruptiveExecution?.isolatedDesktop?.executionCapabilityDefault!==false) fail('remote isolated desktop probe/canary/default gate drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.headlessBackendRequired!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.windowsSandboxForegroundUiNotActivationEligible!==true) fail('remote isolated desktop headless safety guard drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.guestCanaryCommand!=='computer.desktop.guest.canary'||remote.nonDisruptiveExecution?.isolatedDesktop?.guestCanaryRequiredBeforeExecution!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.guestCanaryDoesNotEnableExecution!==true) fail('remote isolated desktop guest proof contract drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.guestCredentialsForbidden!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.offlineTaskReceiptTransportRequired!==true) fail('remote isolated desktop must forbid guest credentials and require offline task/receipt transport');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.uiCanaryCommand!=='computer.desktop.ui.canary'||remote.nonDisruptiveExecution?.isolatedDesktop?.uiCanaryRequiredBeforeExecution!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.uiCanaryDoesNotEnableGeneralExecution!==true) fail('remote isolated desktop UI proof contract drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.semanticUiAutomationPreferredForCanary!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.lowLevelGuestInputInjectionForbiddenForCanary!==true) fail('remote isolated desktop UI canary must prefer semantic automation and forbid low-level input injection');
if(!remote.adminObservationSurface?.allowedOperations?.includes('computer.desktop.probe')) fail('desktop probe must remain observe-only available');
if(routing.selection?.nativeFirst!==true||routing.taskClasses?.['isolated-desktop-execution']?.[0]!=='ekodi-native-remote-computer') fail('isolated desktop routing must remain EKODI-native-first');

if(failures.length){
  console.error(`EKODI isolated desktop backend validation failed (${failures.length})`);
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('EKODI Isolated Desktop Backend: OK');
console.log('- Hyper-V EKODI base VM is the preferred headless native backend');
console.log('- Windows Sandbox is detected but cannot activate non-disruptive desktop execution');
console.log('- execution stays disabled until verified headless backend + Hyper-V canary + guest runtime proof exist');
console.log('- guest proof uses offline differencing-VHDX task/receipt transport with no guest credentials');
console.log('- isolated UI proof uses semantic automation inside the ephemeral guest while host desktop/input remain untouched');
