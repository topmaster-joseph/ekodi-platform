import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tenantAdminCan, tenantAdminPolicySnapshot } from '../tenant-admin-policy.js';
import { workspaceAdminCanAccess, workspaceAdminScript } from '../workspace-admin-page.js';

const migrationUrl=new URL('../supabase/migrations/20260919143000_activity_person_participation.sql',import.meta.url);

test('Activity Person ledger keeps participation and relationships separate',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const marker of [
    'create table if not exists public.person_contacts',
    'create table if not exists public.activities',
    'create table if not exists public.activity_participations',
    'create table if not exists public.person_workspace_relationships',
    'create table if not exists public.activity_participation_audit'
  ]) assert.ok(sql.includes(marker),marker);
  assert.ok(sql.includes('unique (activity_id,person_id)'));
  assert.ok(sql.includes('person_contacts_kind_normalized_uidx'));
  assert.ok(sql.includes('CONTACT_IDENTITY_CONFLICT'));
  assert.ok(sql.includes('pg_advisory_xact_lock'));
  assert.ok(sql.includes("relationship_type in ('member','church_member','donor','volunteer','partner','staff')"));
  const submit=sql.slice(sql.indexOf('create or replace function public.activity_submit_participation'),sql.indexOf('-- 6) Tenant-admin read model.'));
  assert.equal(submit.includes('insert into public.person_workspace_relationships'),false);
});

test('all participant intake adapters converge on one Activity Person RPC',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const marker of [
    'create or replace function public.activity_submit_participation',
    "source_channel in ('website','qr','google_form','admin','import','api')",
    'create or replace function public.mission_submit_event_application',
    'v_result:=public.activity_submit_participation(',
    "'ekodimission',p_event_key",
    'compatibility_backfill',
    'add column if not exists person_id uuid references public.people',
    'add column if not exists activity_participation_id uuid references public.activity_participations'
  ]) assert.ok(sql.includes(marker),marker);
});

test('participant private data is RPC-only and tenant scoped',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const table of ['person_contacts','activities','activity_participations','person_workspace_relationships','activity_participation_audit']){
    assert.ok(sql.includes('alter table public.'+table+' enable row level security'),table+' RLS');
    assert.ok(sql.includes('revoke all on table public.'+table+' from anon, authenticated'),table+' revoke');
  }
  for(const marker of ['activity_is_workspace_operator','current_site_activity_contexts()','ACTIVITY_ADMIN_FORBIDDEN','PRIVACY_CONSENT_REQUIRED','activity_record_participation_audit'])assert.ok(sql.includes(marker),marker);
});

test('EKODI Mission is promoted to tenant-local Activity administration',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  assert.ok(sql.includes("'ekodimission'"));
  assert.ok(sql.includes("'operating_model','customer-site'"));
  assert.ok(sql.includes("'tenant_admin'::public.app_role"));
  const policy=tenantAdminPolicySnapshot();
  assert.equal(policy.capabilities.activities,'tenant.activity.manage');
  assert.equal(tenantAdminCan('tenant_admin',policy.capabilities.activities),true);
  assert.equal(tenantAdminCan('pastor',policy.capabilities.activities),true);
  assert.equal(tenantAdminCan('marketing_manager',policy.capabilities.activities),false);
  assert.equal(workspaceAdminCanAccess('tenant_admin','activities'),true);
  assert.equal(workspaceAdminCanAccess('marketing_manager','activities'),false);
});

test('Workspace Admin exposes one-screen activity participant operations',async()=>{
  const source=await (await workspaceAdminScript()).text();
  for(const marker of ['activity_admin_snapshot','activity_admin_add_participant','activity_admin_update_participation','활동 · 참가자','data-activity-checkin','followUpStatus','companionsFromInput','google_form','privacyConsent'])assert.ok(source.includes(marker),marker);
  assert.ok(source.includes("workspace==='ekodimission'"));
  assert.ok(source.includes("section==='activities'"));
});
