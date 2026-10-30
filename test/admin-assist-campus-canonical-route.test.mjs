import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../scripts/admin-assist-canonical-e2e.mjs', import.meta.url), 'utf8');
const routesSource = fs.readFileSync(new URL('../admin-canonical-routes.js', import.meta.url), 'utf8');

test('canonical Assist production probe derives the campus path from the route registry', () => {
  assert.doesNotMatch(script, /'\/admin\/home\/campus'/);
  assert.match(script, /canonicalAdminPath\('campus'\)/);
  assert.match(script, /canonicalLocation\.pathname !== campusPath/);
});

test('route registry campus path is the address production redirects to', () => {
  const window = { location: new URL('https://ekodi.kr/admin/'), matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(routesSource, { window, URL, URLSearchParams, Object, Set, String });
  assert.equal(window.EKODIAdminRoutes.pathFor('campus'), '/admin/sites/campus');
  assert.equal(window.EKODIAdminRoutes.sectionFromPath('/admin/home/campus'), 'campus');
});

test('canonical Assist production browser stops on the first 429 before retry or selector wait', () => {
  const start = script.indexOf('for (let attempt = 1; attempt <= 2; attempt += 1) {');
  const end = script.indexOf("await page.waitForFunction(() => document.querySelector('#apiState')", start);
  assert.ok(start >= 0 && end > start, 'expected canonical Admin navigation retry loop');
  const loop = script.slice(start, end);
  const navigation = loop.indexOf('const response = await page.goto(canonicalBaseUrl');
  const quotaGuard = loop.indexOf('if (response?.status() === 429)');
  const selectorWait = loop.indexOf("await page.waitForSelector('#app:not([hidden])'");
  assert.ok(navigation >= 0 && quotaGuard > navigation && selectorWait > quotaGuard,
    'HTTP 429 must abort before selector timeout and before any second navigation');
  assert.match(loop, /if \(response\?\.status\(\) === 429\) \{\s*throw new Error\('CF-QUOTA-001:[^']*no retry'\);\s*\}/);
});
