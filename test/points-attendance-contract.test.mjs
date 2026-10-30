import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../supabase/migrations/20261030163000_ekodi_points_attendance_proof.sql',import.meta.url),'utf8');
test('attendance award requires canonical activity, matching tenant, person and audit proof',()=>{
  for(const token of [
    'public.activity_participations','public.activities','public.people',
    'public.ekodi_point_site_tenants','st.tenant_id=a.workspace_tenant_id',
    "pe.status='active'","v_attendance.status<>'attended'",
    'v_attendance.checked_in_at is null','v_attendance.starts_at>now()',
    'public.activity_participation_audit','au.actor_user_id is not null',
    "au.after_state->>'status'='attended'", "au.source_channel='admin'",
    "v_event_key := 'attendance:' || p_participation_id::text",
    "ekodi_points_private.award_activity"
  ]) assert.ok(source.includes(token),token);
});
test('attendance proof is private and disabled until a site/tenant mapping is activated',()=>{
  assert.match(source,/enabled boolean not null default false/);
  assert.match(source,/alter table public\.ekodi_point_site_tenants enable row level security/i);
  assert.match(source,/revoke all on table public\.ekodi_point_site_tenants\s+from public, anon, authenticated, service_role/i);
    assert.match(source,/grant select on table public\.ekodi_point_site_tenants to service_role/i);
  assert.match(source,/revoke all on function ekodi_points_private\.award_verified_attendance\(text,uuid\)[\s\S]*?from public, anon, authenticated/i);
  assert.match(source,/grant execute on function ekodi_points_private\.award_verified_attendance\(text,uuid\)[\s\S]*?to service_role/i);
});
