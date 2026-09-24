import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agent=fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/isolated-desktop-backend-policy.json',import.meta.url),'utf8'));

test('isolated desktop capability probe never silently activates desktop execution',()=>{
  assert.match(agent,/\$AgentVersion = '2\.5\.0'/);
  assert.match(agent,/function Get-IsolatedDesktopBackendProbe/);
  assert.match(agent,/computer\.desktop\.probe/);
  assert.match(agent,/isolatedDesktopProbe = \$true/);
  assert.match(agent,/isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent,/isolatedDesktopReady = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.doesNotMatch(agent,/isolatedDesktop = \$true/);
});

test('probe prefers a headless EKODI Hyper-V base and rejects foreground Sandbox for activation',()=>{
  assert.match(agent,/Microsoft-Hyper-V-All/);
  assert.match(agent,/Containers-DisposableClientVM/);
  assert.match(agent,/Get-VM -Name 'EKODI-Isolated-Base'/);
  assert.match(agent,/windowsSandboxForegroundOnly = \$true/);
  assert.match(agent,/windowsSandboxAcceptedForActivation = \$false/);
  assert.match(agent,/headlessBackendReady = \[bool\]\$headlessBackendReady/);
  const hyper=policy.backends.find(x=>x.id==='hyper-v-ekodi-base');
  const sandbox=policy.backends.find(x=>x.id==='windows-sandbox');
  assert.equal(hyper.acceptedForActivation,true);
  assert.equal(hyper.headless,true);
  assert.equal(sandbox.acceptedForActivation,false);
  assert.equal(sandbox.headless,false);
});

test('Device Control exposes only an observe-only desktop probe and projects bounded evidence',()=>{
  assert.match(api,/'computer\.desktop\.probe': \{ risk: 'observe' \}/);
  assert.match(api,/'computer\.desktop\.probe': 'isolatedDesktopProbe'/);
  assert.match(api,/summary\.desktopProbe/);
  assert.match(api,/windowsSandboxAcceptedForActivation/);
  assert.match(api,/isolatedDesktopActivationReady/);
  assert.doesNotMatch(api,/'computer\.desktop\.session\.execute': \{ risk: 'observe'/);
});


test('Hyper-V canary creates only an ephemeral differencing VM and cleans it up',()=>{
  assert.match(agent,/computer\.desktop\.canary/);
  assert.match(agent,/function Invoke-IsolatedDesktopHyperVCanary/);
  assert.match(agent,/New-VHD -Path \$sessionDisk -ParentPath \$baseDiskPath -Differencing/);
  assert.match(agent,/New-VM -Name \$sessionName/);
  assert.match(agent,/Remove-VMNetworkAdapter/);
  assert.match(agent,/Start-VM -Name \$sessionName/);
  assert.match(agent,/Stop-VM -Name \$sessionName -TurnOff -Force/);
  assert.match(agent,/Remove-VM -Name \$sessionName -Force/);
  assert.match(agent,/sessionVmRemoved = -not \[bool\]\(Get-VM/);
  assert.match(agent,/sessionDiskRemoved = -not \(Test-Path -LiteralPath \$sessionDisk\)/);
  assert.match(agent,/isolatedDesktopCanary = \[bool\]\(Get-IsolatedDesktopCanaryState\)\.verified/);
  assert.match(agent,/isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.equal(policy.activation.canaryCommand,'computer.desktop.canary');
  assert.equal(policy.activation.canaryDoesNotEnableExecutionByItself,true);
  assert.equal(policy.canary.networkAttached,false);
  assert.equal(policy.canary.executionCapabilityAfterCanary,false);
});


test('guest runtime canary stages tasks offline and keeps full desktop execution disabled',()=>{
  assert.match(agent,/computer\.desktop\.guest\.canary/);
  assert.match(agent,/function Invoke-IsolatedDesktopGuestRuntimeCanary/);
  assert.match(agent,/function Mount-EkodiGuestWindowsVolume/);
  assert.match(agent,/Write-EkodiGuestRuntimeTask/);
  assert.match(agent,/Read-EkodiGuestRuntimeReceipt/);
  assert.match(agent,/type = 'guest\.runtime\.probe'/);
  assert.match(agent,/networkPolicy = 'none'/);
  assert.match(agent,/isolatedDesktopGuestCanary = \[bool\]\(Get-IsolatedDesktopGuestCanaryState\)\.verified/);
  assert.match(agent,/isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.equal(policy.activation.guestCanaryCommand,'computer.desktop.guest.canary');
  assert.equal(policy.activation.guestCanaryRequiredBeforeExecution,true);
  assert.equal(policy.activation.guestCanaryDoesNotEnableExecutionByItself,true);
  assert.equal(policy.guestAgent.guestCredentialsRequired,false);
  assert.equal(policy.guestAgent.transport,'offline-differencing-vhdx-task-and-receipt');
  assert.equal(policy.guestCanary.executionCapabilityAfterGuestCanary,false);
});


test('semantic guest UI canary remains isolated and cannot unlock general desktop execution',()=>{
  assert.match(agent,/computer\.desktop\.ui\.canary/);
  assert.match(agent,/function Invoke-IsolatedDesktopGuestUiCanary/);
  assert.match(agent,/type = 'guest\.ui\.probe'/);
  assert.match(agent,/semanticUiAutomation/);
  assert.match(agent,/lowLevelInputInjection/);
  assert.match(agent,/hostInteractiveDesktopUsed/);
  assert.match(agent,/isolatedDesktopUiCanary = \[bool\]\(Get-IsolatedDesktopUiCanaryState\)\.verified/);
  assert.match(agent,/isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.equal(policy.activation.uiCanaryCommand,'computer.desktop.ui.canary');
  assert.equal(policy.uiCanary.expectedResultCode,'EKODI_UI_OK');
  assert.equal(policy.uiCanary.generalDesktopExecutionCapabilityAfterUiCanary,false);
});


test('bounded session canary is the only gate that may project isolatedDesktop capability',()=>{
  assert.match(agent,/computer\.desktop\.session\.canary/);
  assert.match(agent,/computer\.desktop\.session\.execute/);
  assert.match(agent,/function Invoke-IsolatedDesktopSessionCanary/);
  assert.match(agent,/function Invoke-IsolatedDesktopSessionExecute/);
  assert.match(agent,/function Invoke-IsolatedDesktopBoundedSessionTask/);
  assert.match(agent,/guest\.session\.execute/);
  assert.match(agent,/ui\.text\.roundtrip/);
  assert.match(agent,/isolatedDesktopSessionCanary = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent,/isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.doesNotMatch(agent,/isolatedDesktop = \$true/);
  assert.equal(policy.activation.sessionCanaryCommand,'computer.desktop.session.canary');
  assert.equal(policy.activation.sessionCanaryRequiredBeforeExecution,true);
  assert.equal(policy.activation.sessionCanaryEnablesBoundedExecutionCapability,true);
  assert.equal(policy.activation.generalUnboundedDesktopExecutionAfterSessionCanary,false);
  assert.equal(policy.sessionExecutor.version,'bounded-v1');
  assert.deepEqual(policy.sessionExecutor.allowedOperations,['ui.text.roundtrip']);
  assert.equal(policy.sessionExecutor.rawInputReturnedInCloudResult,false);
  assert.equal(policy.sessionExecutor.generalPurposeShell,false);
});
