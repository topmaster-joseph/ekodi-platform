import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('control center ships a direct central-admin link before JavaScript runs', async () => {
  const html = await read('control-center.html');
  assert.match(html, /id="centralAdminLogin"/);
  assert.match(html, /href="https:\/\/auth\.ekodi\.kr\/\?site=admin&amp;return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F"/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\.js"><\/script>[\s\S]*<script src="control-center\.js"><\/script>/);
});

test('canonical admin edge preserves the direct auth anchor instead of rewriting it as a form submit', async () => {
  const worker = await read('site-worker.js');
  assert.doesNotMatch(worker, /function adminLoginFormHtml\(/);
  assert.doesNotMatch(worker, /function rewriteAdminLogin\(/);
  assert.doesNotMatch(worker, /centralAdminLoginForm/);
  assert.match(worker, /if \(ADMIN_ALIASES\.has\(url\.pathname\)\) \{[\s\S]*?return withHostSecurity\(response, ADMIN_CSP, 'no-store', 'admin-control-center'\);/);
  assert.match(worker, /"form-action 'self'"/);
});

test('apex admin fallback rewrites only the auth destination and versioned admin assets use immutable cache safely', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /const PUBLIC_ADMIN_ALIASES = new Set\(\['\/admin', '\/admin\/'\]\)/);
  assert.match(worker, /function rewriteAdminApexLogin\(response\)/);
  assert.match(worker, /element\.setAttribute\('href', loginUrl\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to', 'https:\/\/ekodi\.kr\/admin'\)/);
  assert.match(worker, /return withHostSecurity\(rewritten, ADMIN_CSP, 'no-store', 'admin-fallback'\)/);
  assert.match(worker, /function adminAssetCacheControl\(url\)/);
  assert.match(worker, /url\.searchParams\.has\('v'\)/);
  assert.match(worker, /public, max-age=31536000, immutable/);
  assert.match(worker, /public, max-age=0, must-revalidate/);
  assert.match(worker, /return withHostSecurity\(response, ADMIN_CSP, adminAssetCacheControl\(url\), 'admin-fallback-asset'\)/);
  assert.match(worker, /return withHostSecurity\(response, ADMIN_CSP, adminAssetCacheControl\(url\), 'admin-asset'\)/);
});

test('legacy admin auth start remains a fixed-origin allow-listed fallback', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /url\.pathname === '\/auth\/start'/);
  assert.match(worker, /return ADMIN_ALIASES\.has\(candidate\) \? candidate : '\/'/);
  assert.match(worker, /new URL\('https:\/\/auth\.ekodi\.kr\/'\)/);
  assert.match(worker, /target\.searchParams\.set\('site', 'admin'\)/);
  assert.match(worker, /target\.searchParams\.set\('return_to', `https:\/\/admin\.ekodi\.kr\$\{safePath\}`\)/);
  assert.match(worker, /'X-EKODI-Route': 'admin-auth-start'/);
});

test('central handoff keeps a direct auth link fallback and does not inject duplicates', async () => {
  const source = await read('admin-central-handoff.js');
  assert.match(source, /!document\.querySelector\('#centralAdminLogin'\)/);
  assert.match(source, /CENTRAL_ADMIN_AUTH_URL = 'https:\/\/auth\.ekodi\.kr\/\?site=admin&direct=1&return_to=https%3A%2F%2Fadmin\.ekodi\.kr%2F'/);
  assert.match(source, /link\.href=CENTRAL_ADMIN_AUTH_URL/);
  assert.match(source, /loginLink\.href = CENTRAL_ADMIN_AUTH_URL/);
  assert.match(source, /form\.hidden=true/);
});

test('central handoff preserves requested admin destinations and normalizes legacy aliases', async () => {
  const source = await read('admin-central-handoff.js');
  assert.ok(source.includes("storige:'storage'"));
  assert.ok(source.includes("legacy:'ai-ops'"));
  assert.ok(source.includes("domains:'ai-ops'"));
  assert.ok(source.includes("activity:'ai-ops'"));
  assert.ok(source.includes("health api-cost storage security"));
  assert.ok(source.includes("const q=normalizeRoute(new URLSearchParams(location.search).get('route'))"));
  assert.ok(source.includes("const h=normalizeRoute(location.hash)"));
  assert.ok(source.includes("const target=`https://admin.ekodi.kr/?route=${encodeURIComponent(r)}`"));
  assert.ok(source.includes("return`https://auth.ekodi.kr/?site=admin&direct=1&return_to=${encodeURIComponent(target)}`"));
  assert.ok(source.includes("route=normalizeRoute(query.get('route')||hash.get('ekodi_admin_route')"));
  assert.ok(source.includes("history.replaceState({},document.title,cleanRouteUrl(route))"));
  assert.ok(source.includes("window.addEventListener('hashchange',()=>{normalizeEntryRoute();syncLoginLink()})"));
});

test('admin menu router recognizes every current subpage and typo alias', async () => {
  const source = await read('admin-menu-layout.js');
  for (const pair of [
    "['#storage', 'storage']",
    "['#storige', 'storage']",
    "['#api-cost', 'api-cost']",
    "['#work', 'work']",
    "['#marketing-ai', 'marketing-ai']",
    "['#finance', 'finance']",
    "['#organization', 'organization']",
    "['#workspace', 'workspace']",
    "['#clients', 'clients']",
    "['#admins', 'admins']",
    "['#community', 'community']",
    "['#books', 'books']",
    "['#social', 'social']",
    "['#affiliates', 'affiliates']",
  ]) assert.ok(source.includes(pair), `missing route mapping: ${pair}`);
  assert.ok(source.includes("HASH_SECTIONS.get(location.hash.toLowerCase())"));
  assert.ok(source.includes("else if (!activatePanel(requestedSection)) openDemand(requestedSection)"));
  assert.ok(source.includes("if (!activatePanel(explicit)) openDemand(explicit)"));
});

test('authenticated shell restores the requested hash after compact UI scripts finish loading', async () => {
  const source = await read('admin-authenticated-shell.js');
  assert.ok(source.includes("const requestedHash=location.hash"));
  assert.ok(source.includes("await Promise.all(criticalPostAuthScripts.map(loadScript))"));
  assert.ok(source.includes("if(requestedHash&&location.hash!==requestedHash)history.replaceState"));
  assert.ok(source.includes("hero.href='#ai-ops'"));
  assert.ok(source.includes("a[href=\"/legacy\"]"));
});
