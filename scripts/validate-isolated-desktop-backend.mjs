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
if(remote.nonDisruptiveExecution?.isolatedDesktop?.backendPolicy!=='config/isolated-desktop-backend-policy.json') fail('remote computer policy must bind isolated desktop backend policy');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.probeCommand!=='computer.desktop.probe'||remote.nonDisruptiveExecution?.isolatedDesktop?.canaryCommand!=='computer.desktop.canary'||remote.nonDisruptiveExecution?.isolatedDesktop?.executionCapabilityDefault!==false) fail('remote isolated desktop probe/canary/default gate drifted');
if(remote.nonDisruptiveExecution?.isolatedDesktop?.headlessBackendRequired!==true||remote.nonDisruptiveExecution?.isolatedDesktop?.windowsSandboxForegroundUiNotActivationEligible!==true) fail('remote isolated desktop headless safety guard drifted');
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
console.log('- execution stays disabled until a verified headless backend exists');
