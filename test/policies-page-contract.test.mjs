import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('Policies remains an internal operational capability, not a global work area', () => {
  const policies = ADMIN_MENU_REGISTRY.find(item => item.id === 'policies');
  assert.ok(policies);
  assert.equal(policies.internal, true);
  assert.match(layout, /INTERNAL(?:_ONLY)?/);
  assert.match(layout, /policies/);
});
