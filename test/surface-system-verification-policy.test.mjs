import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy=JSON.parse(fs.readFileSync(new URL('../config/surface-system-verification-policy.json',import.meta.url),'utf8'));
const constitution=JSON.parse(fs.readFileSync(new URL('../governance/constitution/constitution.json',import.meta.url),'utf8'));

test('all governed surface classes inherit System Verified completion',()=>{
  assert.equal(policy.scope.inheritFutureSurfaces,true);
  assert.deepEqual(policy.states.completion,['SYSTEM_VERIFIED']);
  assert.equal(policy.execution.manualUserTestDefaultGate,false);
  assert.equal(constitution.surfaceSystemVerificationPolicy.completionRule,'system-verified-before-complete');
});

test('role, auth and device matrices cover public through super-admin paths',()=>{
  for(const actor of ['guest','authenticated-user','workspace-member','operator','workspace-or-service-admin','platform-super-admin']){
    assert.ok(policy.syntheticActors.some(item=>item.id===actor),actor);
  }
  for(const state of ['guest','valid-session','expired-session','invalid-session','insufficient-role','authorized-role']){
    assert.ok(policy.authStates.includes(state),state);
  }
  for(const device of ['mobile-portrait','mobile-landscape','tablet','desktop']){
    assert.ok(policy.deviceProfiles.some(item=>item.id===device),device);
  }
});

test('production verification remains non-destructive and real-host based',()=>{
  assert.equal(policy.execution.realProductionCanaryRequired,true);
  assert.equal(policy.productionSafety.destructiveMutationForbidden,true);
  assert.equal(policy.productionSafety.reversibleOrIdempotentWritesOnly,true);
});
