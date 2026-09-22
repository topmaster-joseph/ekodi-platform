import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl=new URL('../supabase/migrations/20260922223500_church_operations_finance_core.sql',import.meta.url);
const pastorApiUrl=new URL('../supabase/functions/church-pastor-api/index.ts',import.meta.url);
const memberApiUrl=new URL('../supabase/functions/church-member-giving-api/index.ts',import.meta.url);
const policyUrl=new URL('../tenant-admin-policy.js',import.meta.url);

test('church finance tables stay private and service-role mediated',async()=>{
  const sql=await fs.promises.readFile(migrationUrl,'utf8');
  assert.match(sql,/create table if not exists church_private\.offerings/);
  assert.match(sql,/create table if not exists church_private\.ledger_entries/);
  assert.match(sql,/create table if not exists church_private\.receipt_requests/);
  assert.match(sql,/alter table church_private\.offerings enable row level security/);
  assert.match(sql,/revoke all privileges on church_private\.offerings, church_private\.ledger_entries, church_private\.receipt_requests from anon, authenticated/);
  assert.match(sql,/grant all privileges on church_private\.offerings, church_private\.ledger_entries, church_private\.receipt_requests to service_role/);
  assert.doesNotMatch(sql,/resident[_ ]?registration|주민등록번호/i);
});

test('offering creation writes exactly one linked income ledger record',async()=>{
  const sql=await fs.promises.readFile(migrationUrl,'utf8');
  assert.match(sql,/when 'church_offerings' then[\s\S]*insert into church_private\.offerings[\s\S]*returning id into v_offering_id/);
  assert.match(sql,/insert into church_private\.ledger_entries\([\s\S]*offering_id[\s\S]*v_offering_id,'posted'/);
  assert.match(sql,/offering_id uuid unique references church_private\.offerings/);
  assert.match(sql,/'4100','헌금수입'/);
});

test('dedicated finance roles do not inherit member care capabilities',async()=>{
  const source=await fs.promises.readFile(policyUrl,'utf8');
  assert.match(source,/church_treasurer:Object\.freeze\(\[TENANT_ADMIN_CAPABILITIES\.dashboard,TENANT_ADMIN_CAPABILITIES\.offerings,TENANT_ADMIN_CAPABILITIES\.finance,TENANT_ADMIN_CAPABILITIES\.financeManage,TENANT_ADMIN_CAPABILITIES\.receipts\]\)/);
  assert.match(source,/church_finance:Object\.freeze/);
  const financeSlice=source.slice(source.indexOf('church_treasurer:'),source.indexOf('care_staff:'));
  assert.doesNotMatch(financeSlice,/TENANT_ADMIN_CAPABILITIES\.care/);
  assert.doesNotMatch(financeSlice,/TENANT_ADMIN_CAPABILITIES\.people/);
});

test('pastor API exposes finance tables only to finance roles and senior pastor',async()=>{
  const source=await fs.promises.readFile(pastorApiUrl,'utf8');
  assert.match(source,/church_offerings:\['senior_pastor','church_treasurer','church_finance'\]/);
  assert.match(source,/church_ledger_entries:\['senior_pastor','church_treasurer','church_finance'\]/);
  assert.match(source,/church_receipt_requests:\['senior_pastor','church_treasurer','church_finance'\]/);
  assert.match(source,/church_donors:\['senior_pastor','church_treasurer','church_finance'\]/);
  assert.match(source,/PATCH_NOT_ALLOWED/);
  assert.match(source,/church_receipt_status_update/);
});

test('member giving endpoint can only return the authenticated member summary',async()=>{
  const source=await fs.promises.readFile(memberApiUrl,'utf8');
  const sql=await fs.promises.readFile(migrationUrl,'utf8');
  assert.match(source,/church_member_giving_summary/);
  assert.match(source,/church_member_receipt_request_create/);
  assert.match(source,/AUTH_REQUIRED/);
  assert.match(sql,/auth_user_id=p_user_id/);
  assert.match(sql,/lower\(email\)=lower\(trim\(p_email\)\)/);
  assert.match(sql,/o\.member_id=v_member\.id/);
  assert.match(sql,/o\.anonymous=false/);
});
