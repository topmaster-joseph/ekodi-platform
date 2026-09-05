import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [migration,api,app,html,css]=await Promise.all([
  read('supabase/migrations/20260906001000_store_operating_spaces.sql'),
  read('supabase/functions/workspace-api/index.ts'),
  read('space/app.js'),read('space/index.html'),read('space/style.css')
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
