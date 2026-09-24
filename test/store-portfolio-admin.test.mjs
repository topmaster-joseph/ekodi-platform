import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storePortfolioAdminPage, storePortfolioAdminPanelPage, CMPMYI_STORES, CMPMYI_ADMIN_SECTIONS, CMPMYI_COMMON_MENU } from '../store-portfolio-admin-page.js';
import platformEntry from '../platform-router-entry-worker.js';
import { storeAdminPage } from '../store-admin-engine.js';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

test('cmpmyi admin provides fixed common and brand navigation with a right workspace',async()=>{
  const response=storePortfolioAdminPage();const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-admin');
  assert.deepEqual(CMPMYI_STORES.map(x=>x.slug),['jadam','pizzamaru','yogurt']);
  for(const section of ['delivery','menu','orders','sales','inventory','customers','reviews','marketing','publishing','work','finance','connections','site','members']){
    assert.ok(CMPMYI_ADMIN_SECTIONS.some(([key])=>key===section),`missing ${section}`);
  }
  for(const view of ['overview','delivery','menu','orders','sales','customer','marketing','operations','connections']){
    assert.ok(CMPMYI_COMMON_MENU.some(([key])=>key===view),`missing common view ${view}`);
    assert.ok(html.includes(`/cmpmyi/admin/panel/${view}`));
  }
  assert.match(html,/공통관리/);
  assert.match(html,/브랜드 관리자 전체 메뉴/);
  assert.match(html,/name="cmpmyi-panel"/);
  assert.match(html,/target="cmpmyi-panel"/);
  assert.match(html,/class="panel-frame"/);
  assert.match(html,/class="portfolio-sidebar"/);
  assert.match(html,/data-cmpmyi-navigation="left-fixed"/);
  assert.doesNotMatch(html,/class="sidebar"/);
  for(const store of CMPMYI_STORES){
    assert.ok(html.includes(store.name));
    assert.ok(html.includes(`/${store.slug}/admin?embed=cmpmyi`));
    for(const section of ['delivery','menu','orders','connections']){
      assert.ok(html.includes(`/${store.slug}/admin/${section}?embed=cmpmyi`));
    }
  }
});

test('cmpmyi common panel stays same-origin frameable and exposes brand handoffs',async()=>{
  const response=storePortfolioAdminPanelPage('delivery');const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-panel');
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
  assert.match(html,/배달플랫폼 통합관리/);
  assert.match(html,/data-cmpmyi-delivery-control="brand-handoff"/);
  for(const platform of ['배달의민족','쿠팡이츠','요기요','땡겨요','먹깨비','당근 주문','네이버 주문'])assert.match(html,new RegExp(platform));
  for(const store of CMPMYI_STORES){
    assert.ok(html.includes(store.name));
    for(const section of ['delivery','menu','orders','inventory','reviews','finance','connections']){
      assert.ok(html.includes(`/${store.slug}/admin/${section}?embed=cmpmyi`));
    }
    assert.ok(html.includes(`data-delivery-brand="${store.slug}"`));
  }
  assert.match(html,/사람 승인/);
  assert.match(html,/공식 Adapter/);
  assert.match(html,/브랜드 간 데이터를 합쳐 쓰지 않습니다/);
});

test('router serves cmpmyi common panels and same-origin embedded canonical store admins',async()=>{
  const panel=await platformEntry.fetch(new Request('https://ekodi.kr/cmpmyi/admin/panel/customer'),{},{});
  assert.equal(panel.status,200);
  assert.equal(panel.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-panel');

  const embedded=await platformEntry.fetch(new Request('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi'),{},{});
  const embeddedHtml=await embedded.text();
  assert.equal(embedded.status,200);
  assert.equal(embedded.headers.get('x-ekodi-route'),'jadam-store-admin');
  assert.equal(embedded.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.equal(embedded.headers.get('x-ekodi-embedded-admin'),'cmpmyi');
  assert.match(embedded.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
  assert.match(embeddedHtml,/data-ekodi-embedded-admin="true"/);

  const direct=storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',mark:'JD',brand:'JADAM CHICKEN',pathname:'/jadam/admin/menu'});
  assert.equal(direct.status,200);
  assert.equal(direct.headers.get('x-frame-options'),'DENY');
  assert.equal(direct.headers.get('x-ekodi-embedded-admin'),'none');
});

test('aggregate store child URLs remain redirect-only aliases to store-owned admins',async()=>{
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
  assert.match(router,/storePortfolioAdminPanelPage/);
  assert.doesNotMatch(router,/resolveIntegratedStoreAdminRoute/);
});

test('guarded release probes canonical store admins and redirect-only aggregate aliases',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin')?.statuses,[200]);
  assert.deepEqual(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/overview')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/cmpmyi/admin/panel/overview')?.headerExpect.includes('x-frame-options: SAMEORIGIN'));
  assert.deepEqual(byUrl.get('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi')?.statuses,[200]);
  assert.ok(byUrl.get('https://ekodi.kr/jadam/admin/menu?embed=cmpmyi')?.headerExpect.includes('x-ekodi-embedded-admin: cmpmyi'));
  for(const slug of ['jadam','pizzamaru','yogurt']){
    const canonical=byUrl.get(`https://ekodi.kr/${slug}/admin`);assert.deepEqual(canonical?.statuses,[200]);
    const alias=byUrl.get(`https://ekodi.kr/cmpmyi/admin/${slug}`);assert.deepEqual(alias?.statuses,[308]);
    assert.ok(alias?.headerExpect.includes(`location: https://ekodi.kr/${slug}/admin`));
  }
});
