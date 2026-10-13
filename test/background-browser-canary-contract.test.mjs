import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(
  new URL('../tools/ekodi-device-agent/windows/background-browser-canary.ps1', import.meta.url),
  'utf8',
);

test('background browser canary uses a dedicated headless profile without foreground input', () => {
  assert.match(worker, /--headless=new/);
  assert.match(worker, /--user-data-dir/);
  assert.match(worker, /CreateNoWindow = \$true/);
  assert.match(worker, /dedicatedAutomationProfile = \$true/);
  assert.match(worker, /focusIsolated = \$true/);
  assert.match(worker, /clipboardShared = \$false/);
  assert.match(worker, /userInputInjection = \$false/);
  assert.doesNotMatch(worker, /SendKeys|SetCursorPos|mouse_event|keybd_event|Clipboard::Set/);
});

test('background browser canary rejects local and non-http targets', () => {
  assert.match(worker, /unsupported_url_scheme/);
  assert.match(worker, /loopback_target_forbidden/);
  assert.match(worker, /url_userinfo_forbidden/);
});

const deviceAgent = await readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8');
test('device agent canary covers Windows x86 browser locations and emits actionable failure evidence', () => {
  assert.match(deviceAgent, /ProgramFiles\(x86\)/);
  assert.match(deviceAgent, /background_browser_canary_failed: browser=/);
  assert.match(deviceAgent, /stdoutBytes=/);
  assert.match(deviceAgent, /stderr=/);
  assert.match(deviceAgent, /--headless=new/);
  assert.match(deviceAgent, /CreateNoWindow = \$true/);
});

test('device canary uses a fresh unique profile and cleans it even when the browser fails', () => {
  assert.match(deviceAgent, /\$canaryProfile = Join-Path \$BrowserCanaryProfileRoot \(\[Guid\]::NewGuid\(\)\.ToString\('N'\)\)/);
  assert.match(deviceAgent, /--user-data-dir=.*\$canaryProfile/);
  assert.match(deviceAgent, /Remove-Item -LiteralPath \$canaryProfile -Recurse -Force -ErrorAction SilentlyContinue/);
  assert.match(deviceAgent, /\$process\.ExitCode -eq 0 -and \$stdout\.Length -gt 0/);
});

test('device canary retries empty Chrome DOM on Edge with an isolated profile and remains fail closed', () => {
  assert.match(deviceAgent, /function Resolve-EkodiEdgeBrowser/);
  assert.match(deviceAgent, /function Invoke-BackgroundBrowserCanary\(\[bool\]\$PreferEdge = \$false\)/);
  assert.match(deviceAgent, /-not \$PreferEdge -and \[IO.Path\]::GetFileName\(\$browser\) -eq 'chrome.exe'/);
  assert.match(deviceAgent, /Invoke-BackgroundBrowserCanary -PreferEdge \$true/);
  assert.match(deviceAgent, /\$process\.ExitCode -eq 0 -and \$stdout\.Length -gt 0/);
});


test('native agent journals every allowlisted browser command from its central dispatcher', () => {
  assert.match(deviceAgent, /function Start-EkodiBrowserTaskAudit/);
  assert.match(deviceAgent, /function Finish-EkodiBrowserTaskAudit/);
  assert.match(deviceAgent, /function Get-EkodiBrowserTaskAuditSummary/);
  assert.match(deviceAgent, /browserTaskAudit = Get-EkodiBrowserTaskAuditSummary/);
  assert.match(deviceAgent, /'computer\.browser\.canary','computer\.browser\.execute','computer\.browser\.pr\.observe'/);
  assert.match(deviceAgent, /Start-EkodiBrowserTaskAudit \$response\.command/);
  assert.match(deviceAgent, /Finish-EkodiBrowserTaskAudit \$audit 'completed' \$result/);
  assert.match(deviceAgent, /Finish-EkodiBrowserTaskAudit \$audit 'failed'/);
  assert.match(deviceAgent, /commandKey = Get-Sha256String \$id/);
  assert.match(deviceAgent, /schema = 'ekodi-native-browser-task-v1'/);
  assert.match(deviceAgent, /state = 'running'/);
  assert.match(deviceAgent, /'cleanup_unverified'/);
  assert.doesNotMatch(deviceAgent, /Stop-Process\s+-Name\s+(?:opera|chrome|msedge)/i);
});

test('native screenshot closes only owned process tree and checks unique profile orphans', () => {
  assert.match(deviceAgent, /function Find-EkodiOwnedProfileBrowsers/);
  assert.match(deviceAgent, /Task-'\s*$/m);
  assert.match(deviceAgent, /Get-CimInstance Win32_Process/);
  assert.match(deviceAgent, /--user-data-dir=/);
  assert.match(deviceAgent, /taskkill\.exe \/PID \$process\.Id \/T \/F/);
  assert.match(deviceAgent, /Find-EkodiOwnedProfileBrowsers \$TaskProfile/);
  assert.match(deviceAgent, /browserProcessClosed = \[bool\]\$treeClosed/);
  assert.match(deviceAgent, /background_browser_process_cleanup_unverified/);
  assert.match(deviceAgent, /background_browser_profile_cleanup_failed/);
});
