import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ADMIN_MENU_GROUPS,
  ADMIN_MENU_REGISTRY,
  getAdminMenuGroupRoute,
  getAdminMenuRoute,
} from '../admin-menu-registry.js';

const expectedGroupRoutes = Object.freeze({
  home: '#campus',
  operations: '#work',
  people: '#workspace',
  services: '#life-ai',
  ai: '#ai-ops',
  business: '#finance',
  data: '#storage',
  system: '#health',
});

test('all eight global admin work areas have stable canonical links', () => {
  assert.equal(ADMIN_MENU_GROUPS.length, 8);
  assert.deepEqual(
    Object.fromEntries(ADMIN_MENU_GROUPS.map(group => [group.id, getAdminMenuGroupRoute(group.id)])),
    expectedGroupRoutes,
  );
});

test('every visible contextual admin section has a route or explicit service handoff', () => {
  for (const item of ADMIN_MENU_REGISTRY.filter(item => !item.internal)) {
    const route = getAdminMenuRoute(item.id);
    assert.ok(route, `missing route: ${item.id}`);
    assert.ok(route.startsWith('#') || route.startsWith('https://'), `invalid route: ${item.id} -> ${route}`);
  }
  assert.equal(getAdminMenuRoute('tax'), 'https://tax.ekodi.kr/');
});

test('communication and life-ai hashes survive reload and deep linking', () => {
  const source = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(source, /#communication:communication/);
  assert.match(source, /#life-ai:life-ai/);
  assert.match(source, /communication:#communication/);
  assert.match(source, /life-ai:#life-ai/);
});

test('authenticated admin shell installs the canonical link enhancement', () => {
  const shell = fs.readFileSync(new URL('../admin-authenticated-shell.js', import.meta.url), 'utf8');
  const links = fs.readFileSync(new URL('../admin-menu-links.js', import.meta.url), 'utf8');
  assert.match(shell, /admin-menu-links\.js/);
  assert.match(links, /data-admin-global-group/);
  assert.match(links, /data-admin-context-section/);
  assert.match(links, /adminCanonicalHref/);
});
