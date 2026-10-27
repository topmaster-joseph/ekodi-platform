import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ADMIN_MENUS, ADMIN_MENU_REGISTRY, getAdminMenuForSection } from '../admin-menu-registry.js';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Search Visibility is an EKODI super-admin registry menu with a single canonical section',()=>{
  const entry=ADMIN_MENU_REGISTRY.find(x=>x.id==='search-visibility');
  assert.ok(entry);
  assert.equal(entry.group,'settings');
  assert.equal(entry.superAdminOnly,true);
  assert.ok(ADMIN_MENUS.some(x=>x.id==='search-growth'&&x.sections.includes('search-visibility')));
  assert.equal(getAdminMenuForSection('search-visibility')?.id,'search-growth');
  const audience=JSON.parse(read('config/admin-menu-audience-policy.json'));
  assert.equal(audience.classification.entries['search-visibility'].audience,'platform-super-admin');
});
test('Canonical and friendly routes both resolve to the visibility section',()=>{
  const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
  const window={location};
  vm.runInNewContext(read('admin-canonical-routes.js'),{window,URL,URLSearchParams,Object,Set,String,Array,decodeURIComponent,encodeURIComponent});
  const routes=window.EKODIAdminRoutes;
  assert.equal(routes.pathFor('search-visibility'),'/admin/settings/search-visibility');
  assert.equal(routes.routeFromPath('/admin/growth/search')?.section,'search-visibility');
  assert.equal(routes.routeFromPath('/admin/settings/search-visibility')?.section,'search-visibility');
});
test('Search visibility is source-available and deployable through the guarded site worker',()=>{
  assert.match(read('scripts/build.mjs'),/'search-visibility-admin.js'/);
  assert.match(read('site-worker.js'),/'\/search-visibility-admin.js'/);
  assert.match(read('admin-menu-layout.js'),/import\('\.\/search-visibility-admin.js'\)/);
});
test('Public read-only audit does not misrepresent indexing or submit provider credentials',()=>{
  const src=read('search-visibility-admin.js');
  assert.match(src,/public-registry.json/);
  assert.match(src,/EKODI-PUBLIC-DISCOVERY-002/);
  assert.match(src,/SEO\(검색\) · AEO\(답변\) · GEO/);
  assert.match(src,/색인/);
  assert.doesNotMatch(src,/fetch\('https:\/\/indexing.googleapis.com/);
  assert.doesNotMatch(src,/localStorage\.setItem|POST.*indexnow/);
});
