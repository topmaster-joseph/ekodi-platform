import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guest=fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-isolated-guest-agent.ps1',import.meta.url),'utf8');
const installer=fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/install-isolated-guest-agent.ps1',import.meta.url),'utf8');
const host=fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/isolated-desktop-backend-policy.json',import.meta.url),'utf8'));

test('isolated guest agent is single-purpose, SYSTEM-run and networkless by contract',()=>{
  assert.match(guest,/\$GuestAgentVersion = '1\.1\.0'/);
  assert.match(guest,/\$allowedTypes = @\('guest\.runtime\.probe','guest\.ui\.probe'\)/);
  assert.match(guest,/\[string\]\$task\.networkPolicy -ne 'none'/);
  assert.match(guest,/executedAsSystem/);
  assert.match(guest,/noNetworkAdapter/);
  assert.match(guest,/noActiveNetwork/);
  assert.match(guest,/interactiveDesktopUsed = \$false/);
  assert.match(guest,/sharedInteractiveDesktop = \$false/);
  assert.match(guest,/clipboardShared = \$false/);
  assert.match(guest,/userInputInjection = \$false/);
  assert.match(guest,/credentialCollection = \$false/);
  assert.match(guest,/hostProfileMounted = \$false/);
  assert.match(guest,/mutationScope = 'ephemeral-guest-only'/);
  assert.doesNotMatch(guest,/Invoke-Expression|iex\s|Start-BitsTransfer|Invoke-WebRequest|Invoke-RestMethod|New-PSSession|Enter-PSSession/i);
});

test('guest agent installer registers only an at-startup SYSTEM task',()=>{
  assert.match(guest,/New-ScheduledTaskTrigger -AtStartup/);
  assert.match(guest,/New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest/);
  assert.match(guest,/Register-ScheduledTask -TaskName \$TaskName/);
  assert.match(installer,/ekodi-isolated-guest-agent\.ps1/);
  assert.match(installer,/EKODI Isolated Guest Agent/);
});

test('host exchanges task and receipt through the ephemeral differencing disk without guest credentials',()=>{
  assert.match(host,/Mount-EkodiGuestWindowsVolume/);
  assert.match(host,/Write-EkodiGuestRuntimeTask/);
  assert.match(host,/Read-EkodiGuestRuntimeReceipt/);
  assert.match(host,/ProgramData\\EKODI\\GuestAgent/);
  assert.match(host,/networkPolicy = 'none'/);
  assert.match(host,/Get-VMIntegrationService -VMName \$sessionName -Name 'Heartbeat'/);
  assert.match(host,/guestCredentials|credentialCollection/);
  assert.match(host,/sessionVmRemoved/);
  assert.match(host,/sessionDiskRemoved/);
  assert.doesNotMatch(host,/Get-Credential|ConvertTo-SecureString.*guest|New-PSSession.*VMName|Invoke-Command.*VMName/i);
});

test('policy keeps guest proof as a gate, never as automatic desktop activation',()=>{
  assert.equal(policy.guestAgent.transport,'offline-differencing-vhdx-task-and-receipt');
  assert.equal(policy.guestAgent.networkRequired,false);
  assert.equal(policy.guestAgent.guestCredentialsRequired,false);
  assert.equal(policy.guestAgent.executeAs,'SYSTEM');
  assert.equal(policy.activation.guestCanaryRequiredBeforeExecution,true);
  assert.equal(policy.activation.guestCanaryDoesNotEnableExecutionByItself,true);
  assert.equal(policy.guestCanary.executionCapabilityAfterGuestCanary,false);
});


test('semantic UI canary drives only an isolated synthetic guest surface',()=>{
  assert.match(guest,/function Invoke-GuestUiProbe/);
  assert.match(guest,/guest\.ui\.probe/);
  assert.match(guest,/System\.Windows\.Automation\.AutomationElement/);
  assert.match(guest,/System\.Windows\.Automation\.InvokePattern/);
  assert.match(guest,/semanticUiAutomation = \$true/);
  assert.match(guest,/lowLevelInputInjection = \$false/);
  assert.match(guest,/hostInteractiveDesktopUsed = \$false/);
  assert.match(guest,/syntheticUiOnly = \$true/);
  assert.match(guest,/resultCode = \[string\]\$resultLabel\.Text/);
  assert.match(guest,/mutationScope = 'ephemeral-guest-ui-only'/);
  assert.doesNotMatch(guest,/SendKeys|mouse_event|keybd_event|SendInput|GetClipboard|SetClipboard/i);
  assert.equal(policy.activation.uiCanaryCommand,'computer.desktop.ui.canary');
  assert.equal(policy.activation.uiCanaryRequiredBeforeExecution,true);
  assert.equal(policy.activation.uiCanaryDoesNotEnableGeneralDesktopExecutionByItself,true);
  assert.equal(policy.uiCanary.semanticUiAutomation,true);
  assert.equal(policy.uiCanary.lowLevelInputInjection,false);
  assert.equal(policy.uiCanary.generalDesktopExecutionCapabilityAfterUiCanary,false);
});
