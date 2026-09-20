import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adminMenuGroups, adminMenuOrder, getAdminMenuItem } from '../admin-menu-registry.js';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const menuRuntime = await readFile(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');

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
  assert.ok(layout.includes("replaceSectionUrl('aiops')"));
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

test('human-facing Admin menu has one canonical order inside seven EKODI areas', () => {
  assert.deepEqual(adminMenuGroups(), ['home','operations','workspaces','services','community','publishing','system']);
  assert.deepEqual(adminMenuOrder(), [
    'command-home','campus','work','communication','finance','tax','clients','site-chrome','cmpmyi','organization','workspace',
    'common-services','life-ai','personal-finance','invest','social','marketing-ai','supply-network','insurance',
    'community','ai-membership','books','devotional',
    'public-site-controls','language-status','architecture','maturity','security','admins','ai-module-spec','storage','capabilities','aiops','ai-settings','openai','devices','health','api-cost',
  ]);
  assert.ok(layout.includes('const ORDER=Object.freeze(adminMenuOrder());'));
  assert.ok(layout.includes('const RANK=new Map(ORDER.map((section,index)=>[section,index+1]));'));
  assert.ok(layout.includes('function applyOrder()'));
});

test('Admin sidebar menu uses readable seven-area spacing without shrinking labels', () => {
  for (const marker of ['ekodi-admin-workbench-tabs-style','gap:4px!important','min-height:48px','padding:10px 12px','font-size:15px']) assert.ok(sidebar.includes(marker));
  assert.ok(sidebar.includes("primary-sidebar-tabs-v3"));
});

test('administrator access waits for its runtime instead of recursively clicking the hidden source menu', () => {
  assert.ok(layout.includes("if(section==='admins')return requestAdminAccess();"));
  assert.ok(layout.includes("window.EKODIAdminMenu?.ensureAdminAccess?.()"));
  assert.ok(menuRuntime.includes('function loadCurrentSession()'));
  assert.ok(menuRuntime.includes('async function ensureAdminAccess()'));
  assert.ok(menuRuntime.includes('refreshAdminAccess: loadAccounts, ensureAdminAccess'));
  assert.ok(menuRuntime.indexOf("if (currentSession.role === 'super_admin') ensureAdminPanel();") < menuRuntime.indexOf('await installContextControl();'));
});
