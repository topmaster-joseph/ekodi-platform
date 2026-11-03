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

test('human-facing Admin menu has one canonical order inside eight unique EKODI areas', () => {
  assert.deepEqual(adminMenuGroups(), ['home','sites','ai','services','finance','ops','settings','accounts']);
  assert.deepEqual(adminMenuOrder(), [
    'platform-overview', 'sites-all', 'sites-core', 'sites-community', 'sites-business', 'sites-clients', 'sites-knowledge', 'sites-communication', 'sites-worklife', 'sites-other', 'sites-preparing', 'menu-templates', 'aiops', 'growth-os', 'search-visibility', 'ai-settings', 'ai-membership', 'engine-all', 'engine-core', 'engine-common', 'engine-operations', 'engine-professional', 'engine-ai', 'engine-integration', 'engine-preview', 'books', 'common-scripture', 'devotional', 'social', 'work', 'points', 'finance', 'api-cost', 'infra-costs', 'site-health', 'domain-control', 'deployments', 'architecture', 'maturity', 'devices', 'pos-agent', 'public-site-controls', 'language-status', 'ai-module-spec', 'storage', 'users-access', 'admins', 'security', 'audit-records', 'social-accounts'
  ]);
  assert.ok(layout.includes('const ORDER=Object.freeze(adminMenuOrder());'));
  assert.ok(layout.includes('const RANK=new Map(ORDER.map((section,index)=>[section,index+1]));'));
  assert.ok(layout.includes('function applyOrder()'));
});

test('Platform Admin sidebar uses readable eight-area spacing with role-projected task details', () => {
  for (const marker of ['ekodi-admin-workbench-tabs-style','gap:2px!important','min-height:40px','padding:6px 10px','font-size:14px']) assert.ok(sidebar.includes(marker));
  assert.ok(sidebar.includes("role-projected-sidebar-v4"));
});

test('administrator access waits for its runtime instead of recursively clicking the hidden source menu', () => {
  assert.ok(layout.includes("if(section==='admins')return requestAdminAccess();"));
  assert.ok(layout.includes("window.EKODIAdminMenu?.ensureAdminAccess?.()"));
  assert.ok(menuRuntime.includes('function loadCurrentSession()'));
  assert.ok(menuRuntime.includes('async function ensureAdminAccess()'));
  assert.ok(menuRuntime.includes('refreshAdminAccess: loadAccounts, ensureAdminAccess'));
  assert.ok(menuRuntime.indexOf("if (currentSession.role === 'super_admin') ensureAdminPanel();") < menuRuntime.indexOf('await installContextControl();'));
});
