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
});

test('communication and life-ai hashes survive reload and deep linking', () => {
  const source = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(source, /#communication:communication/);
  assert.match(source, /#life-ai:life-ai/);
  assert.match(source, /const CANON=pairMap\('[^']*aiops:#ai-ops[^']*'\)/);
  assert.match(source, /const CANON=pairMap\('[^']*affiliates:#mall-ai-sales[^']*'\)/);
  assert.match(source, /CANON\.get\(section\)\|\|'#'\+section/);
});

test('central login preserves contextual deep links', () => {
  const handoff = fs.readFileSync(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');
  assert.match(handoff, /work communication life-ai marketing-ai/);
  assert.match(handoff, /return_to/);
  assert.match(handoff, /centralAdminAuthUrl/);
});

test('event-driven menu runtime promotes global and contextual controls to canonical links', () => {
  const runtime = fs.readFileSync(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');
  const layout = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(runtime, /getAdminMenuGroupRoute/);
  assert.match(runtime, /getAdminMenuRoute/);
  assert.match(runtime, /data-admin-global-group/);
  assert.match(runtime, /data-admin-context-section/);
  assert.match(runtime, /adminCanonicalHref/);
  assert.match(layout, /ekodi-admin-section-changed/);
  assert.doesNotMatch(runtime, /MutationObserver/);
});
