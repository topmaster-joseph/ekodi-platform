import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [migration,api,worker,app,html,css,manifest]=await Promise.all([
  read('supabase/migrations/20260906001000_store_operating_spaces.sql'),
  read('supabase/functions/workspace-api/index.ts'),
  read('space-worker.js'),read('space/app.js'),read('space/index.html'),read('space/style.css'),
  read('deploy/manifests/space.worker.json')
]);

test('Mokpo University stores have three independent root operating-space routes',()=>{
  assert.match(migration,/operating_space_slug = 'jadam'[\s\S]*jadam-mokpo-univ/);
  assert.match(migration,/pizzamaru-mokpo-univ/);
  assert.match(migration,/yogurtpurple-mokpo-univ/);
  for(const slug of ['jadam','pizzamaru','yogurt'])assert.ok(migration.includes(`'${slug}'`));
  assert.match(migration,/stores_operating_space_slug_uq/);
  assert.match(migration,/current_store_operating_spaces/);
});
test('canonical menu and delivery listings keep verified external data separate',()=>{
  for(const table of ['store_channel_profiles','store_menu_items','store_channel_menu_listings'])assert.ok(migration.includes(`public.${table}`));
  assert.match(migration,/official_api','partner_import','verified_file','manual_verified/);
  assert.match(migration,/external_channel_policy', 'official-contract-only'/);
  assert.match(migration,/synthetic_menu_data', false/);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.store_menu_items/i);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.store_channel_menu_listings/i);
});

test('workspace API resolves store workspaces and exposes a guarded store dashboard',()=>{
  assert.match(api,/current_store_operating_spaces/);
  assert.match(api,/store_operating_space_snapshot/);
  assert.match(api,/\/spaces\/store-dashboard/);
  assert.match(api,/store_members\+RLS/);
  assert.match(api,/official-contract-only/);
  assert.doesNotMatch(api,/resolveTenantSpace/);
  assert.match(api,/const slug=separator>0\?workspaceKey\.slice\(separator\+1\):workspaceKey/);
  assert.match(api,/resolveOperatingSpace\(auth\.db,auth\.user\.id,slug\)/);
});

test('store route UI is an operating dashboard rather than a generic landing hero',()=>{
  assert.doesNotMatch(html,/내가 운영하고 참여하는/);
  assert.match(html,/STORE MASTER/);
  assert.match(html,/SALES CHANNELS/);
  assert.match(html,/MENU MASTER/);
  assert.match(app,/배달플랫폼/);
  assert.match(app,/플랫폼별 가격 차이/);
  assert.match(css,/\.workspace-head/);
  assert.doesNotMatch(css,/position:fixed[^}]*black/i);
});

test('production smoke manifest follows the current store dashboard shell',()=>{
  assert.match(manifest,/STORE MASTER/);
  assert.match(manifest,/MENU MASTER/);
  assert.doesNotMatch(manifest,/실제 데이터·권한 연결/);
});

test('PizzaMaru and YogurtPurple get dedicated user-page profiles',()=>{
  assert.match(worker,/pizzamaru:\{documentTitle:'피자마루 목포대점 · EKODI'/);
  assert.match(worker,/yogurt:\{documentTitle:'요거트퍼플 목포대점 · 메뉴 · 배달주문'/);
  assert.match(worker,/PIZZA STORE USER PAGE/);
  assert.match(worker,/YOGURT PURPLE · MOKPO UNIVERSITY/);
  assert.doesNotMatch(worker,/yogurtpurple->yogurt/);
  assert.match(worker,/pageProfile\(url\.pathname,env\)/);
  assert.match(html,/__SPACE_PAGE_NAME__/);
  assert.match(html,/storePageStats/);
  assert.match(app,/renderStorePageOverview/);
  assert.match(css,/data-store-page="pizzamaru"/);
  assert.match(css,/data-store-page="yogurt"/);assert.match(css,/\.yp-mobile-dock/);assert.match(css,/\.yp-local-strip/);assert.match(html,/id="mobilePhone"/);assert.match(html,/www\.yogurtpurple\.com/);
});

test('production smoke covers each store user page and stylesheet separately',()=>{
  assert.match(manifest,/https:\/\/ekodi\.kr\/jadam/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/pizzamaru/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/yogurt/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/_ekodi\/space\/storefront\.css/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/yogurtpurple/);
  assert.match(manifest,/"statuses": \[410\]/);
  assert.match(manifest,/피자마루 목포대점/);
  assert.match(manifest,/요거트퍼플 목포대점/);
  assert.match(manifest,/메뉴·가격 보기/);
  assert.match(manifest,/space-storefront/);
});

test('Space worker renders PizzaMaru and YogurtPurple as distinct styled user pages',async()=>{
  const env={DATA_ENABLED:'false',ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})}};
  for(const [path,name,theme] of [
    ['/pizzamaru','피자마루 목포대점','pizzamaru'],
    ['/yogurt','요거트퍼플 목포대점','yogurt'],
  ]){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);
    const body=await response.text();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-route'),'space-storefront');
    assert.ok(body.includes(name));
    assert.ok(body.includes(`data-store-page="${theme}"`));
    const expectedCssVersion=theme==='yogurt'?'20260912-yogurt-v4':'20260911-v2';
    assert.ok(body.includes(`/_ekodi/space/storefront.css?v=${expectedCssVersion}`));
    assert.doesNotMatch(body,/__SPACE_PAGE_/);
    if(theme==='yogurt'){assert.match(body,/대표메뉴/);assert.match(body,/전체메뉴 자세히 보기/);assert.match(body,/본사 공식 메뉴 166종/);assert.match(body,/new_img58\.png/);assert.match(body,/배달앱에서 바로 주문/);assert.doesNotMatch(body,/USER OPERATIONS|STORE MASTER|로그아웃/);}
  }
  const styleResponse=await spaceWorker.fetch(new Request('https://space.ekodi.kr/storefront.css'),env);
  const styleBody=await styleResponse.text();
  assert.equal(styleResponse.status,200);
  assert.equal(styleResponse.headers.get('x-ekodi-route'),'storefront-asset');
  assert.match(styleBody,/\.rs-hero/);
  assert.match(styleBody,/--yogurt-hero-polish:1/);
  assert.match(styleBody,/\.rs-menu-card/);
  const legacyPizza=await spaceWorker.fetch(new Request('https://ekodi.kr/pizzamaru/mokpodae?from=legacy'),env);
  assert.equal(legacyPizza.status,308);
  assert.equal(legacyPizza.headers.get('location'),'https://ekodi.kr/pizzamaru?from=legacy');
  assert.equal(legacyPizza.headers.get('x-ekodi-workspace-alias'),'pizzamaru/mokpodae->pizzamaru');
  const removed=await spaceWorker.fetch(new Request('https://ekodi.kr/yogurtpurple'),env);
  assert.equal(removed.status,410);
  assert.equal(removed.headers.get('location'),null);
  assert.equal(removed.headers.get('x-ekodi-route'),'space-gone');
});

