import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261030193000_ekodi_points_active_heartbeat.sql',import.meta.url),'utf8');
test('activity time comes from server clock, never client supplied seconds or event key',()=>{
  for(const clause of [
    'clock_timestamp()','extract(epoch from v_now-v_session.last_ping_at)',
    'v_seconds < 12','v_seconds>40','least(v_seconds,30)',
    'for update','primary key (site_id,user_id)','v_session.kst_day<>v_day',
    'v_person := ekodi_points_private.resolve_person_for_auth(v_auth)',
    "v_rule.min_active_seconds not between 60 and 3600",
    "'active',v_key"
  ])assert.ok(sql.includes(clause),clause);
  assert.doesNotMatch(sql,/p_seconds|p_event_key|p_user uuid/);
});
test('heartbeat direct table access blocked, award role scoped, default-off configuration',()=>{
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.ekodi_point_activity_sessions[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql,/grant select on table public\.ekodi_point_activity_sessions to service_role/i);
  assert.match(sql,/revoke all on function public\.ekodi_points_active_heartbeat\(text,uuid,boolean,boolean\)[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.ekodi_points_active_heartbeat\(text,uuid,boolean,boolean\)[\s\S]*?to authenticated/i);
  assert.match(sql,/if v_auth is null/);
  assert.match(sql,/client_activity_reported/);
  assert.match(sql,/p_foreground is distinct from true/);
  assert.match(sql,/p_recent_interaction is distinct from true/);
});
