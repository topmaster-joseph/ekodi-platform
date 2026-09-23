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

test('Windows Agent enables browser execution and isolated-desktop canary while full isolated desktop stays disabled', () => {
  assert.match(agent, /\$AgentVersion = '2\.3\.1'/);
  assert.match(agent, /backgroundBrowserCanary = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /backgroundBrowser = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopCanary = \[bool\]\(Get-IsolatedDesktopCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktop = \$false/);
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
  assert.match(agent, /isolatedDesktopCanaryVerified = \[bool\]\(Get-IsolatedDesktopCanaryState\)\.verified/);
  assert.match(agent, /isolatedDesktopReady = \$false/);
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


test('native isolated desktop canary uses a separate Windows desktop object without foreground takeover', () => {
  assert.match(agent, /function Invoke-IsolatedDesktopCanary/);
  assert.match(agent, /CreateDesktopW/);
  assert.match(agent, /CreateProcessW/);
  assert.match(agent, /GetThreadDesktop/);
  assert.match(agent, /OpenInputDesktop/);
  assert.match(agent, /childDesktopName = \$childDesktopName/);
  assert.match(agent, /sharedInteractiveDesktop = \$false/);
  assert.match(agent, /switchDesktopCalled = \$false/);
  assert.match(agent, /foregroundUserSessionProtected = \$true/);
  assert.match(agent, /userInputInjection = \$false/);
  assert.match(agent, /clipboardShared = \$false/);
  assert.match(agent, /screenCapture = \$false/);
  assert.match(agent, /arbitraryShellFromCloud = \$false/);
  assert.match(agent, /desktopHandleClosed = \[bool\]\$desktopClosed/);
  assert.doesNotMatch(agent, /SwitchDesktop\(/);
  assert.doesNotMatch(agent, /SetThreadDesktop\(/);
});
