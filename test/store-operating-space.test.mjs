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
  assert.match(worker,/yogurt:\{documentTitle:'요거트퍼플 목포대점 · EKODI'/);
  assert.match(worker,/PIZZA STORE USER PAGE/);
  assert.match(worker,/YOGURT DESSERT USER PAGE/);
  assert.match(worker,/yogurtpurple->yogurt/);
  assert.match(worker,/pageProfile\(url\.pathname\)/);
  assert.match(html,/__SPACE_PAGE_NAME__/);
  assert.match(html,/storePageStats/);
  assert.match(app,/renderStorePageOverview/);
  assert.match(css,/data-store-page="pizzamaru"/);
  assert.match(css,/data-store-page="yogurt"/);
});

test('production smoke covers each store user page separately',()=>{
  assert.match(manifest,/https:\/\/ekodi\.kr\/jadam/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/pizzamaru/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/yogurt/);
  assert.match(manifest,/yogurtpurple/);
  assert.match(manifest,/피자마루 목포대점/);
  assert.match(manifest,/요거트퍼플 목포대점/);
  assert.match(manifest,/USER OPERATIONS/);
});

test('Space worker renders PizzaMaru and YogurtPurple as distinct user pages',async()=>{
  const env={DATA_ENABLED:'false',ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})}};
  for(const [path,name,theme] of [
    ['/pizzamaru','피자마루 목포대점','pizzamaru'],
    ['/yogurt','요거트퍼플 목포대점','yogurt'],
  ]){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);
    const body=await response.text();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-route'),'space-workspace');
    assert.ok(body.includes(name));
    assert.ok(body.includes(`data-store-page="${theme}"`));
    assert.doesNotMatch(body,/__SPACE_PAGE_/);
  }
  const alias=await spaceWorker.fetch(new Request('https://ekodi.kr/yogurtpurple'),env);
  assert.equal(alias.status,308);
  assert.equal(alias.headers.get('location'),'https://ekodi.kr/yogurt');
});
