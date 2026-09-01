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
  assert.equal(getAdminMenuRoute('affiliates'), '#mall-ai-sales');
  assert.equal(getAdminMenuRoute('devotional'), '#devotional');
  assert.equal(getAdminMenuRoute('cheonggye-members'), '#cheonggye-members');
});

test('deep links survive reload and central login', () => {
  const layout = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  const handoff = fs.readFileSync(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');
  assert.match(layout, /#communication:communication/);
  assert.match(layout, /#life-ai:life-ai/);
  assert.match(layout, /#mall-ai-sales:affiliates/);
  assert.match(layout, /communication:#communication/);
  assert.match(layout, /life-ai:#life-ai/);
  assert.match(layout, /affiliates:#mall-ai-sales/);
  assert.match(handoff, /work communication life-ai/);
  assert.match(handoff, /devotional/);
  assert.match(handoff, /mall-ai-sales/);
  assert.match(handoff, /cheonggye-members/);
  assert.match(handoff, /return_to/);
});

test('menu runtime promotes controls to canonical links', () => {
  const runtime = fs.readFileSync(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /getAdminMenuGroupRoute/);
  assert.match(runtime, /getAdminMenuRoute/);
  assert.match(runtime, /data-admin-global-group/);
  assert.match(runtime, /data-admin-context-section/);
  assert.match(runtime, /adminCanonicalHref/);
  assert.doesNotMatch(runtime, /MutationObserver/);
});

test('pre-rendered external admin handoff links are bound and bypass internal routing', () => {
  const runtime = fs.readFileSync(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');
  const sidebar = fs.readFileSync(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
  const layout = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(sidebar, /definition\.href \? document\.createElement\('a'\) : document\.createElement\('button'\)/);
  assert.match(runtime, /function bindAdminHandoff\(link, definition\)/);
  assert.match(runtime, /let link = nav\.querySelector\('\.nav\[data-section="'\+id\+'"\]'/);
  assert.match(runtime, /if \(definition\.adminHandoff === true\) bindAdminHandoff\(link, definition\)/);
  assert.doesNotMatch(runtime, /!definition\?\.href \|\| nav\.querySelector/);
  assert.match(layout, /if\(getAdminMenuItem\(section\)\?\.href\)return/);
});
