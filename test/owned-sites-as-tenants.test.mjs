import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrincipal, principalCapabilities } from '../ekodi-principal.js';
import { activityRoleFor, operatingModelForService, siteActivityContext } from '../ekodi-site-policy.js';
import { serviceForId } from '../ekodi-service-manifest.js';

test('tenant-local admin never receives platform operating capabilities', () => {
  const capabilities = principalCapabilities('admin', 'user');
  assert.equal(capabilities.includes('conversation:write'), true);
  assert.equal(capabilities.includes('conversation:operate'), false);
  assert.equal(capabilities.includes('conversation:channel-link'), false);
});

test('platform admin keeps explicit platform authority', () => {
  const principal = buildPrincipal({
    id: 'admin:test',
    kind: 'admin',
    role: 'super_admin',
    subjectType: 'person',
  });
  assert.equal(principal.authorityScope, 'platform');
  assert.equal(principal.capabilities.includes('conversation:operate'), true);
});

test('tenant principal stays in tenant authority scope even when role is admin', () => {
  const principal = buildPrincipal({
    id: 'person:test',
    kind: 'user',
    role: 'admin',
    subjectType: 'tenant',
    subjectKey: 'ekodi-church',
    activityRole: 'pastor',
    activityRoleLabel: '목사',
  });
  assert.equal(principal.authorityScope, 'tenant');
  assert.equal(principal.activityRole, 'pastor');
  assert.equal(principal.activityRoleLabel, '목사');
  assert.equal(principal.capabilities.includes('conversation:operate'), false);
});

test('EKODI-owned operating organizations are customer sites', () => {
  for (const id of ['church', 'biz', 'lab', 'trade', 'cafe']) {
    assert.equal(operatingModelForService(id), 'customer-site');
    assert.equal(serviceForId(id)?.operatingModel, 'customer-site');
    assert.ok(serviceForId(id)?.tenantSlug?.startsWith('ekodi-'));
  }
});

test('shared professional services remain shared services', () => {
  for (const id of ['marketing', 'books', 'messenger', 'pay', 'edu']) {
    assert.equal(operatingModelForService(id), 'shared-service');
  }
  assert.equal(operatingModelForService('my'), 'platform-core');
});

test('local activity role labels are separated from authorization roles', () => {
  assert.deepEqual(activityRoleFor('church', 'client_admin'), {
    role: 'pastor', label: '목사', authorizationRole: 'client_admin',
  });
  assert.deepEqual(activityRoleFor('biz', 'tenant_admin'), {
    role: 'representative', label: '대표', authorizationRole: 'tenant_admin',
  });
  assert.deepEqual(activityRoleFor('lab', 'owner'), {
    role: 'director', label: '연구소장', authorizationRole: 'owner',
  });
});

test('platform admin status is informational inside a tenant activity context', () => {
  const context = siteActivityContext({ serviceId: 'church', authorizationRole: 'owner', platformAdmin: true });
  assert.equal(context.authorityScope, 'tenant');
  assert.equal(context.platformAdmin, true);
  assert.equal(context.platformAdminActive, false);
  assert.equal(context.activityRole, 'pastor');
});
