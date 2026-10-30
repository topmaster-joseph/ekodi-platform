-- Verified activity participation awards, bound to EKODI's canonical Activity/Person engine.
-- This feature stays disabled until an administrator explicitly links a site and tenant.
create table if not exists public.ekodi_point_site_tenants (
  site_id text primary key references public.ekodi_point_sites(site_id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ekodi_point_site_tenants enable row level security;
revoke all on table public.ekodi_point_site_tenants from public, anon, authenticated;

-- Server-side canonical proof; a browser cannot submit arbitrary check-in claims.
create or replace function ekodi_points_private.award_verified_attendance(
  p_site text, p_participation_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance record;
  v_audit_id bigint;
  v_event_key text;
begin
  if p_site is null or p_participation_id is null then
    raise exception 'INVALID_ATTENDANCE_REQUEST';
  end if;

  -- Lock participation while checking current status to serialize reversals.
  select p.id, p.person_id, p.status, p.checked_in_at,
         a.id as activity_id, a.status as activity_status, a.starts_at
    into v_attendance
  from public.activity_participations p
  join public.activities a on a.id=p.activity_id
  join public.ekodi_point_site_tenants st
    on st.tenant_id=a.workspace_tenant_id
   and st.site_id=p_site and st.enabled
  join public.people pe on pe.id=p.person_id and pe.status='active'
  where p.id=p_participation_id
  for update of p;

  if not found then raise exception 'ATTENDANCE_SOURCE_NOT_FOUND'; end if;
  if v_attendance.status<>'attended'
     or v_attendance.checked_in_at is null
     or v_attendance.checked_in_at>now()
     or v_attendance.activity_status not in ('published','closed')
     or v_attendance.starts_at is null or v_attendance.starts_at>now()
  then
    raise exception 'ATTENDANCE_NOT_VERIFIED';
  end if;

  -- Only a recorded operator mutation is authoritative for point accrual.
  -- Self-declared participation, signup, or QR open are not attendance.
  select au.id into v_audit_id
  from public.activity_participation_audit au
  where au.activity_id=v_attendance.activity_id
    and au.participation_id=p_participation_id
    and au.actor_user_id is not null
    and au.action in ('admin_update','admin_add')
    and au.after_state->>'status'='attended'
    and au.source_channel='admin'
  order by au.id desc
  limit 1;
  if v_audit_id is null then raise exception 'ATTENDANCE_AUDIT_REQUIRED'; end if;

  v_event_key := 'attendance:' || p_participation_id::text;
  return ekodi_points_private.award_activity(
    p_site, v_attendance.person_id, 'attendance', v_event_key,
    jsonb_build_object(
      'kind','canonical_activity_attendance',
      'participation_id',p_participation_id,
      'audit_id',v_audit_id,
      'verified_at',now()
    )
  );
end;
$$;
revoke all on function ekodi_points_private.award_verified_attendance(text,uuid)
  from public, anon, authenticated;
grant execute on function ekodi_points_private.award_verified_attendance(text,uuid)
  to service_role;
