import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADMIN_MENU_REGISTRY,ADMIN_MENUS,adminMenuOrder,getAdminMenuForSection} from '../admin-menu-registry.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('SEARCH-VISIBILITY-001 has one super-admin menu under canonical settings route',()=>{
  const item=ADMIN_MENU_REGISTRY.find(x=>x.id==='search-visibility');
  assert.equal(item?.group,'settings');
  assert.equal(item?.superAdminOnly,true);
  assert.equal(item?.labels?.ko,'검색노출관리');
  const group=ADMIN_MENUS.find(x=>x.id==='search-visibility-management');
  assert.deepEqual(group?.sections,['search-visibility']);
  assert.equal(getAdminMenuForSection('search-visibility')?.id,group.id);
  assert.equal(adminMenuOrder().filter(x=>x==='search-visibility').length,1);
  const policy=JSON.parse(read('config/admin-menu-audience-policy.json'));
  assert.equal(policy.classification.entries['search-visibility']?.audience,'platform-super-admin');
  assert.match(read('admin-canonical-routes.js'),/'search-visibility':'settings'/);
});
test('search visibility UI is shipped through versioned admin lazy assets',()=>{
  assert.match(read('admin-demand-loader.js'),/'search-visibility':\{styles:\['search-visibility-admin.css'\]/);
  assert.match(read('admin-menu-layout.js'),/DEMAND_KEYS\.get\(section\)\|\|section/);
  assert.match(read('admin-menu-layout.compact.js'),/m\.get\(e\)\|\|e/);
  for(const asset of ['search-visibility-admin.js','search-visibility-admin.css']){
    assert.ok(read('scripts/build.mjs').includes("'"+asset+"'"));
    assert.ok(read('scripts/admin-performance-postbuild.mjs').includes("'"+asset+"'"));
    assert.ok(read('site-worker.js').includes("'/'"+asset+"'"));
  }
});
test('never synthesize provider-indexed, GSC or search-performance numbers',()=>{
  const ui=read('search-visibility-admin.js');
  assert.match(ui,/result\?\.role==='super_admin'/);
  assert.match(ui,/\/api\/session/);
  assert.match(ui,/\/public-registry\.json/);
  assert.match(ui,/\/admin\/settings\/search-visibility|data-sv-phase/);
  assert.match(ui,/미연동/);
  assert.match(ui,/수동 확인 기록/);
  assert.match(ui,/URL\.createObjectURL/);
  assert.match(ui,/new DOMParser/);
  assert.doesNotMatch(ui,/\/api\/indexing\/submit|method:\s*['"]POST['"]/);
  assert.match(ui,/if\(r\?\.type!=='site'/);
  assert.match(ui,/url\.hostname!=='ekodi\.kr'/);
  assert.match(ui,/search\.google\.com\/search-console/);
  assert.match(ui,/searchadvisor\.naver\.com/);
  assert.match(ui,/webmaster\.daum\.net/);
  assert.match(ui,/www\.bing\.com\/webmasters/);
});
