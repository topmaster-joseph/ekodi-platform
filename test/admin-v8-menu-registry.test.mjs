import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupDefault,
} from '../admin-menu-registry.js';

test('v3 admin exposes eight distinct platform-only management areas', () => {
  assert.deepEqual(ADMIN_MENU_GROUPS.map(group => group.id), ['home', 'sites', 'ai', 'services', 'finance', 'ops', 'settings', 'accounts']);
  assert.equal(ADMIN_MENU_GROUPS.length, 8);
  assert.equal(getAdminMenuGroupDefault('home'), 'platform-overview');
  assert.equal(getAdminMenuGroupDefault('services'), 'engine-all');
  assert.equal(getAdminMenuGroupDefault('sites'), 'sites-all');
  assert.equal(getAdminMenuGroupDefault('accounts'), 'users-access');
  assert.equal(getAdminMenuGroupDefault('ops'), 'health');
  assert.equal(getAdminMenuGroupDefault('ai'), 'aiops');
});

test('service and site aliases delegate to existing work surfaces without duplication', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  for (const id of ['engine-all','engine-core','engine-common','engine-operations','engine-professional','engine-ai','engine-integration','engine-preview']) {
    assert.equal(byId.get(id)?.group, 'services');
    assert.equal(byId.get(id)?.delegateSection, 'common-services');
  }
  for (const id of ['sites-all','sites-core','sites-business','sites-community','sites-clients','sites-knowledge','sites-communication','sites-worklife','sites-other','sites-preparing']) {
    assert.equal(byId.get(id)?.group, 'sites');
    assert.equal(byId.get(id)?.delegateSection, 'campus');
  }
  // v3 merges the site category routes into the registry list; they stay routable but hidden.
  for (const id of ['sites-core','sites-business','sites-community','sites-clients','sites-knowledge','sites-communication','sites-worklife','sites-other']) {
    assert.equal(byId.get(id)?.internal, true, `${id} should be a hidden filter route`);
  }
  assert.notEqual(byId.get('sites-all')?.internal, true);
  assert.notEqual(byId.get('sites-preparing')?.internal, true);
  for (const id of ['sites-internal','sites-user','sites-customer-partner','sites-independent']) {
    assert.equal(byId.get(id)?.internal, true);
    assert.equal(byId.get(id)?.delegateSection, 'campus');
  }
});

test('User access delegates to the unified site member directory', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  assert.equal(byId.get('users-access')?.group, 'accounts');
  assert.equal(byId.get('users-access')?.delegateSection, 'clients');
  assert.equal(byId.get('clients')?.internal, true);
});

test('Operations, devices, finance and releases have one distinct primary owner', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  const ownership = { health:'ops','site-health':'ops',deployments:'ops',aiops:'ai',devices:'ops','pos-agent':'ops','api-cost':'finance',finance:'finance',security:'accounts','audit-records':'accounts' };
  for (const [id,group] of Object.entries(ownership)) {
    assert.equal(byId.get(id)?.group, group, id);
    assert.notEqual(byId.get(id)?.internal, true, id);
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
  assert.equal(byId.get('community')?.group, 'sites');
  assert.equal(byId.get('books')?.group, 'sites');
});
