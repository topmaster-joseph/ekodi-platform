import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ADMIN_MENU_REGISTRY, adminMenuGroups } from '../admin-menu-registry.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const model = JSON.parse(read('config/agentic-control-model.json'));
const registry = JSON.parse(read('config/agentic-actions.json'));
const menuSource = read('admin-menu-registry.js');

test('agentic control model keeps five stable admin axes', () => {
  const expected = ['home', 'operations', 'spaces', 'services', 'system'];
  assert.deepEqual(model.adminAxes.map(axis => axis.id), expected);
  assert.deepEqual(adminMenuGroups(), expected);
  assert.deepEqual(model.objects, ['resource', 'action', 'policy', 'operation', 'evidence']);
  for (const item of ADMIN_MENU_REGISTRY.filter(item => !item.internal)) assert.ok(expected.includes(item.group), `${item.id} must belong to a stable global axis`);
});

test('every action is machine-governable', () => {
  const ids = new Set();
  for (const action of registry.actions) {
    assert.ok(action.id && !ids.has(action.id), `action id must be unique: ${action.id}`);
    ids.add(action.id);
    for (const key of model.actionContract.required) assert.ok(action[key] !== undefined, `${action.id} missing ${key}`);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(action.risk), `${action.id} invalid risk`);
    assert.ok(model.autonomy[action.autonomy], `${action.id} invalid autonomy`);
    assert.ok(Array.isArray(action.evidence) && action.evidence.length > 0, `${action.id} requires evidence`);
    if (['high', 'critical'].includes(action.risk)) assert.notEqual(action.approval, 'none', `${action.id} requires approval`);
    if (action.risk === 'critical') assert.equal(action.autonomy, 'A3', `${action.id} critical action must be A3`);
  }
});

test('global admin menu no longer exposes tenant-specific Cheonggye module', () => {
  const row = menuSource.split('\n').find(line => line.includes("id: 'cheonggye-members'"));
  assert.ok(row, 'Cheonggye legacy entry should remain discoverable for migration');
  assert.match(row, /internal:\s*true/, 'tenant-specific legacy entry must be hidden from global navigation');
  assert.doesNotMatch(read('admin-authenticated-shell.js'), /cheonggye-members-admin/);
  assert.doesNotMatch(read('admin-menu-layout.js'), /cheonggye-members/);
});

test('agentic control assets are deferred and served only through the protected admin asset route', () => {
  const shell = read('admin-authenticated-shell.js');
  const bootstrap = read('agentic-bootstrap.js');
  const worker = read('site-worker.js');
  const build = read('scripts/build.mjs');
  assert.match(shell, /deferredPostAuthScripts[\s\S]*agentic-bootstrap\.js/);
  assert.doesNotMatch(shell.match(/criticalPostAuthScripts\s*=\s*\[([\s\S]*?)\];/)?.[1] || '', /agentic/);
  assert.match(bootstrap, /import\('\.\/agentic-control-runtime\.js'\)/);
  assert.match(bootstrap, /import\('\.\/agentic-admin-shell\.js'\)/);
  for (const asset of ['/agentic-bootstrap.js','/agentic-control-runtime.js','/agentic-admin-shell.js','/config/agentic-control-model.json','/config/agentic-actions.json']) assert.match(worker, new RegExp(asset.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  for (const asset of ['agentic-bootstrap.js','agentic-control-runtime.js','agentic-admin-shell.js']) assert.match(build, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  assert.match(worker, /ADMIN_ASSETS\.has\(url\.pathname\)[\s\S]*admin-asset/);
});