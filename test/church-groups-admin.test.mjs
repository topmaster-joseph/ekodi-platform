import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiUrl=new URL('../supabase/functions/church-pastor-api/index.ts',import.meta.url);
const adminUrl=new URL('../church-pastor-admin-page.js',import.meta.url);

test('pastor API exposes group operations through service-role RPCs',async()=>{
  const source=await fs.promises.readFile(apiUrl,'utf8');
  assert.match(source,/church_groups:\['senior_pastor','pastor','care_staff','staff'\]/);
  assert.match(source,/church_group_members:\['senior_pastor','pastor','care_staff','staff'\]/);
  assert.match(source,/church_group_attendance:\['senior_pastor','pastor','care_staff','staff'\]/);
  assert.match(source,/church_group_list/);
  assert.match(source,/church_group_member_list/);
  assert.match(source,/church_group_attendance_summaries/);
  assert.match(source,/church_group_upsert/);
  assert.match(source,/church_group_membership_upsert/);
});

test('group write access is narrower than group read access',async()=>{
  const source=await fs.promises.readFile(apiUrl,'utf8');
  assert.match(source,/church_groups:\['senior_pastor','pastor','staff'\]/);
  assert.match(source,/church_group_members:\['senior_pastor','pastor','staff'\]/);
  assert.doesNotMatch(source,/church_group_attendance:\['senior_pastor','pastor','staff'\]/);
});

test('ministry admin renders group attendance from canonical records',async()=>{
  const source=await fs.promises.readFile(adminUrl,'utf8');
  assert.match(source,/async function ministry\(\)/);
  assert.match(source,/rest\('church_group_attendance','year='\+currentYear\)/);
  assert.match(source,/한 교인 여러 조직 가능/);
  assert.match(source,/같은 교인·같은 조직을 다시 저장하면 중복 생성하지 않고/);
  assert.match(source,/별도 출결을 만들지 않고 기존 개인 출결/);
});
