import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const script = await readFile(new URL('../admin-design-engine.js', import.meta.url), 'utf8');
const match = script.match(/const EXPECTED_GROUPS = Object\.freeze\(\[([^\]]+)\]\);/);
const engineGroups = [...(match?.[1] || '').matchAll(/'([^']+)'/g)].map(value => value[1]);

test('Design Engine runtime owns the same distinct work areas as the Admin menu registry', () => {
  assert.ok(match, 'runtime work-area guardrail must exist');
  const canonicalGroups = ADMIN_MENU_GROUPS.map(group => group.id);
  assert.deepEqual(engineGroups, canonicalGroups);
  assert.equal(new Set(engineGroups).size, engineGroups.length, 'work areas must never repeat');
  const ownerBySection = new Map(ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => [item.id,item.group]));
  assert.equal(ownerBySection.get('finance'), 'finance');
  assert.equal(ownerBySection.get('devices'), 'devices-agent');
  assert.equal(ownerBySection.get('deployments'), 'releases');
  assert.equal(ownerBySection.get('audit-records'), 'security-audit');
});

test('Design Engine checks navigation in the actual sidebar rather than unrelated buttons', () => {
  assert.match(script, /nav\.querySelectorAll\('\[data-admin-global-group\]'\)/);
  assert.match(script, /document\.documentElement\.dataset\.ekodiDesignAudit = detail\.ok \? 'pass' : 'fail'/);
  assert.match(script, /'ekodi-nav-changed'/);
  assert.match(script, /window\.addEventListener\(event, schedule\)/);
});
