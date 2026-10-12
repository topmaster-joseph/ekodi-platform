import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = new URL('../', import.meta.url);
const policy = JSON.parse(readFileSync(new URL('config/device-capability-governance-policy.json',base),'utf8'));
const script = readFileSync(new URL('tools/ekodi-device-agent/windows/inventory-ekodi-desktop.ps1',base),'utf8');
test('desktop organization is disabled by default and permanent deletion forbidden',()=>{
  assert.equal(policy.activationDefault,false);
  assert.equal(policy.capabilities.workspace.defaultMode,'dry-run');
  assert.equal(policy.capabilities.workspace.permanentDeleteDefault,false);
  assert.equal(policy.capabilities.workspace.noFollowSymlinks,true);
});
test('credential disclosure and unrestricted remote shells remain forbidden',()=>{
  assert.equal(policy.capabilities.credentials.rawTokenToAiForbidden,true);
  assert.equal(policy.capabilities.remoteExecution.arbitraryShellDefault,false);
});
test('Windows inventory is read-only and does not traverse folders',()=>{
  assert.match(script,/Get-ChildItem -LiteralPath \$DesktopPath/);
  assert.match(script,/suggestedAction = 'review-only'/);
  assert.doesNotMatch(script,/Remove-Item|Move-Item|Copy-Item|Start-Process|Get-Content|Invoke-WebRequest|Invoke-RestMethod/);
  assert.match(script,/Refusing to overwrite existing report/);
});
