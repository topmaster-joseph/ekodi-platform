import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl=new URL('../supabase/migrations/20260923091500_church_attendance_analytics.sql',import.meta.url);

test('attendance analytics keep recorded-basis semantics',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/church_member_attendance_summary/);
  assert.match(sql,/church_attendance_member_summaries/);
  assert.match(sql,/'rate_basis','recorded_attendance'/);
  assert.match(sql,/'streak_basis','consecutive_recorded_attended_states'/);
  assert.doesNotMatch(sql,/generate_series/);
});

test('member summary exposes monthly trend and streak dates',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/'current_streak'/);
  assert.match(sql,/'longest_streak'/);
  assert.match(sql,/'last_attended_date'/);
  assert.match(sql,/'last_absence_date'/);
  assert.match(sql,/'monthly'/);
  assert.match(sql,/attendance_state in \('present','late','online'\)/);
});

test('analytics RPCs remain service-role only',async()=>{
  const sql=await fs.promises.readFile(sqlUrl,'utf8');
  assert.match(sql,/service role required/);
  assert.match(sql,/revoke all on function public\.church_attendance_member_summaries\(text,integer\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.church_attendance_member_summaries\(text,integer\) to service_role/);
});
