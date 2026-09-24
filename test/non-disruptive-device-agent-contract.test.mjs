import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [agent, policyRaw, admin, windowsWorkflow] = await Promise.all([
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../config/remote-computer-execution-policy.json', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/device-control-windows.yml', import.meta.url), 'utf8'),
]);
const policy = JSON.parse(policyRaw);

test('Windows Agent exposes isolated desktop only through the verified bounded session canary', () => {
  assert.match(agent, /\$AgentVersion = '2\.4\.0'/);
  assert.match(agent, /backgroundBrowserCanary = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /backgroundBrowser = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopProbe = \$true/);
  assert.match(agent, /isolatedDesktopCanary = \[bool\]\(Get-IsolatedDesktopCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopGuestCanary = \[bool\]\(Get-IsolatedDesktopGuestCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopUiCanary = \[bool\]\(Get-IsolatedDesktopUiCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopSessionCanary = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent, /desktopInput = \$false/);
});

test('remote computer policy forbids minimized-window pseudo isolation and silent foreground takeover', () => {
  assert.equal(policy.nonDisruptiveExecution.minimizedWindowIsIsolation, false);
  assert.equal(policy.nonDisruptiveExecution.sameBrowserProfileConcurrentControl, false);
  assert.equal(policy.nonDisruptiveExecution.backgroundBrowser.dedicatedAutomationProfileRequired, true);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.sharedInteractiveDesktopForbidden, true);
  assert.equal(policy.nonDisruptiveExecution.foregroundTakeover.automaticFallback, false);
  assert.equal(policy.nonDisruptiveExecution.foregroundTakeover.explicitLocalConsentRequired, true);
});


test('Agent status and admin UI expose non-disruptive readiness without enabling it', () => {
  assert.match(agent, /foregroundUserSessionProtected = \$true/);
  assert.match(agent, /backgroundBrowserCanaryVerified = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /backgroundBrowserReady = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopProbeAvailable = \$true/);
  assert.match(agent, /isolatedDesktopCanaryVerified = \[bool\]\(Get-IsolatedDesktopCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopGuestCanaryVerified = \[bool\]\(Get-IsolatedDesktopGuestCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopUiCanaryVerified = \[bool\]\(Get-IsolatedDesktopUiCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopSessionCanaryVerified = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopReady = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent, /minimizedWindowCountsAsIsolation = \$false/);
  assert.match(admin, /사용자 화면 보호가 기본입니다/);
  assert.match(admin, /BG Browser/);
  assert.match(admin, /Isolated Desktop/);
  assert.match(admin, /최소화 창은 격리로 인정하지 않습니다/);
});


test('background browser worker is canary-gated, ephemeral, headless and read-only', () => {
  assert.match(agent, /'computer\.browser\.canary'/);
  assert.match(agent, /'computer\.browser\.execute'/);
  assert.match(agent, /background_browser_canary_required/);
  assert.match(agent, /BrowserWorker\\CanaryProfile/);
  assert.match(agent, /BrowserWorker\\Tasks/);
  assert.match(agent, /--headless=new/);
  assert.match(agent, /--blink-settings=scriptEnabled=false/);
  assert.match(agent, /mutationMode = 'read-only-static-surface'/);
  assert.match(agent, /ephemeralProfile = \$true/);
  assert.match(agent, /activeUserProfileReused = \$false/);
  assert.match(agent, /dedicatedAutomationProfile = \$true/);
  assert.match(agent, /focusIsolated = \$true/);
  assert.match(agent, /clipboardShared = \$false/);
  assert.match(agent, /userInputInjection = \$false/);
  assert.match(agent, /profileRemoved = -not \(Test-Path -LiteralPath \$taskProfile\)/);
  assert.doesNotMatch(agent, /desktopInput = \$true/);
});


test('Windows CI executes the EKODI-native browser runtime proof', () => {
  assert.match(windowsWorkflow, /Run native Background Browser Worker on Windows runner/);
  assert.match(windowsWorkflow, /Invoke-BackgroundBrowserCanary/);
  assert.match(windowsWorkflow, /Invoke-BackgroundBrowserWorker/);
  assert.match(windowsWorkflow, /virtualizationProvider -ne 'ekodi-native-remote-computer'/);
  assert.match(windowsWorkflow, /profileRemoved/);
  assert.match(windowsWorkflow, /mutationMode -ne 'read-only-static-surface'/);
});


test('isolated desktop backend probe keeps foreground Windows Sandbox out of activation', () => {
  assert.match(agent, /computer\.desktop\.probe/);
  assert.match(agent, /Microsoft-Hyper-V-All/);
  assert.match(agent, /Containers-DisposableClientVM/);
  assert.match(agent, /Get-VM -Name 'EKODI-Isolated-Base'/);
  assert.match(agent, /windowsSandboxForegroundOnly = \$true/);
  assert.match(agent, /windowsSandboxAcceptedForActivation = \$false/);
  assert.match(agent, /isolatedDesktopActivationReady = \[bool\]\$headlessBackendReady/);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.backendPolicy, 'config/isolated-desktop-backend-policy.json');
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.executionCapabilityDefault, false);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.headlessBackendRequired, true);
});


test('headless Hyper-V canary never unlocks isolated desktop execution', () => {
  assert.match(agent, /computer\.desktop\.canary/);
  assert.match(agent, /isolated_desktop_headless_backend_not_ready/);
  assert.match(agent, /ephemeralDifferencingDisk = \$true/);
  assert.match(agent, /networkAttached = \$false/);
  assert.match(agent, /sharedInteractiveDesktop = \$false/);
  assert.match(agent, /clipboardShared = \$false/);
  assert.match(agent, /userInputInjection = \$false/);
  assert.match(agent, /sessionVmRemoved = -not \[bool\]\(Get-VM/);
  assert.match(agent, /sessionDiskRemoved = -not \(Test-Path -LiteralPath \$sessionDisk\)/);
  assert.doesNotMatch(agent, /isolatedDesktop = \$true/);
});


test('guest runtime proof remains networkless, credentialless and non-interactive', () => {
  assert.match(agent, /computer\.desktop\.guest\.canary/);
  assert.match(agent, /offline-differencing-vhdx-task-and-receipt|Write-EkodiGuestRuntimeTask/);
  assert.match(agent, /guest\.runtime\.probe/);
  assert.match(agent, /noNetworkAdapter/);
  assert.match(agent, /noActiveNetwork/);
  assert.match(agent, /interactiveDesktopUsed/);
  assert.match(agent, /credentialCollection/);
  assert.match(agent, /hostProfileMounted/);
  assert.doesNotMatch(agent, /isolatedDesktop = \$true/);
});


test('semantic isolated guest UI canary never touches the host interactive desktop', () => {
  assert.match(agent, /computer\.desktop\.ui\.canary/);
  assert.match(agent, /isolated_guest_runtime_canary_required/);
  assert.match(agent, /guest\.ui\.probe/);
  assert.match(agent, /semanticUiAutomation/);
  assert.match(agent, /lowLevelInputInjection/);
  assert.match(agent, /hostInteractiveDesktopUsed/);
  assert.match(agent, /syntheticUiOnly/);
  assert.match(agent, /isolatedDesktopUiCanary = \[bool\]\(Get-IsolatedDesktopUiCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.uiCanaryCommand, 'computer.desktop.ui.canary');
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.uiCanaryRequiredBeforeExecution, true);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.lowLevelGuestInputInjectionForbiddenForCanary, true);
});


test('bounded session execution is semantic, ephemeral and cannot expand into an unbounded desktop', () => {
  assert.match(agent, /computer\.desktop\.session\.canary/);
  assert.match(agent, /computer\.desktop\.session\.execute/);
  assert.match(agent, /function Invoke-IsolatedDesktopBoundedSessionTask/);
  assert.match(agent, /guest\.session\.execute/);
  assert.match(agent, /ui\.text\.roundtrip/);
  assert.match(agent, /isolated_session_canary_required/);
  assert.match(agent, /inputSha256/);
  assert.match(agent, /outputSha256/);
  assert.match(agent, /roundTripMatched/);
  assert.match(agent, /mutationScope = \[string\]\$receipt\.mutationScope/);
  assert.match(agent, /isolatedDesktopSessionCanary = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktop = \[bool\]\(Get-IsolatedDesktopSessionCanaryState\)\.verified/);
  assert.doesNotMatch(agent, /isolatedDesktop = \$true/);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.sessionCanaryCommand, 'computer.desktop.session.canary');
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.sessionExecutorCommand, 'computer.desktop.session.execute');
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.sessionExecutorScope, 'bounded-v1');
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.unboundedDesktopExecutionRemainsForbidden, true);
  assert.equal(policy.nonDisruptiveExecution.isolatedDesktop.rawSessionInputReturnedInCloudResult, false);
});
