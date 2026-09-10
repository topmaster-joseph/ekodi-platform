import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storePortfolioAdminPage, CMPMYI_STORES, CMPMYI_ADMIN_SECTIONS } from '../store-portfolio-admin-page.js';
import { storePortfolioAdminAuthScript } from '../store-portfolio-admin-auth.js';
import { isIntegratedStoreAdminPathShape, resolveIntegratedStoreAdminRoute, storeAdminPage } from '../store-admin-engine.js';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
test('cmpmyi admin is the three-store operations entry hub',async()=>{
  const response=storePortfolioAdminPage();const html=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-store-portfolio-admin');
  assert.equal(response.headers.get('x-ekodi-authority-scope'),'platform-entry');
  assert.deepEqual(CMPMYI_STORES.map(x=>x.slug),['jadam','pizzamaru','yogurt']);
  assert.ok(CMPMYI_ADMIN_SECTIONS.some(([section])=>section==='reviews'));
  for(const store of CMPMYI_STORES){assert.ok(html.includes(store.name));assert.ok(html.includes(`/cmpmyi/admin/${store.slug}/menu`));}
  assert.match(html,/id="portfolioLogin"/);assert.match(html,/id="portfolioContent" class="wrap" hidden/);
  assert.match(html,/Google 계정으로 계속/);assert.match(html,/\/store-portfolio-admin\.js\?v=20260910-sso-v1/);
});

test('cmpmyi portfolio and store admins share one central Google session while preserving store authorization',async()=>{
  const script=await storePortfolioAdminAuthScript().text();
  assert.match(script,/ekodi-store-admin-session/);assert.match(script,/ekodi-cmpmyi-admin-session/);
  assert.match(script,/new URL\('\/auth\/',location.origin\)/);assert.match(script,/site','space/);
  assert.match(script,/\/auth\/v1\/user/);assert.match(script,/portfolioContent/);
  assert.match(router,/storePortfolioAdminAuthScript/);assert.match(router,/url.pathname==='\/store-portfolio-admin\.js'/);
});

test('integrated deep routes reuse the store admin engine without merging tenant authority',async()=>{
  assert.equal(isIntegratedStoreAdminPathShape('/cmpmyi/admin/jadam'),true);
  assert.equal(isIntegratedStoreAdminPathShape('/cmpmyi/admin/pizzamaru/reviews'),true);
  const profile=await resolveIntegratedStoreAdminRoute('/cmpmyi/admin/jadam',()=>{throw new Error('bootstrap profile must not fetch')});
  assert.equal(profile.portfolio,true);assert.equal(profile.adminBase,'/cmpmyi/admin/jadam');
  const response=storeAdminPage(profile);const html=await response.text();
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-jadam-store-admin');
  assert.equal(response.headers.get('x-ekodi-authority-scope'),'tenant');
  assert.match(html,/data-ekodi-store-portfolio="cmpmyi"/);assert.match(html,/\/cmpmyi\/admin\/pizzamaru/);
});

test('super administrator navigation exposes the integrated store hub under Spaces',()=>{
  const item=ADMIN_MENU_REGISTRY.find(row=>row.id==='cmpmyi');
  assert.ok(item);assert.equal(item.group,'space');assert.equal(item.superAdminOnly,true);
  assert.equal(item.href,'https://ekodi.kr/cmpmyi/admin');
  assert.equal(item.labels.ko,'통합 매장 운영');
  assert.match(router,/storePortfolioAdminPage/);
  assert.match(router,/resolveIntegratedStoreAdminRoute/);
});
test('guarded release probes cmpmyi public, compatibility and all three admin routes',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(row=>[row.url,row]));
  const cmpmyi=byUrl.get('https://ekodi.kr/cmpmyi');
  const stores=byUrl.get('https://ekodi.kr/stores');
  const portfolio=byUrl.get('https://ekodi.kr/cmpmyi/admin');
  const portfolioAuth=byUrl.get('https://ekodi.kr/store-portfolio-admin.js');
  assert.deepEqual(cmpmyi?.statuses,[200]);assert.equal(cmpmyi?.rollbackVerify,false);
  assert.deepEqual(stores?.statuses,[308]);assert.equal(stores?.rollbackVerify,false);
  assert.deepEqual(portfolio?.statuses,[200]);assert.equal(portfolio?.rollbackVerify,false);
  assert.ok(portfolio.headerExpect.includes('x-ekodi-route: cmpmyi-store-portfolio-admin'));
  assert.ok(portfolio.expect.includes('통합 관리자 로그인'));assert.deepEqual(portfolioAuth?.statuses,[200]);assert.ok(portfolioAuth.expect.includes('/auth/v1/user'));
  for(const slug of ['jadam','pizzamaru','yogurt']){
    const row=byUrl.get(`https://ekodi.kr/cmpmyi/admin/${slug}`);assert.deepEqual(row?.statuses,[200]);
    assert.ok(row.headerExpect.includes(`x-ekodi-route: cmpmyi-${slug}-store-admin`));
  }
});