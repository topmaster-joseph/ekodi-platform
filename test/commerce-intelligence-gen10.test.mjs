import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  COMMERCE_PROVIDER_ORDER,COMMERCE_CONNECTION_PRIORITY,COMMERCE_GEN10_POLICY,
  defaultCommerceCapabilities,effectiveCommerceCapabilities,canExecuteCommerceAction,
  buildCommerceLearningEvent,sanitizeCommerceLearningSignal,
} from '../commerce-intelligence-engine.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const migration=await read('supabase/migrations/20260909210500_commerce_intelligence_gen10.sql');
const admin=await read('store-admin-engine.js');

test('Gen10 supports the store delivery/order providers without collapsing tenant identity',()=>{
  assert.deepEqual(COMMERCE_PROVIDER_ORDER,['baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order']);
  for(const provider of COMMERCE_PROVIDER_ORDER)assert.match(migration,new RegExp(`'${provider}'`));
  assert.match(migration,/store_id uuid not null references public\.stores\(id\) on delete cascade/);
  assert.match(migration,/public\.can_manage_store_user_site\(v_store_id\)/);
});

test('connection priority is official/merchant first and discovery remains read-only',()=>{
  assert.deepEqual(COMMERCE_CONNECTION_PRIORITY,['official_api','merchant_connection','partner_import','public_discovery','manual_verified']);
  assert.equal(defaultCommerceCapabilities('official_api').review_reply,true);
  assert.equal(defaultCommerceCapabilities('merchant_connection').menu_write,true);
  assert.equal(defaultCommerceCapabilities('partner_import').orders_read,true);
  assert.equal(defaultCommerceCapabilities('partner_import').review_reply,false);
  assert.equal(defaultCommerceCapabilities('public_discovery').store_read,true);
  assert.equal(defaultCommerceCapabilities('public_discovery').sales_read,false);
  assert.equal(defaultCommerceCapabilities('public_discovery').menu_write,false);
  assert.equal(COMMERCE_GEN10_POLICY.secretsInBrowser,false);
  assert.equal(COMMERCE_GEN10_POLICY.publicDiscoveryWritable,false);
});

test('declared provider capabilities cannot promote a read-only discovery lane into write access',()=>{
  const caps=effectiveCommerceCapabilities({connection_mode:'public_discovery',capabilities:{menu_write:true,review_reply:true,menu_read:true}});
  assert.equal(caps.menu_read,true);
  assert.equal(caps.menu_write,false);
  assert.equal(caps.review_reply,false);
  assert.equal(canExecuteCommerceAction({connection_mode:'public_discovery',capabilities:{review_reply:true}},'review_reply'),false);
  assert.equal(canExecuteCommerceAction({connection_mode:'official_api',capabilities:{review_reply:true}},'review_reply'),true);
});

test('orders, sales and reviews have store-scoped ledgers and human-gated action queue',()=>{
  for(const table of ['store_platform_orders','store_platform_reviews','store_platform_action_queue','store_platform_sync_runs','store_commerce_learning_events']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration,new RegExp(`${table}[^]*enable row level security`));
  }
  assert.match(migration,/requires_human_approval boolean not null default true/);
  assert.match(migration,/action_kind in \('store_update','menu_update','sync_orders','sync_sales','sync_reviews','review_reply','order_action'\)/);
  assert.match(migration,/save_store_review_reply/);
  assert.match(migration,/queue_store_platform_action/);
});

test('manager imports cannot self-label data as official API observations',()=>{
  assert.match(migration,/manager_import_source_not_allowed/);
  assert.match(migration,/v_source not in \('partner_import','verified_file','manual_verified'\)/);
  assert.match(migration,/source_kind in \('official_api','partner_import','verified_file','manual_verified'\)/);
});

test('commerce learning strips credentials and customer identity-like payloads',()=>{
  const safe=sanitizeCommerceLearningSignal({menu_count:12,token:'x',authorization:'Bearer x',phone:'010',customer_name:'Kim',price_delta:500});
  assert.deepEqual(safe,{menu_count:12,price_delta:500});
  const event=buildCommerceLearningEvent({storeId:'store-1',provider:'baemin',eventType:'mapping_verified',signal:{mapping_accuracy:.94,secret:'nope'},confidence:2,outcome:'verified'});
  assert.equal(event.confidence,1);
  assert.deepEqual(event.signal,{mapping_accuracy:.94});
  assert.equal('secret' in event.signal,false);
  assert.match(migration,/signal::text !~\* '\(token\|secret\|password\|authorization\|cookie\|phone\|address\|customer_name\|email\)'/);
});

test('current shared store admin already exposes menu, orders, sales, reviews and connection surfaces for every tenant',()=>{
  assert.match(admin,/\['orders','주문 · 채널'\]/);
  assert.match(admin,/\['menu','메뉴 · 가격'\]/);
  assert.match(admin,/\['sales','매출'\]/);
  assert.match(admin,/\['reviews','리뷰'\]/);
  assert.match(admin,/\['connections','연결관리'\]/);
  assert.match(admin,/배달플랫폼/);
  assert.match(admin,/import_store_platform_menu_snapshot/);
});
