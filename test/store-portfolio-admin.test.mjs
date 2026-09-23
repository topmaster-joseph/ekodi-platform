import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storePortfolioAdminPage, CMPMYI_STORES, CMPMYI_ADMIN_SECTIONS } from '../store-portfolio-admin-page.js';
import platformEntry from '../platform-router-entry-worker.js';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

test('cmpmyi admin is an aggregate hub that hands off to each store canonical admin',async()=>{
  const response=storePortfolioAdminPage();const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-admin');
  assert.deepEqual(CMPMYI_STORES.map(x=>x.slug),['jadam','pizzamaru','yogurt']);
  for(const section of ['delivery','menu','orders','sales','inventory','customers','reviews','marketing','publishing','work','finance','connections','site','members']){
    assert.ok(CMPMYI_ADMIN_SECTIONS.some(([key])=>key===section),`missing ${section}`);
  }
  for(const store of CMPMYI_STORES){
    assert.ok(html.includes(store.name));
    for(const section of ['delivery','menu','orders','connections'])assert.ok(html.includes(`/${store.slug}/admin/${section}`));
  }
  assert.match(html,/브랜드 관리자 전체 메뉴/);
  assert.match(html,/배달플랫폼 관리는 각 브랜드의 배달플랫폼 메뉴에서 수행합니다/);
  assert.match(html,/점포별 재확인/);assert.match(html,/공통 Store Admin/);
});

test('aggregate store child URLs never render child admin and redirect to store-owned admins',async()=>{
  for(const [slug,section] of [['jadam',''],['pizzamaru','/reviews'],['yogurt','/menu']]){
    const response=await platformEntry.fetch(new Request(`https://ekodi.kr/cmpmyi/admin/${slug}${section}`),{},{});
    assert.equal(response.status,308);
    assert.equal(response.headers.get('location'),`https://ekodi.kr/${slug}/admin${section}`);
    assert.equal(response.headers.get('x-ekodi-route'),'admin-canonical-handoff');
  }
});
test('super administrator navigation keeps only the cmpmyi hub as the aggregate entry',()=>{
  const item=ADMIN_MENU_REGISTRY.find(row=>row.id==='cmpmyi');
  assert.ok(item);assert.equal(item.group,'sites');assert.equal(item.superAdminOnly,true);assert.equal(item.internal,true);
  assert.equal(item.href,'https://ekodi.kr/cmpmyi/admin');
  const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/storePortfolioAdminPage/);
  assert.doesNotMatch(router,/resolveIntegratedStoreAdminRoute/);
});

test('guarded release probes canonical store admins and redirect-only aggregate aliases',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin')?.statuses,[200]);
  for(const slug of ['jadam','pizzamaru','yogurt']){
    const canonical=byUrl.get(`https://ekodi.kr/${slug}/admin`);assert.deepEqual(canonical?.statuses,[200]);
    const alias=byUrl.get(`https://ekodi.kr/cmpmyi/admin/${slug}`);assert.deepEqual(alias?.statuses,[308]);
    assert.ok(alias?.headerExpect.includes(`location: https://ekodi.kr/${slug}/admin`));
  }
});
