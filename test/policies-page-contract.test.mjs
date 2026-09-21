import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ADMIN_MENU_REGISTRY, adminMenuOrder } from '../admin-menu-registry.js';

const registrySource = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const aiOps = await readFile(new URL('../ai-ops-admin.js', import.meta.url), 'utf8');

test('Policies remains an internal compatibility route while audit records is human-facing', () => {
  const byId = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
  assert.equal(byId.get('policies')?.internal, true);
  assert.equal(adminMenuOrder().includes('policies'), false);
  assert.equal(byId.get('audit-records')?.group, 'settings-records');
  assert.equal(byId.get('audit-records')?.delegateSection, 'aiops');
  assert.equal(adminMenuOrder().includes('audit-records'), true);
  assert.match(registrySource, /id: 'audit-records'[\s\S]*delegateSection: 'aiops'/);
  assert.ok(layout.includes("const INTERNAL=new Set(['services','policies']);"));
  assert.match(aiOps, /section\.dataset\.panel = `\$\{SECTION\} audit-records`/);
});
