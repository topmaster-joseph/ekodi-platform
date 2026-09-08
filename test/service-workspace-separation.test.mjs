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

test('ordinary user surfaces are public while private/admin state stays protected', () => {
  const byId = Object.fromEntries(policy.visibilityPolicies.map(item => [item.id, item]));
  assert.equal(byId.public_default.guestVisible, true);
  assert.equal(byId.public_default.immutableForUserSurface, true);
  assert.equal(byId.authenticated_personal_state.guestVisible, false);
  assert.equal(byId.authenticated_personal_state.reason, 'private_personal_data');
  assert.equal(byId.administrator_only.guestVisible, false);
  assert.equal(policy.membershipBenefitAdministration.publicAccessImmutable, true);
});
