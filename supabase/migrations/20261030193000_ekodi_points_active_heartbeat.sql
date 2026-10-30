-- Server-timed active-presence accrual. Browser foreground / interaction
-- hints are NOT independent proof of human attention: use only for low-value,
-- capped activity points and keep the site/rule disabled by default.
create table if not exists public.ekodi_point_activity_sessions (
  site_id text not null references public.ekodi_point_sites(site_id),
  user_id uuid not null references public.people(id),
  auth_user_id uuid not null references auth.users(id),
  session_id uuid not null default gen_random_uuid(),
  kst_day date not null,
  last_ping_at timestamptz not null default now(),
  last_active boolean not null default false,
  observed_seconds integer not null default 0
    check (observed_seconds between 0 and 86400),
  credited_intervals integer not null default 0
    check (credited_intervals between 0 and 1440),
  primary key (site_id,user_id),
  unique (session_id)
);
create index if not exists ekodi_point_activity_sessions_last_ping_idx
  on public.ekodi_point_activity_sessions(last_ping_at);
alter table public.ekodi_point_activity_sessions enable row level security;
revoke all on table public.ekodi_point_activity_sessions
  from public, anon, authenticated, service_role;
grant select on table public.ekodi_point_activity_sessions to service_role;

create or replace function public.ekodi_points_active_heartbeat(
  p_site text, p_session uuid default null,
  p_foreground boolean default false,
  p_recent_interaction boolean default false
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth uuid := auth.uid();
  v_person uuid;
  v_now timestamptz := clock_timestamp();
  v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_rule public.ekodi_point_rules%rowtype;
  v_session public.ekodi_point_activity_sessions%rowtype;
  v_seconds integer;
  v_total integer;
  v_bucket integer;
  v_key text;
  v_award jsonb;
begin
  if v_auth is null then raise exception 'POINTS_AUTH_REQUIRED'; end if;
  if p_site is null or p_site !~ '^[a-z0-9_-]{2,64}$' then
    raise exception 'INVALID_POINT_SITE';
  end if;
  if not exists(select 1 from public.ekodi_point_sites s
    where s.site_id=p_site and s.enabled) then
    raise exception 'POINT_SITE_DISABLED';
  end if;
  select * into v_rule from public.ekodi_point_rules
    where site_id=p_site and rule_id='active' and enabled;
  if not found then raise exception 'ACTIVE_RULE_DISABLED'; end if;
  -- A cheap heartbeat is inappropriate for high-frequency awards.
  if v_rule.min_active_seconds not between 60 and 3600 then
    raise exception 'ACTIVE_RULE_MINIMUM_INTERVAL_INVALID';
  end if;
  -- Untrusted interaction hints may never become high-value currency,
  -- even after a mistaken policy edit. Keep this stricter than the site cap.
  if v_rule.points>5 or v_rule.daily_cap>50 or v_rule.daily_events>10 then
    raise exception 'ACTIVE_RULE_RISK_LIMIT_EXCEEDED';
  end if;
  v_person := ekodi_points_private.resolve_person_for_auth(v_auth);
  if v_person is null then raise exception 'POINT_IDENTITY_NOT_LINKED'; end if;

  -- Only one active clock per EKODI person and site, even across browser tabs
  -- or linked login methods. The row lock serializes concurrent heartbeats.
  insert into public.ekodi_point_activity_sessions
    (site_id,user_id,auth_user_id,kst_day,last_ping_at)
    values(p_site,v_person,v_auth,v_day,v_now)
    on conflict (site_id,user_id) do nothing;
  select * into v_session from public.ekodi_point_activity_sessions
    where site_id=p_site and user_id=v_person for update;
  if v_session.kst_day<>v_day or v_session.auth_user_id<>v_auth then
    update public.ekodi_point_activity_sessions
      set auth_user_id=v_auth,session_id=gen_random_uuid(),
          kst_day=v_day,last_ping_at=v_now,last_active=false,
          observed_seconds=0,credited_intervals=0
      where site_id=p_site and user_id=v_person
      returning * into v_session;
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','SESSION_REFRESH_REQUIRED');
  end if;
  if p_session is null then
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','INITIALIZED');
  end if;
  if p_session<>v_session.session_id then
    raise exception 'POINTS_SESSION_MISMATCH';
  end if;

  -- Do not count inactive tabs, idle intervals or long gaps. Both input
  -- booleans are untrusted hints; the elapsed interval is server measured.
  if p_foreground is distinct from true
     or p_recent_interaction is distinct from true then
    update public.ekodi_point_activity_sessions
      set last_ping_at=v_now,last_active=false
      where site_id=p_site and user_id=v_person;
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','PAUSED');
  end if;
  if not v_session.last_active then
    update public.ekodi_point_activity_sessions
      set last_ping_at=v_now,last_active=true
      where site_id=p_site and user_id=v_person;
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','WARMUP');
  end if;

  v_seconds := floor(extract(epoch from v_now-v_session.last_ping_at))::integer;
  if v_seconds < 12 then
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','TOO_SOON');
  end if;
  if v_seconds>40 then
    update public.ekodi_point_activity_sessions
      set last_ping_at=v_now,last_active=false
      where site_id=p_site and user_id=v_person;
    return jsonb_build_object('session_id',v_session.session_id,
      'awarded',false,'reason','STALE_GAP');
  end if;

  v_total := least(86400,v_session.observed_seconds+least(v_seconds,30));
  v_bucket := v_total / v_rule.min_active_seconds;
  update public.ekodi_point_activity_sessions
    set last_ping_at=v_now,last_active=true,observed_seconds=v_total
    where site_id=p_site and user_id=v_person;

  if v_bucket > v_session.credited_intervals then
    v_key := 'active:'||p_site||':'||v_person::text||':'||v_day::text||':'||v_bucket::text;
    v_award := ekodi_points_private.award_activity(
      p_site,v_person,'active',v_key,
      jsonb_build_object(
        'verified_active_seconds',v_rule.min_active_seconds,
        'source','server_timed_heartbeat',
        'client_activity_reported',true,
        'server_day_kst',v_day
      )
    );
    if v_award->>'awarded'='true' or v_award->>'reason'='DUPLICATE' then
      update public.ekodi_point_activity_sessions
        set credited_intervals=v_bucket
        where site_id=p_site and user_id=v_person;
    end if;
    return v_award||jsonb_build_object('session_id',v_session.session_id,
      'observed_seconds',v_total);
  end if;
  return jsonb_build_object('session_id',v_session.session_id,
    'observed_seconds',v_total,'awarded',false,'reason','OBSERVING');
end;
$$;
revoke all on function public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)
  to authenticated;
comment on function public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)
  is 'Low-value points only: server-time measured foreground/interaction hints, not independently verified human attention. Site and active rule are disabled by default.';
