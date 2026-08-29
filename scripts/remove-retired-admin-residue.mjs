import { readFileSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const write = (path, value) => writeFileSync(path, value);
const must = (condition, message) => { if (!condition) throw new Error(message); };

function update(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after !== before) write(path, after);
}

update('admin-authenticated-shell.js', source => {
  let next = source.replace(/function canonicalizeLegacyEntry\(\)\{[^\n]*\}\n/, '');
  next = next.replaceAll('canonicalizeLegacyEntry();', '');
  must(!next.includes("location.pathname.startsWith('/legacy')"), 'legacy entry canonicalizer survived');
  return next;
});

update('campus-actions.js', source => {
  let next = source.replace("button.dataset.campusTarget = action === 'status' ? 'overview' : site.section;", "button.dataset.campusTarget = action === 'status' ? 'health' : site.section;");
  next = next.replace("if (action === 'status' && location.hash !== '#operations') history.replaceState(null, '', '#operations');", "if (action === 'status' && location.hash !== '#health') history.replaceState(null, '', '#health');");
  next = next.replace(/\n  function removeDomainsMenu\(\) \{[\s\S]*?\n  \}\n\n  function decorateAffiliates/, '\n\n  function decorateAffiliates');
  next = next.replace('    removeDomainsMenu();\n', '');
  must(!next.includes('/legacy#domains'), 'campus legacy domain link survived');
  must(!next.includes("'#operations'"), 'campus retired operations hash survived');
  return next;
});

update('domains-hub.js', source => {
  let next = source.replace("    const activity = nav.querySelector('a[href=\"/legacy#activity\"]');\n    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);\n    else if (activity) nav.insertBefore(navButton, activity);\n    else nav.append(navButton);", "    if (placeholder) placeholder.insertAdjacentElement('beforebegin', navButton);\n    else nav.append(navButton);");
  must(!next.includes('/legacy#activity'), 'domains hub legacy activity link survived');
  return next;
});

update('release-control-admin.js', source => {
  let next = source.replace("      const domains = Array.from(nav.querySelectorAll('a.nav')).find(item => item.getAttribute('href') === '/legacy#domains');\n      if (domains) nav.insertBefore(button, domains); else nav.append(button);", "      nav.append(button);");
  next = next.replace("      const activity = nav.querySelector('a[href=\"/legacy#activity\"]');\n      if (activity) nav.insertBefore(navButton, activity); else nav.append(navButton);", "      nav.append(navButton);");
  must(!next.includes('/legacy#domains'), 'release control legacy domains link survived');
  must(!next.includes('/legacy#activity'), 'release control legacy activity link survived');
  return next;
});

update('system-timeline-admin.js', source => {
  const marker = "\n(() => {\n  'use strict';\n\n  const ROUTES = new Set(['overview','decisions','ecosystem','ai-council','system']);";
  const index = source.indexOf(marker);
  const next = index >= 0 ? source.slice(0, index).trimEnd() + '\n' : source;
  must(!next.includes('/legacy#domains'), 'system timeline legacy domains link survived');
  must(!next.includes('/legacy#activity'), 'system timeline legacy activity link survived');
  must(!next.includes("new Set(['overview','decisions','ecosystem','ai-council','system'])"), 'retired governance system router survived');
  return next;
});

