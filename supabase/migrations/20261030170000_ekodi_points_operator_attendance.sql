-- Narrow authenticated operator entry point for an already verified attendance.
-- This is callable by a logged-in tenant operator only; never by arbitrary members.
-- The private function still validates attendance status, audit, daily caps and identity.
create or replace function public.ekodi_points_operator_award_attendance(
  p_site text, p_participation_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_participation_id is null then
    raise exception 'INVALID_ATTENDANCE_REQUEST';
  end if;

  select st.tenant_id into v_tenant
  from public.ekodi_point_site_tenants st
  join public.activities a on a.workspace_tenant_id=st.tenant_id
  join public.activity_participations p on p.activity_id=a.id
  where st.site_id=p_site and st.enabled and p.id=p_participation_id;

  if v_tenant is null then raise exception 'POINTS_ATTENDANCE_NOT_AVAILABLE'; end if;
  if not public.activity_is_workspace_operator(v_tenant) then
    raise exception 'POINTS_OPERATOR_FORBIDDEN';
  end if;

  return ekodi_points_private.award_verified_attendance(p_site,p_participation_id);
end;
$$;
revoke all on function public.ekodi_points_operator_award_attendance(text,uuid)
  from public, anon, authenticated;
grant execute on function public.ekodi_points_operator_award_attendance(text,uuid)
  to authenticated;
comment on function public.ekodi_points_operator_award_attendance(text,uuid)
  is 'Tenant operator only; re-checks verified canonical attendance; default site/tenant link disabled.';
