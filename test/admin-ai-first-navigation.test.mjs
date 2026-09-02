import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = await read('admin-menu-layout.js');
const registry = await read('admin-menu-registry.js');

test('internal technical sections stay out of the primary navigation', () => {
  assert.match(layout, /const INTERNAL=new Set\(\['services','deployments','policies'\]\)/);
  for (const route of ['#services:services', '#deployments:deployments', '#policies:policies']) assert.match(layout, new RegExp(route));
  assert.match(layout, /item\.hidden=true/);
  assert.match(layout, /dataset\.aiInternal/);
  assert.doesNotMatch(layout, /\/legacy#/);
  assert.doesNotMatch(layout, /#operations:overview/);
});

test('internal technical hashes route into demand-loaded AI Ops without becoming global menu axes', () => {
  assert.match(layout, /function routeInternal\(\)/);
  assert.match(layout, /requestDemand\('aiops'\)/);
  assert.match(layout, /#ai-ops/);
  assert.match(layout, /#services:services/);
  assert.match(layout, /#deployments:deployments/);
  assert.match(layout, /let requestedSection = ''/);
  assert.match(layout, /const initialHash = explicitHashSection\(\)/);
  assert.doesNotMatch(layout, /preferAiOpsOnReady|setInterval\(/);
});
test('Devices participates in the central panel router even though its menu is installed dynamically', () => {
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /return'devices'/);
  assert.match(layout, /\.nav\[data-device-control-nav\]/);
});

test('Campus shortcuts cannot reopen hidden technical panels', () => {
  assert.match(layout, /\[data-campus-section\]/);
  assert.match(layout, /isInternal\(control\.dataset\.campusSection\)/);
  assert.match(layout, /routeInternal\(\)/);
});

test('human-facing Admin menu has one canonical order inside the eight work areas', () => {
  assert.match(layout, /const ORDER=Object\.freeze\(adminMenuOrder\(\)\)/);
  assert.match(layout, /const RANK=new Map\(ORDER\.map/);
  assert.match(layout, /function applyOrder\(\)/);
  const expected = [
    'campus', 'work', 'communication',
    'workspace', 'organization', 'clients', 'admins',
    'life-ai', 'community', 'books', 'social',
    'aiops', 'marketing-ai', 'ai-module-spec', 'ai-membership',
    'finance', 'tax', 'affiliates', 'storage', 'api-cost',
    'health', 'security', 'devices', 'architecture',
  ];
  let cursor = -1;  for (const section of expected) {
    const next = registry.indexOf(`id: '${section}'`, cursor + 1);
    assert.ok(next > cursor, `${section} must remain in canonical menu order`);
    cursor = next;
  }
  assert.doesNotMatch(registry, /id: 'overview'/);
  for (const axis of ['home','operations','people','services','ai','business','data','system']) {
    assert.match(registry, new RegExp(`id: '${axis}'`));
  }
});

test('Admin sidebar menu uses compact spacing without shrinking label readability', async () => {
  const compactCss = await read('admin-compact.css');
  assert.match(compactCss, /gap:0!important/);
  assert.match(compactCss, /min-height:30px!important/);
  assert.match(compactCss, /padding:4px 9px!important/);
  assert.match(compactCss, /font-size:12px!important/);
  assert.doesNotMatch(layout, /createElement\('style'\)/);
});