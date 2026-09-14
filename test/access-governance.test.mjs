import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_DEVELOPER_ALLOWED,
  EXTERNAL_DEVELOPER_DENIED,
  accessGrantCan,
  accessGrantExpired,
  accessGrantIsActive,
  effectiveAccessCapabilities,
  validateAccessGrantInput,
  canTenantActorAssignRole,
} from '../access-governance.js';

const NOW=new Date('2026-09-15T00:00:00.000Z');

test('external developer receives only the fixed safe preset',()=>{
  const result=validateAccessGrantInput({role:'external_developer',githubUsername:'safe-dev',expiresAt:'2026-10-15T00:00:00.000Z'},{now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.principalType,'external_collaborator');
  assert.deepEqual(result.allowed,[...EXTERNAL_DEVELOPER_ALLOWED]);
  assert.deepEqual(result.denied,[...EXTERNAL_DEVELOPER_DENIED]);
});

test('external developer requires GitHub identity and expiry',()=>{
  assert.equal(validateAccessGrantInput({role:'external_developer',expiresAt:'2026-10-15T00:00:00.000Z'},{now:NOW}).error,'GITHUB_USERNAME_REQUIRED');
  assert.equal(validateAccessGrantInput({role:'external_developer',githubUsername:'safe-dev'},{now:NOW}).error,'EXPIRY_REQUIRED');
});

test('external developer access is capped at 180 days',()=>{
  const result=validateAccessGrantInput({role:'external_developer',githubUsername:'safe-dev',expiresAt:'2027-09-15T00:00:00.000Z'},{now:NOW});
  assert.equal(result.ok,false);
  assert.equal(result.error,'EXPIRY_TOO_LONG');
});

test('deny always overrides allowed capability',()=>{
  const grant={role:'external_developer',enabled:1,expiresAt:'2026-10-15T00:00:00.000Z',capabilities:['tenant.production.deploy'],deniedCapabilities:[]};
  assert.equal(accessGrantCan(grant,'tenant.dashboard.read',NOW),true);
  assert.equal(accessGrantCan(grant,'tenant.production.deploy',NOW),false);
  assert.equal(effectiveAccessCapabilities(grant).includes('tenant.production.deploy'),false);
});

test('expired or disabled grant is inactive',()=>{
  const expired={role:'external_developer',enabled:1,expiresAt:'2026-09-14T23:59:59.000Z'};
  assert.equal(accessGrantExpired(expired,NOW),true);
  assert.equal(accessGrantIsActive(expired,NOW),false);
  assert.equal(accessGrantIsActive({...expired,enabled:0,expiresAt:'2026-10-15T00:00:00.000Z'},NOW),false);
});

test('tenant role assignment cannot escalate to platform authority',()=>{
  assert.equal(canTenantActorAssignRole('tenant_admin','external_developer'),true);
  assert.equal(canTenantActorAssignRole('tenant_admin','viewer'),true);
  assert.equal(canTenantActorAssignRole('tenant_admin','super_admin'),false);
  assert.equal(canTenantActorAssignRole('manager','external_developer'),false);
});
