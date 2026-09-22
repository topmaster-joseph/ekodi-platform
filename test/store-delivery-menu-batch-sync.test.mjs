import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeAdminScript, storeAdminCanAccess } from '../store-admin-engine.js';

const migration=await readFile(new URL('../supabase/migrations/20260922224000_store_delivery_menu_batch_sync.sql',import.meta.url),'utf8');

test('canonical menu batch queue fans one menu change out to selected mapped platform listings',()=>{
  assert.match(migration,/store_platform_menu_batch_queue/);
  assert.match(migration,/p_menu_item_id uuid/);
  assert.match(migration,/p_providers text\[\]/);
  assert.match(migration,/l\.menu_item_id=p_menu_item_id/);
  assert.match(migration,/external_item_ref is not null/);
  assert.match(migration,/cardinality\(v_requested\)=0/);
  assert.match(migration,/l\.provider=any\(v_requested\)/);
  assert.match(migration,/canonical_menu_batch/);
  assert.match(migration,/baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order/);
});

test('batch queue preserves human approval and official-adapter execution boundaries',()=>{
  assert.match(migration,/v_action not in \('price','available','sold_out','hidden'\)/);
  assert.match(migration,/source_kind='official_api'/);
  assert.match(migration,/needs_connection/);
  assert.match(migration,/user_approved/);
  assert.match(migration,/v_queued/);
  assert.match(migration,/v_needs_connection/);
  assert.match(migration,/public\.can_manage_store_user_site/);
  assert.doesNotMatch(migration,/update\s+public\.store_channel_menu_listings/i);
});

test('store menu admin exposes multi-platform price, sale, sold-out and hide controls',async()=>{
  assert.equal(storeAdminCanAccess('store_owner','menu'),true);
  const script=await storeAdminScript().text();
  assert.match(script,/통합 메뉴 일괄관리/);
  assert.match(script,/data-batch-provider/);
  assert.match(script,/data-batch-menu-action="price"/);
  assert.match(script,/data-batch-menu-action="available"/);
  assert.match(script,/data-batch-menu-action="sold_out"/);
  assert.match(script,/data-batch-menu-action="hidden"/);
  assert.match(script,/store_platform_menu_batch_queue/);
  assert.match(script,/p_menu_item_id/);
  assert.match(script,/p_providers/);
  assert.match(script,/공식 쓰기 어댑터/);
});


test('menu actions fail closed until a provider has a real official write connection',async()=>{
  const script=await storeAdminScript().text();
  assert.match(script,/function providerWriteReady/);
  assert.match(script,/source_kind==='official_api'/);
  assert.match(script,/function deliveryMenuReadiness/);
  assert.match(script,/실제 쓰기 연결 0개/);
  assert.match(script,/플랫폼 메뉴 매핑 없음/);
  assert.match(script,/기준메뉴 원장 없음/);
  assert.match(script,/data-batch-provider value=.*disabled/);
  assert.match(script,/checked:not\(:disabled\)/);
  assert.match(script,/공식 쓰기 연결 필요/);
  assert.match(script,/쓰기 가능/);
  assert.match(script,/파트너 필요/);
  assert.match(script,/연결 전에는 실제 메뉴 변경을 성공으로 표시하지 않습니다/);
});
