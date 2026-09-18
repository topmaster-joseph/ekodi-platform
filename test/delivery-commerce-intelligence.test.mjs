import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Delivery Commerce Intelligence keeps acquisition modes provider-independent and verified',async()=>{
  const sql=await read('supabase/migrations/20260909210000_delivery_commerce_intelligence.sql');
  for(const marker of ['store_commerce_source_configs','store_commerce_sync_jobs','store_commerce_evidence','delivery_commerce_enqueue','delivery_commerce_admin_snapshot','delivery_commerce_claim_job','delivery_commerce_complete_scan','browser_session','merchant_portal','official_api','public_web','verify_before_publish','daangn','naver_order'])assert.match(sql,new RegExp(marker));
  assert.match(sql,/enable row level security/);
  assert.match(sql,/can_manage_store_user_site/);
  assert.match(sql,/revoke all[\s\S]*from anon/);
});

test('Per-store delivery admin supports orders revenue delivery reviews and approved replies',async()=>{
  const sql=await read('supabase/migrations/20260909213000_delivery_platform_admin_ops.sql');
  for(const marker of ['store_platform_orders','store_platform_settlements','store_platform_reviews','store_platform_actions','store_delivery_platform_admin_snapshot','store_platform_review_save_draft','store_platform_review_queue_reply','user_approved','review_reply','net_settlement','delivery_area_hint'])assert.match(sql,new RegExp(marker));
  assert.match(sql,/without raw customer phone\/address|without raw customer phone\/address/i);
  assert.match(sql,/can_manage_store_user_site/);
});

test('Commerce edge functions require auth and never bypass browser or merchant protection',async()=>{
  const sync=await read('supabase/functions/delivery-commerce-sync/index.ts');
  const admin=await read('supabase/functions/delivery-platform-admin/index.ts');
  for(const marker of ['authentication_required','ALLOWED_HOSTS','authorized_browser_session_required','merchant_authorization_required','source_host_not_allowlisted','public_web'])assert.match(sync,new RegExp(marker));
  for(const marker of ['store_delivery_platform_admin_snapshot','delivery_commerce_enqueue','store_platform_review_save_draft','store_platform_review_queue_reply'])assert.match(admin,new RegExp(marker));
  assert.doesNotMatch(sync,/captcha|bypass|stealth|credential stuffing/i);
});

test('Business OS rolls platform order and review signals into each store admin',async()=>{
  const sql=await read('supabase/migrations/20260909214500_business_os_platform_rollup.sql');
  for(const marker of ['business_os_store_admin_snapshot','store_platform_orders','store_platform_reviews','platformOps','deliveryPlatformsConnected','unansweredReviews'])assert.match(sql,new RegExp(marker));
});
