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
