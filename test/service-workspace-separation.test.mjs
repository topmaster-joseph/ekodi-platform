import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiSource = await readFile(new URL('../api-worker.js', import.meta.url), 'utf8');
const policy = JSON.parse(await readFile(new URL('../config/service-workspace-policy.json', import.meta.url), 'utf8'));

const customerServiceIds = ['client-cgma', 'client-jadam', 'client-pizzamaru', 'client-yogurt'];

test('customer workspaces are not provider services', () => {
  for (const id of customerServiceIds) assert.equal(apiSource.includes(`id: '${id}'`), false, `${id} must not be in SERVICE_CATALOG`);
  assert.equal(apiSource.includes("group: 'client'"), false, 'client group must not exist in provider SERVICE_CATALOG');
  assert.equal(policy.customerWorkspaceRule.mustNotAppearInProviderServiceRegistry, true);
  assert.equal(policy.customerWorkspaceRule.managedBy, 'customer_tenant_directory');
});

test('user-facing service kinds remain deliberately small', () => {
  assert.deepEqual(policy.userServiceKinds.map(item => item.id), ['shared_user_service', 'dedicated_user_service']);
});

test('visibility policy protects existing members unless explicitly forced off', () => {
  const byId = Object.fromEntries(policy.visibilityPolicies.map(item => [item.id, item]));
  assert.equal(byId.guest_visible.guestVisible, true);
  assert.equal(byId.guest_visible.existingMemberAccess, true);
  assert.equal(byId.guest_hidden.guestVisible, false);
  assert.equal(byId.guest_hidden.existingMemberAccess, true);
  assert.equal(byId.guest_hidden.mayReplaceCanonicalPublicRoot, false);
  assert.equal(byId.guest_hidden.scope, 'discovery-or-explicit-private-content-only');
  assert.equal(byId.member_forced_off.guestVisible, false);
  assert.equal(byId.member_forced_off.existingMemberAccess, false);
  assert.equal(byId.member_forced_off.mayReplaceCanonicalPublicRoot, false);
});


test('canonical public user pages are guest-open and login only enhances capabilities', () => {
  const rule = policy.publicUserSurfaceDefault;
  assert.equal(policy.schemaVersion, 6);
  assert.equal(rule.policyId, 'PUBLIC-USER-SURFACE-001');
  assert.equal(rule.defaultAccess, 'guest-open');
  assert.equal(rule.safePublicProjectionRequired, true);
  assert.equal(rule.loginEffect, 'enhance-not-replace');
  assert.equal(rule.canonicalPublicRootLoginWallForbidden, true);
  assert.equal(rule.permissionFailureBehavior, 'retain-safe-public-projection');
  assert.equal(rule.explicitPrivateException.requiresExplicitClassification, true);
  assert.equal(rule.explicitPrivateException.permissionErrorAsLandingForbidden, true);
});
