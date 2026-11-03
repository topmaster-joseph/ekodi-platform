import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('../supabase/migrations/20261103162500_ekodi_points_recognition_goals.sql');
const html=read('../my/points/index.html');
const app=read('../my/points/app.js');
const runner=read('../scripts/run-points-sql-smokes.mjs');
const projection=read('../supabase/functions/points-api/progress.mjs');

test('recognition preference uses a private, canonical-Person and per-site boundary',()=>{
  assert.match(sql,/ekodi_points_private\.member_recognition_goals/);
  assert.match(sql,/primary key \(site_id, person_id\)/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on table ekodi_points_private\.member_recognition_goals/);
  assert.match(sql,/ekodi_points_private\.resolve_person_for_auth\(auth\.uid\(\)\)/);
  assert.match(sql,/site_id=p_site and person_id=v_person/);
  assert.match(sql,/if auth\.uid\(\) is null then raise exception 'POINTS_AUTH_REQUIRED'/);
  assert.match(sql,/grant execute on function public\.ekodi_points_my_recognition_goal\(text\)/);
  assert.match(sql,/to authenticated;/);
  assert.doesNotMatch(sql,/\b(?:insert into|update|delete from)\s+public\.ekodi_point_(?:ledger|wallets)/i);
});

test('personal goals are non-financial and resettable, not arbitrary point awards',()=>{
  assert.match(sql,/p_weekly_days between 1 and 7/);
  assert.match(sql,/p_weekly_days is null and p_target_90d is null/);
  assert.match(sql,/p_target_90d not between 3 and 90/);
  assert.match(sql,/INVALID_RECOGNITION_GOAL/);
  assert.match(runner,/points-recognition-goals-isolated-smoke\.sql/);
  assert.match(html,/id="pointsGoalForm"/);
  assert.match(html,/id="pointsResetGoal"/);
  assert.match(html,/id="pointsWeeklySection"/);
  assert.match(app,/sb\.rpc\('ekodi_points_my_recognition_goal'/);
  assert.match(app,/sb\.rpc\('ekodi_points_set_recognition_goal'/);
  assert.match(app,/if\(revision!==viewRevision\|\|select\.value!==site\)return;/);
  assert.match(app,/goalSection\.hidden=true/);
  assert.doesNotMatch(app,/innerHTML|award_evidence|\.insert\(/);
});

test('weekly projection contains only verified eligible activity, not money',()=>{
  assert.match(projection,/const weekCounts = new Map\(\)/);
  assert.match(projection,/start_date: weekDays\[0\]\.date/);
  assert.match(projection,/approved_activities: weekDays\.reduce/);
  assert.match(projection,/pending_activities: weekDays\.reduce/);
  assert.match(projection,/reward_policy: "recognition_only"/);
  assert.doesNotMatch(projection,/\bwallets\b|\btransfer\b|\bdonation\b/);
});
