import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adminMenuGroups, adminMenuOrder, getAdminMenuItem } from '../admin-menu-registry.js';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const menuRuntime = await readFile(new URL('../admin-menu-runtime.js', import.meta.url), 'utf8');

test('internal technical sections stay out of primary navigation', () => {
  assert.ok(layout.includes("const INTERNAL=new Set(['services','policies']);"));
  for (const section of ['services','policies']) {
    assert.equal(getAdminMenuItem(section)?.internal, true);
    assert.equal(adminMenuOrder().includes(section), false);
    assert.ok(layout.includes(`#${section}:${section}`));
  }
  assert.notEqual(getAdminMenuItem('deployments')?.internal, true);
  assert.equal(adminMenuOrder().includes('deployments'), true);
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
  assert.deepEqual(adminMenuGroups(), ['summary','services','sites','people','content','status','settings-records']);
  assert.deepEqual(adminMenuOrder(), [
    'platform-overview',
    'engine-all','engine-core','engine-common','engine-operations','engine-professional','engine-ai','engine-integration','engine-preview',
    'sites-all','sites-internal','sites-user','sites-customer-partner','sites-independent','sites-preparing',
    'users-access','security','admins','ai-membership',
    'work','communication','community','books','devotional','social','finance','tax',
    'executor-registry','executor-infrastructure','executor-jobs','executor-verification','executor-policies',
    'health','deployments','aiops','devices','api-cost','architecture','maturity',
    'public-site-controls','language-status','ai-module-spec','storage','ai-settings','audit-records',
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
