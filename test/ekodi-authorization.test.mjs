import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminAuthorityForRole,
  authorizeEkodiAction,
  capabilityMatches,
  hasEkodiCapability,
  scopeAllows,
} from '../ekodi-authorization.js';

test('capability wildcard matching is namespace bounded', () => {
  assert.equal(capabilityMatches('workspace:*', 'workspace:manage'), true);
  assert.equal(capabilityMatches('workspace:*', 'service:manage'), false);
  assert.equal(capabilityMatches('admin:accounts.read', 'admin:accounts.read'), true);
});

test('explicit deny wins over wildcard allow', () => {
  assert.equal(hasEkodiCapability(['admin:*'], 'admin:accounts.write', ['admin:accounts.write']), false);
  assert.equal(hasEkodiCapability(['admin:*'], 'admin:accounts.read', ['admin:accounts.write']), true);
});

test('super admin may read global access without privileged elevation', () => {
  const authority = adminAuthorityForRole('super_admin');
  const decision = authorizeEkodiAction({ authority, requiredCapabilities:['admin:accounts.read'] });
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'ALLOW');
});

test('sensitive account mutation requires temporary elevation', () => {
  const normal = adminAuthorityForRole('super_admin');
  const denied = authorizeEkodiAction({ authority:normal, requiredCapabilities:['admin:accounts.write'] });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, 'ELEVATION_REQUIRED');

  const elevated = adminAuthorityForRole('super_admin', { elevated:true, elevatedUntil:'2099-01-01T00:00:00.000Z' });
  const allowed = authorizeEkodiAction({ authority:elevated, requiredCapabilities:['admin:accounts.write'] });
  assert.equal(allowed.allowed, true);
});

test('operator cannot inherit platform administrator account capability', () => {
  const authority = adminAuthorityForRole('operator');
  const decision = authorizeEkodiAction({ authority, requiredCapabilities:['admin:accounts.read'] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'CAPABILITY_FORBIDDEN');
});

test('workspace authority is confined to its own workspace', () => {
  const authority = adminAuthorityForRole('operator', { scope:{ type:'workspace', id:'church' } });
  assert.equal(scopeAllows(authority.scope, { type:'workspace', id:'church' }), true);
  assert.equal(scopeAllows(authority.scope, { type:'workspace', id:'biz' }), false);
  const decision = authorizeEkodiAction({
    authority,
    requiredCapabilities:['workspace:manage'],
    resourceScope:{ type:'workspace', id:'biz' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'SCOPE_FORBIDDEN');
});

test('platform authority can enter workspace context without context becoming authority', () => {
  const authority = adminAuthorityForRole('super_admin');
  assert.equal(scopeAllows(authority.scope, { type:'workspace', id:'church' }), true);
  assert.equal(authority.scope.type, 'platform');
});

test('expired or timestamp-less elevation is fail-closed', () => {
  const expired = adminAuthorityForRole('super_admin', { elevated:true, elevatedUntil:'2000-01-01T00:00:00.000Z' });
  const missingExpiry = adminAuthorityForRole('super_admin', { elevated:true });
  for (const authority of [expired, missingExpiry]) {
    const decision = authorizeEkodiAction({ authority, requiredCapabilities:['admin:accounts.write'] });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'ELEVATION_REQUIRED');
  }
});
