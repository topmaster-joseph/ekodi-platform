import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderStorefrontPage, storefrontCss } from '../storefront-page.js';
import { storeAdminScript } from '../store-admin-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PizzaMaru public storefront is customer-first and management-free',async()=>{
  const response=await renderStorefrontPage(
    new Request('https://ekodi.kr/pizzamaru'),
    {},
    {profile:{name:'피자마루 목포대점',theme:'pizzamaru',description:'피자마루 목포대점'}},
    'pizzamaru'
  );
  const html=await response.text();
  for(const value of ['피자마루','목포대점','메뉴 보기','전화하기','지도 보기','주문하기','061-453-8295'])assert.match(html,new RegExp(value));
  for(const value of ['운영공간','내 홈','로그아웃','USER OPERATIONS','STORE MASTER','0 / 3','미연결'])assert.doesNotMatch(html,new RegExp(value));
  assert.match(html,/\/_ekodi\/space\/storefront\.css/);
  assert.doesNotMatch(html,/<script/i);
});

test('storefront stylesheet is an external self-hosted asset',async()=>{
  const response=storefrontCss();
  assert.match(response.headers.get('content-type'),/text\/css/);
  const css=await response.text();
  assert.match(css,/\.hero/);
  assert.match(css,/\.mobile/);
});

test('public snapshot exposes only public storefront projection',async()=>{
  const migration=await read('supabase/migrations/20260909003000_storefront_public_snapshot.sql');
  assert.match(migration,/store_user_site_public_snapshot/);
  assert.match(migration,/public_order_url/);
  assert.match(migration,/platform_verified/);
  assert.match(migration,/operator_verified/);
  assert.match(migration,/pos_verified/);
  assert.match(migration,/grant execute on function public\.store_user_site_public_snapshot\(text\) to anon, authenticated/);
  assert.match(migration,/update_storefront_public_settings/);
});

test('admin site editor manages public address phone and delivery URLs',async()=>{
  const js=await storeAdminScript().text();
  for(const value of ['고객 공개정보 · 주문 연결','매장 주소','전화번호','배달의민족 주문 URL','쿠팡이츠 주문 URL','요기요 주문 URL','update_storefront_public_settings'])assert.match(js,new RegExp(value));
  for(const value of ['배달플랫폼 연결','기준메뉴','가격차이','플랫폼 등록상태','데이터 출처','공식연결 상태'])assert.match(js,new RegExp(value));
});

test('platform router does not add member chrome to customer storefronts',async()=>{
  const router=await read('platform-router-entry-worker.js');
  assert.match(router,/x-ekodi-route'\)==='space-storefront'/);
  assert.match(router,/x-ekodi-public-surface','customer-storefront'/);
  assert.match(router,/storefront\.css/);
});