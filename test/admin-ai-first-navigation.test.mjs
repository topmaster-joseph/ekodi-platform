import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adminMenuGroups, adminMenuOrder, getAdminMenuItem } from '../admin-menu-registry.js';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('internal technical sections stay out of primary navigation', () => {
  assert.ok(layout.includes("const INTERNAL=new Set(['services','deployments','policies']);"));
  for (const section of ['services','deployments','policies']) {
    assert.equal(getAdminMenuItem(section)?.internal, true);
    assert.equal(adminMenuOrder().includes(section), false);
    assert.ok(layout.includes(`#${section}:${section}`));
  }
  assert.ok(layout.includes('item.dataset.aiInternal='));
  assert.doesNotMatch(layout, /\/legacy#/);
});

test('internal hashes converge into demand-loaded AI Ops', () => {
  assert.ok(layout.includes("function routeInternal(){dc=false;requestedSection='aiops'"));
  assert.ok(layout.includes("requestDemand('aiops')"));
  assert.ok(layout.includes("history.replaceState(null,'','#ai-ops')"));
  assert.ok(layout.includes("const explicitHashSection=()=>HASH.get(location.hash.toLowerCase())||''"));
  assert.doesNotMatch(layout, /setInterval\(/);
});

test('Devices participates in the central panel router even though installed dynamically', () => {
  assert.ok(layout.includes('deviceControlNav'));
  assert.ok(layout.includes("return'devices'"));
  assert.ok(layout.includes('.nav[data-device-control-nav]'));
});

test('Campus shortcuts cannot reopen hidden technical panels', () => {
  assert.ok(layout.includes('[data-campus-section]'));
  assert.ok(layout.includes('isInternal(control.dataset.campusSection)'));
  assert.ok(layout.includes('routeInternal()'));
});

test('human-facing Admin menu has one canonical order inside five domains plus Operations Center', () => {
  assert.deepEqual(adminMenuGroups(), ['structure','core','common','vertical','tenants','operations-center']);
  assert.deepEqual(adminMenuOrder(), [
    'campus','public-site-controls','architecture','security','admins','ai-module-spec','storage',
    'common-services','communication','workspace','finance','life-ai','personal-finance','community','books','social','devotional','marketing-ai','ai-membership','tax','affiliates',
    'work','organization','clients','cheonggye-members','capabilities','aiops','devices','health','api-cost',
  ]);
  assert.ok(layout.includes('const ORDER=Object.freeze(adminMenuOrder());'));
  assert.ok(layout.includes('const RANK=new Map(ORDER.map((section,index)=>[section,index+1]));'));
  assert.ok(layout.includes('function applyOrder()'));
});

test('Admin sidebar menu uses compact spacing without shrinking label readability', () => {
  for (const marker of ['ekodi-admin-menu-density','gap:0!important','min-height:30px!important','padding:4px 9px!important','font-size:12px!important']) assert.ok(layout.includes(marker));
});
