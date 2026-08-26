import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const compact = await readFile(new URL('../compact-control-center.css', import.meta.url), 'utf8');

test('Operations and Site Management lead the human-facing menu while technical panels stay internal', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS=new Set\(\['services', 'deployments', 'policies'\]\)/);
  assert.match(layout, /INTERNAL_ONLY_HREFS/);
  assert.match(layout, /\/legacy#domains/);
  assert.match(layout, /\/legacy#activity/);
  assert.match(layout, /\.hidden=true/);
  assert.match(layout, /dataset\.aiInternal/);
  assert.match(layout, /\['overview', 'campus', 'aiops', 'health', 'security'/);
});

test('Operations is the normal-login default while only internal technical routes fall back to AI Ops', () => {
  assert.match(layout, /function routeInternalToAiOps/);
  assert.match(layout, /openDemand\('aiops'\)/);
  assert.match(layout, /\['#operations'\s*,\s*'overview'\]/);
  assert.match(layout, /\['#services'\s*,\s*'services'\]/);
  assert.match(layout, /let locale=.*requestedSection = ''/);
  assert.match(layout, /const initialHash\s*=\s*explicitHashSection\(\)/);
  assert.match(layout, /requestedSection='overview'/);
  assert.match(layout, /activatePanel\('overview'\)/);
  assert.doesNotMatch(layout, /preferAiOpsOnReady/);
  assert.doesNotMatch(layout, /setInterval\(/);
});

test('Devices participates in the central panel router even though its menu is installed dynamically', () => {
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /return\s*'devices'/);
  assert.match(layout, /\.nav\[data-device-control-nav\]/);
});

test('Campus shortcuts cannot reopen internal technical panels', () => {
  assert.match(layout, /\[data-campus-section\]/);
  assert.match(layout, /isInternalSection\([^)]*\.dataset\.campusSection\)/);
  assert.match(layout, /routeInternalToAiOps\(\)/);
  assert.match(layout, /openDemand\('aiops'\)/);
});

test('human-facing Admin menu has one canonical order independent of lazy module replacement', () => {
  const match = layout.match(/VISIBLE_NAV_ORDER=Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(match, 'canonical menu order must be declared once');
  const actual = [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  assert.deepEqual(actual, [
    'overview', 'campus', 'aiops', 'health', 'security', 'marketing-ai', 'work',
    'finance', 'communication', 'workspace', 'devices', 'organization', 'clients',
    'admins', 'community', 'books', 'social', 'affiliates', 'architecture',
  ]);
  assert.match(layout, /RANK=new Map\(VISIBLE_NAV_ORDER/);
  assert.match(layout, /applyStableNavigationOrder/);
  assert.match(layout, /style\.order/);
  assert.match(layout, /dataset\.menuOrder/);
});

test('Admin sidebar density comes from the shared compact stylesheet instead of per-menu inline patches', () => {
  assert.match(compact, /body\.compact-control-center \.sidebar nav\{display:grid;gap:3px/);
  assert.match(compact, /body\.compact-control-center \.nav\{gap:10px;padding:9px 11px;border-radius:10px;min-height:38px\}/);
  assert.match(compact, /body\.compact-control-center \.nav span\{font-size:12px\}/);
  assert.doesNotMatch(layout, /ekodi-admin-menu-density/);
});
