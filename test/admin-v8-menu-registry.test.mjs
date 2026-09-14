import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupDefault,
} from '../admin-menu-registry.js';

test('v8 admin exposes the five canonical EKODI management axes', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), [
    'home', 'operations', 'workspaces', 'services', 'system',
  ]);
  assert.equal(ADMIN_MENU_GROUPS.length, 5);
  assert.equal(getAdminMenuGroupDefault('system'), 'health');
});

test('System owns capability, AI, nodes and observability surfaces', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['capabilities', 'aiops', 'devices', 'health', 'api-cost']) {
    assert.equal(byId.get(id)?.group, 'system', `${id} must live in System`);
    assert.notEqual(byId.get(id)?.internal, true, `${id} must remain directly accessible`);
  }
});

test('Execution Infrastructure is constitution-bound inside System', () => {
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
    assert.equal(byId.get(id)?.group, 'system');
    assert.equal(byId.get(id)?.internal, true);
  }
  assert.equal(byId.get('clients')?.group, 'workspaces');
  assert.equal(byId.get('common-services')?.group, 'services');
});
