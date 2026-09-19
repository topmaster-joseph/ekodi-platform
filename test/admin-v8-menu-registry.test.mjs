import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupDefault,
} from '../admin-menu-registry.js';

test('v8 admin exposes seven canonical EKODI management domains', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), [
    'core', 'common', 'professional', 'status', 'manager', 'submanager', 'other',
  ]);
  assert.equal(ADMIN_MENU_GROUPS.length, 7);
  assert.equal(getAdminMenuGroupDefault('status'), 'health');
});

test('Core owns capability, AI and execution while Status owns observability', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['capabilities', 'aiops', 'devices']) {
    assert.equal(byId.get(id)?.group, 'core', `${id} must live in Core`);
    assert.notEqual(byId.get(id)?.internal, true, `${id} must remain directly accessible`);
  }
  for (const id of ['health', 'api-cost']) assert.equal(byId.get(id)?.group, 'status');
});

test('Execution Infrastructure is constitution-bound inside Core', () => {
  const execution = ADMIN_MENU_REGISTRY.find(item => item.id === 'devices');
  assert.equal(execution?.labels?.ko, '실행 인프라');
  assert.equal(execution?.governance?.track, 'agent');
  assert.equal(execution?.governance?.changeClass, 'yellow');
  assert.equal(execution?.governance?.authorityContext, 'Person + Workspace + Role + Capability');
  assert.equal(execution?.governance?.controlPlane, true);
  assert.equal(execution?.governance?.globalPolicyMutation, 'super_admin');
});

test('control-only operations remain internal instead of becoming top-level clutter', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['services', 'deployments', 'policies']) {
    assert.equal(byId.get(id)?.group, id === 'policies' ? 'other' : 'status');
    assert.equal(byId.get(id)?.internal, true);
  }
  assert.equal(byId.get('clients')?.group, 'manager');
  assert.equal(byId.get('common-services')?.group, 'common');
});
