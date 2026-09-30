import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl=new URL('../supabase/migrations/20260923012000_church_attendance_core.sql',import.meta.url);
const pastorApiUrl=new URL('../supabase/functions/church-pastor-api/index.ts',import.meta.url);
const memberApiUrl=new URL('../supabase/functions/church-member-attendance-api/index.ts',import.meta.url);
const adminUrl=new URL('../church-pastor-admin-page.js',import.meta.url);
const policyUrl=new URL('../tenant-admin-policy.js',import.meta.url);

test('church attendance is private and service-role mediated',async()=>{
  const sql=await fs.promises.readFile(migrationUrl,'utf8');
  assert.match(sql,/create table if not exists church_private\.attendance_records/);
  assert.match(sql,/unique \(tenant_id, service_id, member_id\)/);
  assert.match(sql,/alter table church_private\.attendance_records enable row level security/);
  assert.match(sql,/revoke all privileges on church_private\.attendance_records from anon, authenticated/);
  assert.match(sql,/grant all privileges on church_private\.attendance_records to service_role/);
});

test('attendance supports individual history and recorded-basis rate',async()=>{
  const sql=await fs.promises.readFile(migrationUrl,'utf8');
  assert.match(sql,/church_member_attendance_summary/);
  assert.match(sql,/a\.member_id=v_member\.id/);
  assert.match(sql,/attendance_rate/);
  assert.match(sql,/'rate_basis','recorded_attendance'/);
  assert.match(sql,/present','late','online/);
  assert.match(sql,/absent/);
  assert.match(sql,/excused/);
});

test('member attendance endpoint returns only the authenticated member summary',async()=>{
  const source=await fs.promises.readFile(memberApiUrl,'utf8');
  assert.match(source,/AUTH_REQUIRED/);
  assert.match(source,/church_member_attendance_summary/);
  assert.match(source,/p_user_id:who\.id/);
  assert.match(source,/p_email:who\.email/);
  assert.doesNotMatch(source,/church_attendance_list/);
});

test('pastor admin exposes attendance with a dedicated capability',async()=>{
  const api=await fs.promises.readFile(pastorApiUrl,'utf8');
  const admin=await fs.promises.readFile(adminUrl,'utf8');
  const policy=await fs.promises.readFile(policyUrl,'utf8');
  assert.match(api,/church_attendance:\['senior_pastor','pastor','care_staff','staff'\]/);
  assert.match(api,/church_attendance_upsert/);
  assert.match(api,/church_attendance_summary/);
  assert.match(api,/church_attendance_member_summaries/);
  assert.match(admin,/개인별 출결현황/);
  assert.match(admin,/section==='attendance'/);
  assert.match(policy,/attendance:'tenant\.attendance\.manage'/);
});
