import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [agent, policyRaw, admin] = await Promise.all([
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../config/remote-computer-execution-policy.json', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
]);
const policy = JSON.parse(policyRaw);

test('Windows Agent keeps non-disruptive executors disabled until a real worker is verified', () => {
  assert.match(agent, /\$AgentVersion = '2\.2\.4'/);
  assert.match(agent, /backgroundBrowserCanary = \[bool\]\(Get-BackgroundBrowserCanaryState\)\.verified/);
  assert.match(agent, /backgroundBrowser = \$false/);
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
  assert.match(agent, /backgroundBrowserReady = \$false/);
  assert.match(agent, /isolatedDesktopReady = \$false/);
  assert.match(agent, /minimizedWindowCountsAsIsolation = \$false/);
  assert.match(admin, /사용자 화면 보호가 기본입니다/);
  assert.match(admin, /BG Browser/);
  assert.match(admin, /Isolated Desktop/);
  assert.match(admin, /최소화 창은 격리로 인정하지 않습니다/);
});


test('background browser canary is isolated evidence, not execution activation', () => {
  assert.match(agent, /'computer\.browser\.canary'/);
  assert.match(agent, /--headless=new/);
  assert.match(agent, /BrowserWorker\\CanaryProfile/);
  assert.match(agent, /dedicatedAutomationProfile = \$true/);
  assert.match(agent, /focusIsolated = \$true/);
  assert.match(agent, /clipboardShared = \$false/);
  assert.match(agent, /userInputInjection = \$false/);
  assert.doesNotMatch(agent, /backgroundBrowser = \$true/);
});
