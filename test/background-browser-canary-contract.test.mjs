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
