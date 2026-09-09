import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storeAdminScript} from '../store-admin-engine.js';

const migration=readFileSync(new URL('../supabase/migrations/20260909020000_delivery_commerce_admin.sql',import.meta.url),'utf8');
const sync=readFileSync(new URL('../supabase/functions/delivery-commerce-sync/index.ts',import.meta.url),'utf8');
const providers=['ddangyo','baemin','yogiyo','mukkebi','coupang_eats','daangn','naver_order'];

test('delivery commerce schema is store scoped and excludes customer PII',()=>{
  for(const marker of ['store_delivery_orders','store_delivery_reviews','store_delivery_actions','store_delivery_commerce_snapshot','queue_store_delivery_action','save_store_delivery_review_reply'])assert.match(migration,new RegExp(marker));
  for(const provider of providers)assert.match(migration,new RegExp(`'${provider}'`));
  assert.match(migration,/can_manage_store_user_site\(v_store_id\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.store_delivery_orders from public,anon,authenticated/);
  assert.doesNotMatch(migration,/customer_phone|customer_address/);
});

test('each store admin manages platform menu orders sales reviews and replies',async()=>{
  const js=await storeAdminScript().text();
  for(const label of ['배달플랫폼 메뉴 스냅샷 등록','배달주문 · 채널 관리','배달플랫폼 리뷰 · 답글 관리','매출 통합','배달플랫폼 연결관리','당근주문','네이버주문'])assert.match(js,new RegExp(label));
  for(const rpc of ['import_store_platform_menu_snapshot_v2','store_delivery_commerce_snapshot','queue_store_delivery_action','save_store_delivery_review_reply','update_storefront_public_settings_v3'])assert.match(js,new RegExp(rpc));
  assert.match(js,/state\.commerce/);
});