write('test/admin-ai-first-navigation.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('internal technical sections stay out of the primary navigation', () => {
  assert.match(layout, /INTERNAL_ONLY_SECTIONS = new Set\\(\\['services', 'deployments', 'policies'\\]\\)/);
  for (const route of ['#services:services', '#deployments:deployments', '#policies:policies']) assert.match(layout, new RegExp(route));
  assert.match(layout, /item\\.hidden = true/);
  assert.match(layout, /data\\.aiInternal|dataset\\.aiInternal/);
  assert.doesNotMatch(layout, /\\/legacy#/);
  assert.doesNotMatch(layout, /#operations:overview/);
});

test('internal technical hashes route into demand-loaded AI Ops without becoming global menu axes', () => {
  assert.match(layout, /function routeInternalToAiOps/);
  assert.match(layout, /openDemand\\('aiops'\\)/);
  assert.match(layout, /#ai-ops/);
  assert.match(layout, /#services:services/);
  assert.match(layout, /#deployments:deployments/);
  assert.match(layout, /let requestedSection = ''/);
  assert.match(layout, /const initialHash = explicitHashSection\\(\\)/);
  assert.doesNotMatch(layout, /preferAiOpsOnReady/);
  assert.doesNotMatch(layout, /setInterval\\(/);
});

test('Devices participates in the central panel router even though its menu is installed dynamically', () => {
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /return 'devices'/);
  assert.match(layout, /\\.nav\\[data-device-control-nav\\]/);
});

test('Campus shortcuts cannot reopen hidden technical panels', () => {
  assert.match(layout, /\\[data-campus-section\\]/);
  assert.match(layout, /isInternalSection\\(control\\.dataset\\.campusSection\\)/);
  assert.match(layout, /routeInternalToAiOps\\(\\)/);
});

test('human-facing Admin menu has one canonical order inside the eight work areas', () => {
  assert.match(layout, /VISIBLE_NAV_ORDER = Object\\.freeze\\(adminMenuOrder\\(\\)\\)/);
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
    const next = registry.indexOf(\`id: '\${section}'\`, cursor + 1);
    assert.ok(next > cursor, \`\${section} must remain in canonical menu order\`);
    cursor = next;
  }
  assert.doesNotMatch(registry, /id: 'overview'/);
  for (const axis of ['home', 'operations', 'people', 'services', 'ai', 'business', 'data', 'system']) assert.match(registry, new RegExp(\`id: '\${axis}'\`));
  assert.match(layout, /VISIBLE_NAV_RANK/);
  assert.match(layout, /applyStableNavigationOrder/);
});

test('Admin sidebar menu uses compact spacing without shrinking label readability', () => {
  assert.match(layout, /ekodi-admin-menu-density/);
  assert.match(layout, /gap:0!important/);
  assert.match(layout, /min-height:30px!important/);
  assert.match(layout, /padding:4px 9px!important/);
  assert.match(layout, /font-size:12px!important/);
});
`);

write('test/admin-central-login-link.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(\`../\${path}\`, import.meta.url), 'utf8');

test('current admin shell ships the central-admin link before JavaScript runs', async () => {
  const html = await read('control-center.html');
  assert.match(html, /id="centralAdminLogin"/);
  assert.match(html, /href="https:\\\/\\\/auth\\.ekodi\\.kr\\\/\\?site=admin&amp;return_to=https%3A%2F%2Fadmin\\.ekodi\\.kr%2F"/);
  assert.match(html, /<form id="loginForm" hidden>/);
  assert.match(html, /<script src="admin-central-handoff\\.js"><\\/script>[\\s\\S]*<script src="admin-authenticated-shell\\.js"><\\/script>/);
  assert.doesNotMatch(html, /control-center-features\\.js|control-center\\.js/);
});

test('canonical admin edge explicitly rejects retired admin entry paths', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /RETIRED_ADMIN_PATHS/);
  for (const retired of ['/admin.html','/control-center','/control-center.html','/legacy','/legacy.html','/control-center.js','/control-center-features.js','/control-center-ops.css']) assert.ok(worker.includes(\`'\${retired}'\`));
  assert.match(worker, /RETIRED_ADMIN_PATHS\\.has\\(url\\.pathname\\)/);
  assert.match(worker, /return retiredAdminResponse\\(\\)/);
});

test('apex admin fallback rewrites only auth destination and versioned assets use immutable cache', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /const PUBLIC_ADMIN_ALIASES = new Set\\(\\['\\/admin', '\\/admin\\/'\\]\\)/);
  assert.match(worker, /function rewriteAdminApexLogin\\(response\\)/);
  assert.match(worker, /element\\.setAttribute\\('href', loginUrl\\)/);
  assert.match(worker, /target\\.searchParams\\.set\\('return_to', 'https:\\\/\\\/ekodi\\.kr\\\/admin'\\)/);
  assert.match(worker, /function adminAssetCacheControl\\(url\\)/);
});

test('admin auth start remains a fixed-origin allow-listed fallback', async () => {
  const worker = await read('site-worker.js');
  assert.match(worker, /url\\.pathname === '\\/auth\\/start'/);
  assert.match(worker, /return ADMIN_ALIASES\\.has\\(candidate\\) \\? candidate : '\\/'/);
  assert.match(worker, /new URL\\('https:\\\/\\\/auth\\.ekodi\\.kr\\/'\\)/);
  assert.match(worker, /'X-EKODI-Route': 'admin-auth-start'/);
});

test('central handoff preserves current admin destinations without retired route aliases', async () => {
  const source = await read('admin-central-handoff.js');
  assert.ok(source.includes("storige:'storage'"));
  assert.ok(source.includes("aiops:'ai-ops'"));
  assert.ok(source.includes("release:'deployments'"));
  assert.ok(source.includes("health api-cost storage security"));
  assert.doesNotMatch(source, /legacy:'ai-ops'|domains:'ai-ops'|activity:'ai-ops'|overview:'operations'/);
  assert.ok(source.includes("const q=normalizeRoute(new URLSearchParams(location.search).get('route'))"));
  assert.ok(source.includes("const target=\`https://admin.ekodi.kr/?route=\${encodeURIComponent(r)}\`"));
  assert.ok(source.includes("route=normalizeRoute(query.get('route')||hash.get('ekodi_admin_route')"));
});

test('authenticated shell restores requested hash and contains no retired path normalizer', async () => {
  const source = await read('admin-authenticated-shell.js');
  assert.ok(source.includes("const requestedHash=location.hash"));
  assert.ok(source.includes("await Promise.all(criticalPostAuthScripts.map(loadScript))"));
  assert.ok(source.includes("if(requestedHash&&location.hash!==requestedHash)history.replaceState"));
  assert.doesNotMatch(source, /canonicalizeLegacyEntry|\\/legacy/);
});
`);

update('test/admin-free-ops-nav.contract.test.mjs', source => {
  let next = source.replace("  assert.match(adminJs, /getAttribute\\('href'\\) === '\\/legacy#domains'/);\n  assert.match(adminJs, /insertBefore\\(button, domains\\)/);\n", "  assert.doesNotMatch(adminJs, /\\/legacy#/);\n  assert.match(adminJs, /nav\\.append\\(button\\)/);\n");
  must(!next.includes('/legacy#domains'), 'free ops contract legacy domain expectation survived');
  return next;
});

console.log('Retired admin residue removed from runtime and contracts.');
