import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const model = JSON.parse(fs.readFileSync(new URL('../config/agentic-control-model.json', import.meta.url), 'utf8'));
const registry = JSON.parse(fs.readFileSync(new URL('../config/agentic-actions.json', import.meta.url), 'utf8'));
const menuSource = fs.readFileSync(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('agentic control model keeps five stable admin axes', () => {
  assert.deepEqual(model.adminAxes.map(axis => axis.id), ['home', 'operations', 'spaces', 'services', 'system']);
  assert.deepEqual(model.objects, ['resource', 'action', 'policy', 'operation', 'evidence']);
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
});
