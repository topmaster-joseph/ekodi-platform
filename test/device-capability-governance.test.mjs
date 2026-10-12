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

test('remote inventory command is allowlisted, capacity-gated and read-only',()=>{
  const api=readFileSync(new URL('device-control.js',base),'utf8');
  const agent=readFileSync(new URL('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',base),'utf8');
  assert.ok(api.includes("'filesystem.inventory': { risk: 'observe' }"));
  assert.ok(api.includes("'filesystem.inventory': 'filesystemInventory'"));
  assert.ok(agent.includes('filesystemInventory = $true'));
  assert.ok(agent.includes("[Security.Principal.WindowsIdentity]::GetCurrent().IsSystem"));
  assert.ok(agent.includes("status = 'requires-user-context'"));
  assert.ok(agent.includes("'filesystem.inventory' {"));
  assert.ok(agent.includes("suggestedAction = 'review-only'"));
  assert.ok(agent.includes('Select-Object -First 100'));
});

test('admin exposes inventory without granting mutation',()=>{
  const admin=readFileSync(new URL('device-control-admin.js',base),'utf8');
  assert.ok(admin.includes("makeActionButton(device, 'filesystem.inventory'"));
  assert.ok(admin.includes("!capability(device, 'filesystemInventory')"));
  assert.ok(admin.includes("inventory.status === 'requires-user-context'"));
  assert.ok(admin.includes("li.textContent ="));
  assert.ok(admin.includes("result.append(inventoryCard)"));
});
