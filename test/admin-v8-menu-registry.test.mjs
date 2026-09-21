import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupDefault,
} from '../admin-menu-registry.js';

test('v8 admin exposes the final seven EKODI management areas', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), [
    'summary', 'services', 'sites', 'people', 'content', 'status', 'settings-records',
  ]);
  assert.equal(ADMIN_MENU_GROUPS.length, 7);
  assert.equal(getAdminMenuGroupDefault('summary'), 'platform-overview');
  assert.equal(getAdminMenuGroupDefault('services'), 'engine-all');
  assert.equal(getAdminMenuGroupDefault('sites'), 'sites-all');
  assert.equal(getAdminMenuGroupDefault('people'), 'users-access');
  assert.equal(getAdminMenuGroupDefault('status'), 'health');
});

test('service and site aliases delegate to existing work surfaces without duplication', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['engine-all','engine-core','engine-common','engine-operations','engine-professional','engine-ai','engine-integration','engine-preview']) {
    assert.equal(byId.get(id)?.group, 'services');
    assert.equal(byId.get(id)?.delegateSection, 'common-services');
  }
  for (const id of ['sites-all','sites-internal','sites-user','sites-customer-partner','sites-independent','sites-preparing']) {
    assert.equal(byId.get(id)?.group, 'sites');
    assert.equal(byId.get(id)?.delegateSection, 'campus');
  }
});

test('User access delegates to the unified site member directory', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  assert.equal(byId.get('users-access')?.group, 'people');
  assert.equal(byId.get('users-access')?.delegateSection, 'clients');
  assert.equal(byId.get('clients')?.internal, true);
});

test('Status owns AI operations, execution infrastructure and observability surfaces', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['aiops', 'devices', 'health', 'api-cost', 'deployments']) {
    assert.equal(byId.get(id)?.group, 'status', `${id} must live in Status & Releases`);
    assert.notEqual(byId.get(id)?.internal, true, `${id} must remain directly accessible`);
  }
});

test('Execution Infrastructure keeps constitutional governance metadata', () => {
  const execution = ADMIN_MENU_REGISTRY.find(item => item.id === 'devices');
  assert.equal(execution?.labels?.ko, '실행 인프라');
  assert.equal(execution?.governance?.track, 'agent');
  assert.equal(execution?.governance?.changeClass, 'yellow');
  assert.equal(execution?.governance?.authorityContext, 'Person + Workspace + Role + Capability');
  assert.equal(execution?.governance?.controlPlane, true);
  assert.equal(execution?.governance?.globalPolicyMutation, 'super_admin');
});

test('backing implementation sections remain hidden while policies and deployments are explicit work areas', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['common-services','campus','clients','workspace','capabilities','openai','services']) {
    assert.equal(byId.get(id)?.internal, true, `${id} should be a backing implementation surface`);
  }
  assert.equal(byId.get('deployments')?.internal, undefined);
  assert.equal(byId.get('audit-records')?.delegateSection, 'aiops');
  assert.equal(byId.get('policies')?.internal, true);
  assert.equal(byId.get('community')?.group, 'content');
  assert.equal(byId.get('books')?.group, 'content');
});
