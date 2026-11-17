import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {storeAdminScript} from '../store-admin-engine.js';
import {verifiedBbqcgMenu} from '../bbqcg-order-portal.js';

const migration=await readFile(new URL('../supabase/migrations/20261118003000_bbqcg_qr_owner_menu.sql',import.meta.url),'utf8');
const script=await storeAdminScript().text();

test('BBQ QR catalog write requires auth, exact store and owner-level access',()=>{
  assert.match(migration,/create or replace function public\.bbqcg_qr_menu_owner_submit\(/i);
  assert.match(migration,/auth\.uid\(\) is null then raise exception 'authentication_required'/);
  assert.match(migration,/lower\(trim\(coalesce\(p_slug,''\)\)\) <> 'bbqcg'/);
  assert.match(migration,/public\.can_manage_store_user_site\(v_store_id\)/);
  assert.match(migration,/revoke all on function public\.bbqcg_qr_menu_owner_submit[^;]+from public,anon;/i);
  assert.match(migration,/grant execute on function public\.bbqcg_qr_menu_owner_submit[^;]+to authenticated;/i);
  assert.match(migration,/owner_approval_requires_price_and_source/);
  assert.match(migration,/published_menu_change_requires_separate_review/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.doesNotMatch(migration,/\bupdate public\.(stores|orders|payments|payment_accounts)\b/i);
  assert.doesNotMatch(migration,/\binsert into public\.(orders|order_items|payments|payment_accounts|tenant_members|store_members)\b/i);
});

test('drafts are invisible; actual approval captures original price, signer and evidence',()=>{
  assert.match(migration,/alter table public\.bbqcg_qr_menu_approvals enable row level security/);
  assert.match(migration,/revoke all on public\.bbqcg_qr_menu_approvals from public, anon, authenticated/);
  assert.match(migration,/availability=case when coalesce\(p_approve,false\) then 'available' else 'hidden' end/);
  assert.match(migration,/source_basis=case when coalesce\(p_approve,false\) then 'operator_verified' else 'pending' end/);
  assert.match(migration,/actor_id,action,approved_price,evidence_url/);
  assert.match(migration,/owner_approved/);
  assert.match(migration,/draft_saved/);
});

test('anonymous QR catalog contains only active approved available items in BBQ tenant',()=>{
  assert.match(migration,/create or replace function public\.bbqcg_qr_public_catalog\(p_slug text\)/);
  assert.match(migration,/if lower\(trim\(coalesce\(p_slug,''\)\)\) <> 'bbqcg' then return null/);
  assert.match(migration,/us\.status='active'/);
  assert.match(migration,/m\.availability='available'/);
  assert.match(migration,/m\.verified_at is not null/);
  assert.match(migration,/m\.base_price between 1 and 500000/);
  assert.match(migration,/grant execute on function public\.bbqcg_qr_public_catalog\(text\) to anon,authenticated/);
  assert.doesNotMatch(migration,/'customer_phone'|'payment_key'|'secret'|'bank_account'/);
  const valid={id:'54f00c64-98b5-41af-afaf-7d01d449eb8c',name:'매장 확인 메뉴',base_price:21000,source_basis:'operator_verified',verified_at:'2026-11-17T12:00:00Z',availability:'available'};
  assert.equal(verifiedBbqcgMenu({menu:[valid]}).length,1);
  for(const status of ['hidden','sold_out','unknown',undefined]){
    assert.equal(verifiedBbqcgMenu({menu:[{...valid,availability:status}]}).length,0,status);
  }
});

test('existing store admin offers a BBQ-only owner form and never silently enables checkout',()=>{
  new Script(script);
  assert.match(script,/function bbqQrOwnerMenuPanel/);
  assert.match(script,/function bindBbqQrOwnerMenuForm/);
  assert.match(script,/if\(SLUG!=='bbqcg'\)return/);
  assert.match(script,/\['store_owner','tenant_admin','platform_admin'\]/);
  assert.match(script,/bbqQrOwnerMenuForm/);
  assert.match(script,/event\.submitter\?\.value==='approve'/);
  assert.match(script,/data\.get\('owner_confirmation'\)/);
  assert.match(script,/rpc\('bbqcg_qr_menu_owner_submit'/);
  assert.match(script,/bindBbqQrOwnerMenuForm\(\)/);
  assert.match(script,/QR 온라인 결제·매장 자동접수/);
  assert.doesNotMatch(script,/bbqcg_qr_menu_owner_submit[\s\S]{0,400}\b(?:paymentKey|PAYMENTS_ENABLED|enable_checkout)\b/);
});
