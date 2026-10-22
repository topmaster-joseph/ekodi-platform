import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planNativeFleetExecution} from '../scripts/plan-native-fleet-execution.mjs';

const now=Date.parse('2026-10-12T06:00:00Z');
const ts=new Date(now-20_000).toISOString();
const ai={
  targetAlias:'user3',registered:true,heartbeatHealthy:true,
  verificationState:'NATIVE_AGENT_HEARTBEAT_OBSERVED',
  observedAt:ts,capabilities:{localAiVerify:true},
  proofs:{localAi:{status:'succeeded',verified:true,fresh:true,completedAt:ts}}
};
const browser={
  targetAlias:'user4',registered:true,heartbeatHealthy:true,
  verificationState:'NATIVE_AGENT_HEARTBEAT_OBSERVED',
  observedAt:ts,capabilities:{backgroundBrowser:true,backgroundBrowserCanary:true},
  proofs:{browser:{status:'succeeded',verified:true,fresh:true,completedAt:ts}}
};
test('plan splits verified native AI and isolated browser between distinct enrolled PCs',()=>{
  const plan=planNativeFleetExecution({user3:ai,user4:browser,now});
  assert.equal(plan.lanes.localAI.owner,'user3');
  assert.equal(plan.lanes.localAI.eligible,true);
  assert.equal(plan.lanes.browser.owner,'user4');
  assert.equal(plan.lanes.browser.eligible,true);
  assert.equal(plan.lanes.browser.selectedProvider,'ekodi-background-browser-worker');
  assert.equal(plan.isolatedDesktopExecutionReady,false);
  assert.equal(plan.remoteCommandsIssued,false);
  assert.equal(plan.authorityGranted,false);
  assert.equal(plan.cloudAccountPairingVerified,false);
  assert.equal(plan.nextAction,'submit-narrowly-authorized-per-device-jobs-to-existing-command-plane');
});
test('USER3 cannot use USER4 proof and USER4 cannot use USER3 AI receipt',()=>{
  const plan=planNativeFleetExecution({user3:{...ai,targetAlias:'user4'},user4:{...browser,targetAlias:'user3'},now});
  assert.equal(plan.lanes.localAI.eligible,false);
  assert.equal(plan.lanes.browser.eligible,false);
  assert.equal(plan.nextAction,'renew-approved-user3-localai-receipt');
});
test('stale heartbeat or stale proof fails closed independently per lane',()=>{
  const stale=new Date(now-24*60*60*1000-1).toISOString();
  const a=planNativeFleetExecution({user3:{...ai,proofs:{localAi:{...ai.proofs.localAi,completedAt:stale}}},user4:browser,now});
  assert.equal(a.lanes.localAI.eligible,false);
  assert.equal(a.lanes.browser.eligible,true);
  const b=planNativeFleetExecution({user3:ai,user4:{...browser,observedAt:new Date(now-301000).toISOString()},now});
  assert.equal(b.lanes.localAI.eligible,true);
  assert.equal(b.lanes.browser.eligible,false);
});
test('boolean flags without signed job receipts never enable native fleet execution',()=>{
  const a=planNativeFleetExecution({user3:{...ai,proofs:{}},user4:{...browser,proofs:{}},now});
  assert.equal(a.lanes.localAI.eligible,false);
  assert.equal(a.lanes.browser.eligible,false);
  assert.equal(a.isolatedDesktopExecutionReady,false);
});
test('fleet observability is append-only and cannot invoke device command API',()=>{
  const source=readFileSync(new URL('../scripts/plan-native-fleet-execution.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\/api\/control\/devices\//);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/\bPOST\b/);
  assert.match(source,/artifacts/);
});
