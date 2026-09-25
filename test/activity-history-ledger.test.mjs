import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl=new URL('../supabase/migrations/20260925010000_activity_history_series_sources.sql',import.meta.url);
const adminUrl=new URL('../workspace-admin-page.js',import.meta.url);

test('activity history has recurring series and evidence provenance',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const marker of [
    'create table if not exists public.activity_series',
    'create table if not exists public.activity_evidence_sources',
    "source_kind in ('ekodi','google_drive','chatgpt_context','manual','website','import')",
    "verification_status in ('confirmed','reference','needs_review','conflict')",
    'activity_admin_history_snapshot',
    'activity_admin_upsert_series',
    'activity_admin_add_history_record',
    "'saturday-gathering'",
    "'open-table'",
    "'summer-camp'",
    "'sunday-gathering'",
    "'prayer-meeting'",
    "'praise-gathering'"
  ]) assert.ok(sql.includes(marker),marker);
});

test('Drive and GPT context remain evidence, not automatic truth overrides',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  assert.ok(sql.includes("'google_drive'"));
  assert.ok(sql.includes("'chatgpt_context'"));
  assert.ok(sql.includes("'conflict'"));
  assert.ok(sql.includes("'needs_review'"));
  assert.ok(sql.includes('현재 EKODI 원장을 기준값으로 유지'));
  assert.ok(sql.includes('대화 기억은 보조 출처'));
});

test('Mission history UI is separately addressable and uses activity capability',async()=>{
  const source=await readFile(adminUrl,'utf8');
  for(const marker of [
    "'activity-history':TENANT_ADMIN_CAPABILITIES.activities",
    "'activity-history':POLICY.capabilities.activities",
    "['activity-history','활동 이력']",
    "if(section==='activity-history')return activityHistoryAdmin()",
    "['activity-history','활동 이력']",
    'activity_admin_history_snapshot',
    'activity_admin_upsert_series',
    'activity_admin_add_history_record',
    'Google Drive는 지속 근거로',
    'GPT 기억·대화 맥락은 참고 근거'
  ]) assert.ok(source.includes(marker),marker);
});

test('history seed keeps unverified planned gatherings reviewable',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  assert.ok(sql.includes("'260905-saturday-gathering'"));
  assert.ok(sql.includes("'260912-saturday-gathering'"));
  assert.ok(sql.includes("'260919-saturday-gathering'"));
  assert.ok(sql.includes("'plan_only',true"));
  assert.ok(sql.includes("reported_attendance,history_record_status"));
});


test('church history is reconstructed conservatively from following-Sunday bulletins',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const marker of [
    "'260726-sunday-gathering'",
    "'260802-sunday-gathering'",
    "'260809-sunday-gathering'",
    "'260830-sunday-gathering'",
    "'260906-sunday-gathering'",
    "'260913-sunday-gathering'",
    '특정 일자의 참석으로 환산하지 않음'
  ]) assert.ok(sql.includes(marker),marker);
});
