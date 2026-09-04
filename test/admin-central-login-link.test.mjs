import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('current admin shell ships the central-admin link before JavaScript runs', async () => {
  const html = await read('admin-shell.html');
  assert.match(html, /id="centralAdminLogin"/);
  assert.match(html, /href="https:\/\/auth\.ekodi\.kr\/\?site=admin&amp;direct=1&amp;return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F"/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\.js"><\/script>/);
  assert.match(html, /<script src="admin-authenticated-shell\.js(?:\?v=[^"]+)?"[^>]*><\/script>/);
  assert.match(html, /data-ekodi-postauth="admin-compact\.js admin-menu-layout\.js admin-demand-loader\.js"/);
  assert.doesNotMatch(html, /control-center-features\.js|control-center\.js/);
});

test('canonical admin edge explicitly rejects retired admin entry paths', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /RETIRED_ADMIN_PATHS/);
  for (const retired of ['/admin.html','/control-center','/control-center.html','/legacy','/legacy.html','/control-center.js','/control-center-features.js','/control-center-ops.css']) assert.ok(worker.includes(`'${retired}'`));
  assert.match(worker, /RETIRED_ADMIN_PATHS\.has\(url\.pathname\)/);
  assert.match(worker, /return retiredAdminResponse\(\)/);
});

test('apex admin fallback rewrites only auth destination and versioned assets use immutable cache', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /const PUBLIC_ADMIN_ALIASES = new Set\(\['\/admin', '\/admin\/'\]\)/);
  assert.match(worker, /function rewriteAdminApexLogin\(response\)/);
  assert.match(worker, /element\.setAttribute\('href', loginUrl\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to', 'https:\/\/ekodi\.kr\/admin'\)/);
  assert.match(worker, /function adminAssetCacheControl\(url\)/);
});

test('admin auth start remains a fixed-origin allow-listed fallback', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /url\.pathname === '\/auth\/start'/);
  assert.match(worker, /return ADMIN_ALIASES\.has\(candidate\) \? candidate : '\/'/);
  assert.match(worker, /new URL\('https:\/\/auth\.ekodi\.kr\/'\)/);
  assert.match(worker, /'X-EKODI-Route': 'admin-auth-start'/);
});

test('central handoff preserves current admin destinations without retired route aliases', async () => {
  const source = await read('admin-central-handoff.js');
  assert.ok(source.includes("storige:'storage'"));
  assert.ok(source.includes("aiops:'ai-ops'"));
  assert.ok(source.includes("release:'deployments'"));
  assert.ok(source.includes('ai-ops devotional ai-module-spec'));
  assert.ok(source.includes('health api-cost storage security'));
  assert.doesNotMatch(source, /const ALIASES=\{[^}]*\b(?:legacy|domains|activity|overview):/);
  assert.ok(source.includes("const q=normalizeRoute(new URLSearchParams(location.search).get('route'))"));
  assert.ok(source.includes("const target=`https://admin.ekodi.kr/?route=${encodeURIComponent(r)}`"));
  assert.ok(source.includes("route=normalizeRoute(query.get('route')||hash.get('ekodi_admin_route')"));
});

test('authenticated shell keeps the app hidden until the requested menu runtime is activated', async () => {
  const source = await read('admin-authenticated-shell.js');
  assert.ok(source.includes("app.style.visibility='hidden'"));
  assert.ok(source.includes('for(const src of criticalPostAuthScripts)'));
  assert.ok(source.includes('await loadScript(src)'));
  assert.ok(source.includes('window.EKODIAdminPanels?.activate'));
  assert.ok(source.includes('window.EKODIAdminSidebar'));
  assert.ok(source.includes('await Promise.resolve(window.EKODIAdminPanels.activate(requestedSection()))'));
  assert.ok(source.includes("if(requestedHash&&location.hash!==requestedHash)history.replaceState"));
  assert.ok(source.indexOf('await Promise.resolve(window.EKODIAdminPanels.activate(requestedSection()))') < source.indexOf('announceReady();loadDeferredEnhancements()'));
  assert.doesNotMatch(source, /waitForMenuRuntime|canonicalizeLegacyEntry|\/legacy/);
});

test('all user-facing platform admin entries use the silent direct auth bridge', async () => {
  const [myRoleUi, taxPortal, worker] = await Promise.all([
    read('my/site-activity-role-ui.js'),
    read('tax-portal-worker.js'),
    read('site-worker.js'),
  ]);
  assert.match(myRoleUi, /\?site=admin&direct=1&return_to=/);
  assert.match(taxPortal, /\?site=admin&direct=1&return_to=/);
  assert.doesNotMatch(myRoleUi, /\?site=admin&return_to=/);
  assert.doesNotMatch(taxPortal, /\?site=admin&return_to=/);
  assert.equal((worker.match(/target\.searchParams\.set\('direct', '1'\);/g) || []).length >= 2, true);
});
