-- EKODI recognition-only member goals (#7778).
-- No ledger mutation, economic reward, automatic award or membership rights.
-- Personal targets are stored by canonical EKODI Person and enabled site.
create table if not exists ekodi_points_private.member_recognition_goals (
  site_id text not null references public.ekodi_point_sites(site_id),
  person_id uuid not null references public.people(id),
  weekly_target_days integer not null check (weekly_target_days between 1 and 7),
  target_activities_90d integer not null check (target_activities_90d between 3 and 90),
  updated_at timestamptz not null default now(),
  primary key (site_id, person_id)
);
alter table ekodi_points_private.member_recognition_goals enable row level security;
revoke all on table ekodi_points_private.member_recognition_goals
  from public, anon, authenticated, service_role;

-- Read and write only the signed-in user's own canonical Person. Never match email.
create or replace function public.ekodi_points_my_recognition_goal(p_site text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_person uuid;
  v_weekly integer;
  v_target integer;
  v_configured boolean;
begin
  if auth.uid() is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_POINT_SITE'; end if;
  v_person := ekodi_points_private.resolve_person_for_auth(auth.uid());
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;
  if not exists(select 1 from public.ekodi_point_sites where site_id=p_site and enabled) then
    raise exception 'POINT_SITE_NOT_AVAILABLE';
  end if;
  select weekly_target_days,target_activities_90d into v_weekly,v_target
  from ekodi_points_private.member_recognition_goals
  where site_id=p_site and person_id=v_person;
  v_configured := found;
  return jsonb_build_object('weekly_target_days',coalesce(v_weekly,3),
    'target_activities_90d',coalesce(v_target,10),'configured',v_configured);
end;
$$;

-- Both NULL values explicitly reset to defaults; mixed NULL is invalid.
create or replace function public.ekodi_points_set_recognition_goal(
  p_site text, p_weekly_days integer, p_target_90d integer
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_person uuid;
begin
  if auth.uid() is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then raise exception 'INVALID_POINT_SITE'; end if;
  v_person := ekodi_points_private.resolve_person_for_auth(auth.uid());
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;
  if not exists(select 1 from public.ekodi_point_sites where site_id=p_site and enabled) then
    raise exception 'POINT_SITE_NOT_AVAILABLE';
  end if;
  if p_weekly_days is null and p_target_90d is null then
    delete from ekodi_points_private.member_recognition_goals
    where site_id=p_site and person_id=v_person;
    return jsonb_build_object('weekly_target_days',3,'target_activities_90d',10,'configured',false);
  end if;
  if p_weekly_days is null or p_target_90d is null or
     p_weekly_days not between 1 and 7 or p_target_90d not between 3 and 90 then
    raise exception 'INVALID_RECOGNITION_GOAL';
  end if;
  insert into ekodi_points_private.member_recognition_goals
    (site_id,person_id,weekly_target_days,target_activities_90d)
  values(p_site,v_person,p_weekly_days,p_target_90d)
  on conflict (site_id,person_id) do update set
    weekly_target_days=excluded.weekly_target_days,
    target_activities_90d=excluded.target_activities_90d,
    updated_at=now();
  return jsonb_build_object('weekly_target_days',p_weekly_days,
    'target_activities_90d',p_target_90d,'configured',true);
end;
$$;

-- Public schema SECURITY DEFINER functions are not anonymous endpoints.
revoke all on function public.ekodi_points_my_recognition_goal(text)
  from public,anon,authenticated;
revoke all on function public.ekodi_points_set_recognition_goal(text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.ekodi_points_my_recognition_goal(text),
  public.ekodi_points_set_recognition_goal(text,integer,integer) to authenticated;
