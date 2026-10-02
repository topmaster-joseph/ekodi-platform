import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUBLIC_USER_ACCESS_CONTRACT, publicUserAccessDecision, workspaceRouteFromPublicPath } from '../workspace-route-policy.js';

const json=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));

test('platform public access contract is inherited and non-overridable',()=>{
  const constitution=json('governance/constitution/constitution.json');
  const workspace=json('config/service-workspace-policy.json');
  const policy=constitution.publicUserSurfacePolicy;
  assert.equal(constitution.version,'1.27.1');
  assert.equal(policy.defaultAccess,'guest-open');
  assert.equal(policy.inheritanceScope,'all-current-and-future-user-facing-services-workspaces-and-independent-sites');
  assert.equal(policy.serviceLocalOverrideAllowed,false);
  assert.equal(policy.publicInteractionPolicy.id,'PUBLIC-INTERACTION-001');
  assert.equal(policy.publicInteractionPolicy.defaultForExplicitlyPublicActions,'guest-open');
  assert.equal(policy.publicInteractionPolicy.authenticationRequiredForExplicitlyPublicActions,false);
  assert.equal(workspace.publicUserSurfaceDefault.publicInteractionDefault.authenticationRequired,false);
  assert.equal(PUBLIC_USER_ACCESS_CONTRACT.serviceLocalOverrideAllowed,false);
});

test('canonical public workspace routes remain guest-open while admin stays protected',()=>{
  assert.equal(workspaceRouteFromPublicPath('/jadam')?.public,true);
  assert.equal(workspaceRouteFromPublicPath('/jadam/menu')?.public,true);
  assert.equal(workspaceRouteFromPublicPath('/jadam/admin')?.public,false);
  assert.equal(publicUserAccessDecision({surface:'public',actionClass:'read'}),'guest-open');
  assert.equal(publicUserAccessDecision({surface:'admin',actionClass:'read'}),'auth-required');
});

test('explicit safe public actions are guest-open without weakening protected writes',()=>{
  for(const action of PUBLIC_USER_ACCESS_CONTRACT.safePublicActionClasses){
    assert.equal(publicUserAccessDecision({surface:'public',actionClass:action,explicitlyPublic:true}),'guest-open',action);
    assert.equal(publicUserAccessDecision({surface:'public',actionClass:action,explicitlyPublic:false}),'auth-required',action);
  }
  for(const action of PUBLIC_USER_ACCESS_CONTRACT.protectedActionClasses){
    assert.equal(publicUserAccessDecision({surface:'public',actionClass:action,explicitlyPublic:true}),'auth-required',action);
  }
  assert.equal(publicUserAccessDecision({surface:'public',actionClass:'event-application',explicitlyPublic:true,explicitPrivate:true}),'auth-required');
});

test('public action guardrails forbid privilege and false-success behavior',()=>{
  const p=json('governance/constitution/constitution.json').publicUserSurfacePolicy.publicInteractionPolicy;
  assert.equal(p.privilegeGrantForbidden,true);
  assert.equal(p.crossWorkspacePrivateWriteForbidden,true);
  assert.equal(p.protectedDataDisclosureForbidden,true);
  assert.equal(p.serverPersistenceVerificationRequired,true);
  assert.equal(p.falseSuccessResponseForbidden,true);
  assert.equal(p.inputValidationRequired,true);
  assert.equal(p.abuseProtectionRequired,true);
  assert.equal(p.purposeBoundDataMinimizationRequired,true);
  assert.equal(p.consentRequiredWhenPersonalDataCollected,true);
});
