import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTH_PERMISSIONS, hasPermission, MAX_ADMIN_PASSWORD_LENGTH, MIN_ADMIN_PASSWORD_LENGTH, readBearerToken, SESSION_DURATION_MS, validateAdminPassword } from '../src/index.ts';

test('auth policy exposes stable security defaults', () => {
  assert.equal(MIN_ADMIN_PASSWORD_LENGTH, 12);
  assert.equal(MAX_ADMIN_PASSWORD_LENGTH, 256);
  assert.equal(SESSION_DURATION_MS, 28_800_000);
});

test('bearer parsing rejects missing and empty credentials', () => {
  assert.equal(readBearerToken(new Headers()), null);
  assert.equal(readBearerToken(new Headers({ authorization: 'Basic abc' })), null);
  assert.equal(readBearerToken(new Headers({ authorization: 'Bearer  ' })), null);
  assert.equal(readBearerToken(new Headers({ authorization: 'Bearer token-value' })), 'token-value');
});

test('password validation enforces the shared minimum', () => {
  assert.match(validateAdminPassword('too-short').error, /12/);
  assert.match(validateAdminPassword('x'.repeat(257)).error, /256/);
  assert.equal(validateAdminPassword('long-enough-password').value, 'long-enough-password');
});

test('role permissions separate content, operations, and read-only access', () => {
  assert.equal(hasPermission('super_admin', AUTH_PERMISSIONS.DNS_WRITE), true);
  assert.equal(hasPermission('content_admin', AUTH_PERMISSIONS.CMS_PUBLISH), true);
  assert.equal(hasPermission('content_admin', AUTH_PERMISSIONS.DNS_READ), false);
  assert.equal(hasPermission('viewer', AUTH_PERMISSIONS.CMS_READ), true);
  assert.equal(hasPermission('viewer', AUTH_PERMISSIONS.CMS_WRITE), false);
  assert.equal(hasPermission('unknown', AUTH_PERMISSIONS.AUDIT_READ), false);
});
