import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agent=await readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url),'utf8');
const worker=await readFile(new URL('../tools/ekodi-device-agent/windows/ekodi-native-browser-cdp.mjs', import.meta.url),'utf8');

test('Windows Device Agent invokes pinned EKODI-owned CDP worker, rather than legacy DOM dump',()=>{
  assert.match(agent,/function Invoke-EkodiNativeCdpCanary/);
  assert.match(agent,/return Invoke-EkodiNativeCdpCanary/);
  assert.match(agent,/raw\.githubusercontent\.com\/topmaster-joseph\/ekodi-platform\/[a-f0-9]{40}\/tools\/ekodi-device-agent\/windows\/ekodi-native-browser-cdp\.mjs/);
  assert.match(agent,/CDP_NODE_22_REQUIRED/);
  assert.match(agent,/CDP_WORKER_EVIDENCE_INVALID/);
  assert.match(agent,/Set-Content -LiteralPath \$BrowserCanaryStatePath/);
  assert.match(agent,/\$receipt\.domBytes -le 0/);
});
test('CDP worker supplies DOM proof and never returns success from process exit alone',()=>{
  assert.match(worker,/Target\.createTarget/);
  assert.match(worker,/Target\.attachToTarget/);
  assert.match(worker,/Runtime\.evaluate/);
  assert.match(worker,/location\.href ===/);
  assert.match(worker,/CDP_DOM_EVIDENCE_MISSING/);
  assert.match(worker,/mkdtemp/);
  assert.match(worker,/rm\(profile,\{recursive:true,force:true/);
  assert.match(worker,/windowsHide:true,stdio:\['ignore','ignore','pipe'\]/);
});

test('Agent pins the reviewed early-exit fallback worker, not a stale CDP binary',()=>{
  const reviewedCommit='f6200d33031d7bfc42c8284e2ffa156cb51859da';
  assert.match(agent,new RegExp('raw\\.githubusercontent\\.com/topmaster-joseph/ekodi-platform/'+reviewedCommit+'/tools/ekodi-device-agent/windows/ekodi-native-browser-cdp\\.mjs'));
  assert.match(worker,/headlessMode:'legacy'/);
  assert.match(worker,/CDP_BROWSER_EARLY_EXIT_ZERO/);
  assert.match(worker,/installedCanaryBrowsers/);
  assert.match(agent,/CDP_WORKER_EVIDENCE_INVALID/);
});
