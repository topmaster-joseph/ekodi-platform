import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('internal operations stay available to the control plane but disappear from primary navigation', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS = new Set\(\['services', 'deployments', 'policies'\]\)/);
  for (const route of ['#operations:overview', '#services:services', '#deployments:deployments', '#policies:policies']) assert.match(layout, new RegExp(route));
  assert.match(layout, /INTERNAL_ONLY_HREFS/);
  assert.match(layout, /\/legacy#domains/);
  assert.match(layout, /\/legacy#activity/);
  assert.match(layout, /item\.hidden = true/);
  assert.match(layout, /data\.aiInternal|dataset\.aiInternal/);
});

test('retired Operations and Services explicitly route to demand-loaded AI Ops without auto-opening it on normal login', () => {
  assert.match(layout, /function routeInternalToAiOps/);
  assert.match(layout, /openDemand\('aiops'\)/);
  assert.match(layout, /#ai-ops/);
  assert.match(layout, /#operations:overview/);
  assert.match(layout, /#services:services/);
  assert.match(layout, /let requestedSection = ''/);
  assert.match(layout, /const initialHash = explicitHashSection\(\)/);
  assert.match(layout, /else if \(initialHash\) requestedSection = initialHash/);
  assert.doesNotMatch(layout, /preferAiOpsOnReady/);
  assert.doesNotMatch(layout, /setInterval\(/);
});

test('Devices participates in the central panel router even though its menu is installed dynamically', () => {
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /return 'devices'/);
  assert.match(layout, /\.nav\[data-device-control-nav\]/);
});

test('Campus shortcuts cannot reopen hidden operational panels', () => {
  assert.match(layout, /\[data-campus-section\]/);
  assert.match(layout, /isInternalSection\(control\.dataset\.campusSection\)/);
  assert.match(layout, /routeInternalToAiOps\(\)/);
  assert.match(layout, /openDemand\('aiops'\)/);
});

test('human-facing Admin menu has one canonical order inside the eight work areas', () => {
  assert.match(layout, /VISIBLE_NAV_ORDER = Object\.freeze\(adminMenuOrder\(\)\)/);
  const expected = [
    'campus',
    'work', 'communication',
    'workspace', 'organization', 'clients', 'admins',
    'life-ai', 'community', 'books', 'social',
    'aiops', 'marketing-ai', 'ai-module-spec', 'ai-membership',
    'finance', 'tax', 'affiliates',
    'storage', 'api-cost',
    'health', 'security', 'devices', 'architecture',
  ];
  let cursor = -1;
  for (const section of expected) {
    const next = registry.indexOf(`id: '${section}'`, cursor + 1);
    assert.ok(next > cursor, `${section} must remain in canonical menu order`);
    cursor = next;
  }
  assert.doesNotMatch(registry, /id: 'overview'/);
  for (const axis of ['home', 'operations', 'people', 'services', 'ai', 'business', 'data', 'system']) {
    assert.match(registry, new RegExp(`id: '${axis}'`));
  }
  assert.match(layout, /VISIBLE_NAV_RANK/);
  assert.match(layout, /applyStableNavigationOrder/);
  assert.match(layout, /item\.style\.order/);
  assert.match(layout, /data\.menuOrder|dataset\.menuOrder/);
});

test('Admin sidebar menu uses minimal vertical spacing without shrinking label readability', () => {
  assert.match(layout, /ekodi-admin-menu-density/);
  assert.match(layout, /gap:0!important/);
  assert.match(layout, /min-height:30px!important/);
  assert.match(layout, /padding:4px 9px!important/);
  assert.match(layout, /font-size:12px!important/);
});
