import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowsNativeFamilySidecar} from '../tools/ekodi-device-agent/windows/ai-family-windows-sidecar.mjs';
const command={
  id:'hyb_12345678-1234-4234-8234-123456789abc',
  type:'ai.family.codex',
  issuedAt:'2026-11-07T00:00:00Z',claimedAt:'2026-11-07T00:00:01Z',
  leaseExpiresAt:'2026-11-07T00:05:00Z',attempt:1,
  payload:{lane:'node:codex',prompt:'Read only',costKrw:0,requestKey:'a'.repeat(64),timeoutMs:180000},
};
test('composition has no autostart and fails closed without a trusted user consent broker',async()=>{
  const runner=createWindowsNativeFamilySidecar({
    preflightOptions:{platform:'win32'},
    runnerOptions:{platform:'win32',now:()=>Date.parse('2026-11-07T00:00:02Z')},
  });
  assert.equal(runner.activeCount(),0);
  assert.equal((await runner.run(command,{deviceId:'d'})).code,'TRUSTED_BROKER_NOT_CONNECTED');
});
test('composition rejects non-Windows OS, even with broker callback objects present',async()=>{
  const runner=createWindowsNativeFamilySidecar({
    preflightOptions:{platform:'linux'},runnerOptions:{platform:'linux'},
    broker:{getSignedConsent:async()=>({}),verifySignedConsent:async()=>true},
    leaseClient:{renewLease:async()=>({ok:true})},
  });
  assert.equal((await runner.run(command,{deviceId:'d'})).code,'WINDOWS_USER_MODE_REQUIRED');
});
