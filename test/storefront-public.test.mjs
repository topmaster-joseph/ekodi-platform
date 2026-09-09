import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderStorefrontPage, storefrontCss } from '../storefront-page.js';
import { storeAdminScript } from '../store-admin-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PizzaMaru public storefront is customer-first and management-free',async()=>{
  const response=await renderStorefrontPage(
    new Request('https://ekodi.kr/pizzamaru'),{},
    {profile:{name:'피자마루 목포대점',theme:'pizzamaru',description:'피자마루 목포대점'}},'pizzamaru'
  );
  const html=await response.text();
  for(const value of ['피자마루','목포대점','메뉴·가격 보기','전화하기','지도 보기','배달앱 주문','061-453-8295'])assert.match(html,new RegExp(value));
  for(const value of ['운영공간','내 홈','로그아웃','USER OPERATIONS','STORE MASTER','0 / 3','미연결'])assert.doesNotMatch(html,new RegExp(value));
  assert.match(html,/\/_ekodi\/space\/storefront\.css/);
  assert.doesNotMatch(html,/<script/i);
});

test('PizzaMaru storefront renders verified image, app prices, and direct order links',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({store:{name:'피자마루 목포대점',address:'전남 무안군 청계면 승달산길 37-1 1층',phone:'061-453-8295'},channels:[{provider:'baemin',display_name:'배달의민족',order_url:'https://example.com/baemin'}],menu:[{name:'콤비네이션 피자',category:'클래식',description:'베스트셀러',base_price:12900,source_basis:'brand_official',image_url:'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154437.jpg',listings:[{provider:'ddangyo',display_name:'땡겨요',price:14900,image_url:'https://example.com/menu.jpg',order_url:'https://example.com/ddangyo'},{provider:'baemin',display_name:'배달의민족',price:15900,order_url:'https://example.com/baemin'},{provider:'yogiyo',display_name:'요기요',price:16900},{provider:'mukkebi',display_name:'먹깨비',price:14900}]}]}),{status:200,headers:{'content-type':'application/json'}});
  try{
    const response=await renderStorefrontPage(new Request('https://ekodi.kr/pizzamaru'),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'},{profile:{name:'피자마루 목포대점',theme:'pizzamaru'}},'pizzamaru');
    const html=await response.text();
    for(const value of ['콤비네이션 피자','12,900원','14,900원','15,900원','16,900원','땡겨요','배달의민족','요기요','먹깨비','앱 최저'])assert.match(html,new RegExp(value));
    assert.match(html,/<img[^>]+https:\/\/example\.com\/menu\.jpg/);
    assert.match(html,/https:\/\/example\.com\/ddangyo/);
  }finally{globalThis.fetch=originalFetch}
});
test('storefront stylesheet supports image menu cards and platform prices',async()=>{
  const response=storefrontCss();
  assert.match(response.headers.get('content-type'),/text\/css/);
  const css=await response.text();
  for(const marker of ['.hero','.mobile','.menu-card','.menu-media img','.platform-price','.lowest'])assert.match(css,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('platform-menu migration exposes verified public listings and protected imports',async()=>{
  const migration=await read('supabase/migrations/20260909012000_platform_menu_storefront.sql');
  for(const value of ['ddangyo','mukkebi','brand_official','store_user_site_public_snapshot','store_user_site_admin_snapshot_v2','update_storefront_public_settings_v2','import_store_platform_menu_snapshot','image_url','public_order_url','listed_price'])assert.match(migration,new RegExp(value));
  for(const value of ['이탈리안 치즈 피자','페퍼로니 피자','콤비네이션 피자','포테이토 피자','꿀고구마 피자','불고기 피자'])assert.match(migration,new RegExp(value));
  assert.match(migration,/auth\.uid\(\) is null/);
  assert.match(migration,/can_manage_store_user_site/);
  assert.match(migration,/grant execute on function public\.store_user_site_public_snapshot\(text\) to anon, authenticated/);
  assert.match(migration,/revoke all on function public\.import_store_platform_menu_snapshot[\s\S]*from public, anon/);
});

test('admin manages seven delivery URLs and verified platform menu snapshots',async()=>{
  const js=await storeAdminScript().text();
  for(const value of ['고객 공개정보 · 주문 연결','땡겨요 주문 URL','배달의민족 주문 URL','요기요 주문 URL','먹깨비 주문 URL','쿠팡이츠 주문 URL','당근주문 URL','네이버주문 URL','update_storefront_public_settings_v3','store_user_site_admin_snapshot_v2','배달플랫폼 메뉴 스냅샷 등록','import_store_platform_menu_snapshot'])assert.match(js,new RegExp(value));
  for(const value of ['배달플랫폼 연결','기준메뉴','가격차이','플랫폼 등록상태','데이터 출처','공식연결 상태'])assert.match(js,new RegExp(value));
});

test('platform router does not add member chrome to customer storefronts',async()=>{
  const router=await read('platform-router-entry-worker.js');
  assert.match(router,/x-ekodi-route'\)==='space-storefront'/);
  assert.match(router,/x-ekodi-public-surface','customer-storefront'/);
  assert.match(router,/storefront\.css/);
});

test('Jadam Mokpo storefront is customer-first, brand-specific, and platform-ready',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    store:{name:'자담치킨 목포대점',address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295'},
    channels:[],
    menu:[{name:'후라이드치킨',category:'치킨',base_price:19000,source_basis:'operator_verified',listings:[
      {provider:'ddangyo',display_name:'땡겨요',price:19000},{provider:'baemin',display_name:'배달의민족',price:20000},
      {provider:'yogiyo',display_name:'요기요',price:20000},{provider:'mukkebi',display_name:'먹깨비',price:19000}
    ]}]
  }),{status:200,headers:{'content-type':'application/json'}});
  try{
    const response=await renderStorefrontPage(new Request('https://ekodi.kr/jadam'),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'},{profile:{name:'자담치킨 목포대점',theme:'jadam'}},'jadam');
    const html=await response.text();
    for(const value of ['자담치킨','목포대점','승달산길 37-1','061-453-8295','메뉴·가격 보기','배달앱 주문','땡겨요','배달의민족','요기요','먹깨비','JD'])assert.match(html,new RegExp(value));
    for(const value of ['USER OPERATIONS','STORE MASTER','로그아웃','운영공간'])assert.doesNotMatch(html,new RegExp(value));
    const css=await storefrontCss().text();
    assert.match(css,/data-store-page=\"jadam\"/);
    assert.match(css,/#174f2c/);
  }finally{globalThis.fetch=originalFetch}
});
