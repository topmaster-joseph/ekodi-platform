import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const agent=fs.readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
const control=fs.readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
test('USER2 Hyper-V remote enable requires explicit server confirmation and privileges',()=>{
 assert.match(control,/'computer\.hyperv\.enable': \{ risk: 'privileged', confirm: true \}/);
 assert.match(control,/'computer\.hyperv\.preflight': \{ risk: 'observe' \}/);
 assert.match(agent,/\[Environment\]::MachineName -ine 'user2'/);
 assert.match(agent,/EKODI_HYPERV_ELEVATION_REQUIRED/);
 assert.match(agent,/EKODI_HYPERV_FIRMWARE_NOT_READY/);
});
test('USER2 Hyper-V enable never reboots or creates a VM',()=>{
 const begin=agent.indexOf('function Invoke-EkodiUser2HyperVFeature');
 const end=agent.indexOf('function Invoke-IsolatedDesktopBackendProbe',begin);
 const impl=agent.slice(begin,end);
 assert.ok(begin>=0 && end>begin);
 assert.match(impl,/Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart/);
 assert.doesNotMatch(impl,/Restart-Computer|New-VM|Start-VM|Stop-Computer/);
 assert.match(impl,/guestExecutionAuthorized = \$false/);
});
test('commands map to fixed USER2-only functions, not arbitrary shell',()=>{
 assert.match(agent,/'computer\.hyperv\.preflight' \{ return Invoke-EkodiUser2HyperVFeature -Enable \$false \}/);
 assert.match(agent,/'computer\.hyperv\.enable' \{ return Invoke-EkodiUser2HyperVFeature -Enable \$true \}/);
});