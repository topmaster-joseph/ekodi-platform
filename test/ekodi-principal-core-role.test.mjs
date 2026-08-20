import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_ROLES,
  buildPrincipal,
  canonicalCoreRole,
  principalCapabilities,
} from '../ekodi-principal.js';

test('EKODI Core exposes a stable canonical role catalog', () => {
  assert.deepEqual(CORE_ROLES, ['owner','admin','manager','marketer','accountant','staff','member','viewer']);
});

test('legacy customer roles map to stable Core roles without losing source roles', () => {
  assert.equal(canonicalCoreRole('store_owner'), 'owner');
  assert.equal(canonicalCoreRole('client_admin'), 'owner');
  assert.equal(canonicalCoreRole('client_editor'), 'marketer');
  assert.equal(canonicalCoreRole('marketing_manager'), 'marketer');
  assert.equal(canonicalCoreRole('accounting_manager'), 'accountant');
  assert.equal(canonicalCoreRole('client_viewer'), 'viewer');

  const principal = buildPrincipal({
    id: 'customer:42',
    email: 'owner@example.com',
    role: 'store_owner',
    subjectType: 'tenant',
    subjectKey: 'cgma',
  });
  assert.equal(principal.role, 'store_owner');
  assert.equal(principal.coreRole, 'owner');
  assert.equal(principal.subject.type, 'tenant');
  assert.equal(principal.subject.key, 'cgma');
});

test('canonical roles preserve existing conversation capability behavior', () => {
  assert.ok(principalCapabilities('client_editor').includes('conversation:write'));
  assert.ok(principalCapabilities('marketer').includes('conversation:write'));
  assert.ok(principalCapabilities('admin', 'admin').includes('conversation:operate'));
  assert.ok(!principalCapabilities('viewer').includes('conversation:write'));
});