test('Yogurt storefront publishes only customer-safe store projection without login',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({slug:'yogurt',name:'요거트퍼플 목포대점',address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295',business_hours:{display:'11:00–22:00'},channels:[{provider:'baemin',display_name:'배달의민족',direct_url:null}],menu:[]}),{status:200,headers:{'content-type':'application/json'}});
  try{
    const response=await spaceWorker.fetch(new Request('https://space.ekodi.kr/storefront.json?slug=yogurt'),{DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test',ASSETS:{fetch:async()=>new Response('')}});
    const data=await response.json();assert.equal(response.status,200);assert.equal(data.slug,'yogurt');assert.equal(data.phone,'061-453-8295');assert.equal('role' in data,false);assert.equal('email' in data,false);
  }finally{globalThis.fetch=originalFetch}
});

test('Yogurt Mokpo storefront uses HQ imagery, representative menu, full catalog, and priority delivery apps',async()=>{
  const env={DATA_ENABLED:'false',ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})}};
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/yogurt'),env);
  const body=await response.text();
  for(const marker of ['땡겨요','배달의민족','요기요','먹깨비'])assert.match(body,new RegExp(marker));
  for(const marker of ['플레인요거트아이스크림','딸기요아츄','허니그래놀라','플레인 그릭','딸기스무디볼','딸기요거와상'])assert.match(body,new RegExp(marker));
  assert.match(body,/본사 공식 메뉴 166종/);
  assert.match(body,/전체메뉴 자세히 보기/);
  assert.ok(body.includes('https://www.yogurtpurple.com/web/image_new/new_img58.png'));
  assert.match(body,/본사 등록명 ‘무안목포대점’/);
});
