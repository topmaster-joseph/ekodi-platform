import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = name => readFile(new URL('../'+name,import.meta.url),'utf8');
const path='supabase/migrations/20261108150000_bbqcg_verified_admin_invites.sql';

test('BBQCG site admins belong exclusively to canonical tenant; never platform role',async()=>{
  const sql=await source(path);
  assert.match(sql,/t\.slug='bbqcg'/);
  assert.match(sql,/t\.settings->>'site_key'='bbqcg'/);
  assert.match(sql,/s\.operating_space_slug='bbqcg'/);
  assert.match(sql,/v_owner <> 'customer'/);
  assert.match(sql,/v_tenant/);
  assert.match(sql,/public\.tenant_members\(tenant_id,user_id,role,status\)/);
  assert.match(sql,/'tenant_admin'::public\.app_role/);
  assert.doesNotMatch(sql,/values\s*\([^)]*'platform_admin'::public\.app_role/i);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.store_members/i);
  assert.doesNotMatch(sql,/insert\s+into\s+auth\.users/i);
});

test('verified highest administrators only, with a reserved unverified BBQ address',async()=>{
  const sql=await source(path);
  assert.match(sql,/topmaster\.joseph@gmail\.com/);
  assert.match(sql,/joseph@ekodi\.kr/);
  assert.match(sql,/bbqmuancg@gmail\.com/);
  assert.match(sql,/p\.platform_admin=true/);
  assert.match(sql,/u\.email_confirmed_at is not null/);
  assert.match(sql,/'pre_registered','bbqcg_owner_approved_operator_20261108'/);
  assert.match(sql,/status=case when exists\(/);
  assert.match(sql,/u\.email_confirmed_at is null/);
  assert.match(sql,/unverified identity was granted a tenant membership/);
});

test('pre-registration never grants unconfirmed email, but activates on confirmation',async()=>{
  const sql=await source(path);
  assert.match(sql,/create or replace function public\.apply_preregistered_access/);
  assert.match(sql,/email_confirmed_at is not null/);
  assert.match(sql,/coalesce\(is_anonymous, false\) = false/);
  assert.match(sql,/if v_email is null then return; end if;/i);
  assert.match(sql,/after insert or update of email,email_confirmed_at on auth\.users/);
  assert.match(sql,/execute function public\.handle_auth_user_access\(\)/);
  assert.match(sql,/status in \('pre_registered','active'\)/);
  assert.match(sql,/on conflict\(tenant_id,user_id,role\) do update set status='active'/);
});

test('guarded deployment retains separate migration SHA and no bypass',async()=>{
  const wf=await source('.github/workflows/deploy-space.yml');
  assert.match(wf,/BBQ_ADMIN_MIGRATION/);
  assert.match(wf,/BBQ_ADMIN_PINNED_BLOB/);
  assert.match(wf,/Verify BBQ CG canonical host and retired-URL hard block/);
  assert.match(wf,/Stage and verify approved BBQ store workspace before production/);
  assert.match(wf,/Verify BBQCG operator onboarding on DEV then PROD/);
  assert.match(wf,/SUPABASE_SCHEMA_PREFLIGHT_MODE/);
  assert.match(wf,/read_only:true/);
  assert.match(wf,/read_only:false/);
});
