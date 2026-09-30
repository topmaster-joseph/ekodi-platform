import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl=new URL('../supabase/migrations/20260923103000_church_groups_and_ministry.sql',import.meta.url);

test('church groups and memberships are private many-to-many records',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/create table if not exists church_private\.groups/);
  assert.match(sql,/create table if not exists church_private\.group_memberships/);
  assert.match(sql,/unique \(tenant_id,group_id,member_id\)/);
  assert.match(sql,/revoke all privileges on church_private\.groups, church_private\.group_memberships from anon, authenticated/);
  assert.match(sql,/grant all privileges on church_private\.groups, church_private\.group_memberships to service_role/);
});

test('group attendance reuses canonical attendance records and membership dates',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/church_group_attendance_summaries/);
  assert.match(sql,/church_private\.attendance_records/);
  assert.match(sql,/gm\.joined_on is null or s\.service_date>=gm\.joined_on/);
  assert.match(sql,/gm\.left_on is null or s\.service_date<=gm\.left_on/);
  assert.match(sql,/'rate_basis','recorded_attendance'/);
  assert.doesNotMatch(sql,/create table if not exists church_private\.group_attendance/);
});

test('all group RPCs require service role',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/service role required/);
  assert.match(sql,/revoke all on function public\.church_group_list\(text,boolean\) from public,anon,authenticated/);
  assert.match(sql,/revoke all on function public\.church_group_membership_upsert\(text,jsonb,uuid\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.church_group_attendance_summaries\(text,integer\) to service_role/);
});
