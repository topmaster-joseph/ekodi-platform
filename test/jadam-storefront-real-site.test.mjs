import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderStorefrontPage, storefrontCss } from '../storefront-page.js';
import { storeAdminScript } from '../store-admin-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Jadam real storefront follows the approved customer-first composition',async()=>{
  const response=await renderStorefrontPage(
    new Request('https://ekodi.kr/jadam'),{},
    {profile:{name:'자담치킨 목포대점',theme:'jadam'}},'jadam'
  );
  const html=await response.text();
  for(const value of [
    '자담치킨 목포대점','자연을 담은 건강한 치킨','국립목포대학교 후문 대표 치킨',
    '대표 메뉴','배달앱에서 주문하기','매장정보','본사 메뉴 보기',
    '전남 무안군 청계면 승달산길 37-1','061-453-8295'
  ])assert.match(html,new RegExp(value));
  for(const value of ['땡겨요','배달의민족','요기요','먹깨비','당근 주문','네이버 주문'])assert.match(html,new RegExp(value));
  assert.match(html,/20260909-jadam-real-v2/);
  assert.doesNotMatch(html,/USER OPERATIONS|STORE MASTER|로그아웃/);
});test('Jadam storefront shows reference prices without inventing store-specific app links',async()=>{
  const response=await renderStorefrontPage(
    new Request('https://ekodi.kr/jadam'),{},
    {profile:{name:'자담치킨 목포대점',theme:'jadam'}},'jadam'
  );
  const html=await response.text();
  for(const value of ['후라이드치킨','21,000원','맵슐랭치킨','23,000원','허니팝치킨','3반치킨세트','33,000원'])assert.match(html,new RegExp(value));
  assert.match(html,/2026 공개 참고가/);
  assert.match(html,/주요 배달앱 공개 참고가/);
  assert.match(html,/주문 링크 확인 중/);
  assert.doesNotMatch(html,/example\.com/);
});

test('verified Mokpo store snapshot replaces reference data and activates exact order links',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    store:{address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295',business_hours:{display:'11:00 - 22:00'}},
    channels:[{provider:'daangn_order',display_name:'당근 주문',order_url:'https://example.com/daangn'}],
    menu:[{name:'후라이드치킨',base_price:21500,source_basis:'operator_verified',listings:[{provider:'baemin',price:23500,order_url:'https://example.com/baemin'}]}]
  }),{status:200,headers:{'content-type':'application/json'}});
  try{
    const response=await renderStorefrontPage(new Request('https://ekodi.kr/jadam'),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'},{profile:{name:'자담치킨 목포대점',theme:'jadam'}},'jadam');
    const html=await response.text();
    for(const value of ['21,500원','23,500원','https://example.com/baemin','https://example.com/daangn','목포대점 확인'])assert.match(html,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }finally{globalThis.fetch=originalFetch}
});test('Jadam storefront CSS matches the approved desktop and mobile structure',async()=>{
  const css=await storefrontCss().text();
  for(const marker of ['.jd-hero','.jd-values','.jd-grid','.jd-menu-list','.jd-providers','.jd-provider.daangn','.jd-provider.naver','.jd-store','.jd-mobile'])assert.match(css,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(css,/main_visual_0713_01\.jpg/);
});

test('store admin manages Daangn and Naver order URLs through v3 RPCs',async()=>{
  const js=await storeAdminScript().text();
  for(const value of ['당근 주문 URL','네이버 주문 URL','daangn_order_url','naver_order_url','update_storefront_public_settings_v3','store_user_site_admin_snapshot_v3'])assert.match(js,new RegExp(value));
});

test('order channel v3 migration safely expands provider constraints',async()=>{
  const sql=await read('supabase/migrations/20260909013000_storefront_order_channels_v3.sql');
  for(const value of ['daangn_order','naver_order','당근 주문','네이버 주문','store_user_site_admin_snapshot_v3','update_storefront_public_settings_v3'])assert.match(sql,new RegExp(value));
  assert.match(sql,/invalid_public_order_url/);
  assert.match(sql,/manual_verified/);
  assert.match(sql,/grant execute on function public\.update_storefront_public_settings_v3/);
});