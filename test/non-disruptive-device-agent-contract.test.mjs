import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [agent, policyRaw] = await Promise.all([
  readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../config/remote-computer-execution-policy.json', import.meta.url), 'utf8'),
]);
const policy = JSON.parse(policyRaw);

test('Windows Agent keeps non-disruptive executors disabled until a real worker is verified', () => {
  assert.match(agent, /\$AgentVersion = '2\.2\.3'/);
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
