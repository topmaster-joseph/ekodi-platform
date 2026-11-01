-- Trusted backend-only accrual. Never expose this function via the Data API.
create schema if not exists ekodi_points_private;
revoke all on schema ekodi_points_private from public, anon, authenticated;
create or replace function ekodi_points_private.award_activity(
  p_site text, p_user uuid, p_rule text, p_event_key text,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_site public.ekodi_point_sites%rowtype;
  v_rule public.ekodi_point_rules%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_rule_points bigint;
  v_rule_events bigint;
  v_site_points bigint;
  v_balance bigint;
begin
  if p_user is null or p_event_key is null or length(p_event_key) not between 8 and 200
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or octet_length(p_evidence::text) > 4096 then
    raise exception 'INVALID_POINT_EVENT';
  end if;
  -- All awards for one wallet are serialized, including first-wallet creation.
  perform pg_advisory_xact_lock(hashtextextended(p_site || ':' || p_user::text, 0));
  select * into v_site from public.ekodi_point_sites where site_id=p_site and enabled for update;
  if not found then raise exception 'POINT_SITE_DISABLED'; end if;
  select * into v_rule from public.ekodi_point_rules
    where site_id=p_site and rule_id=p_rule and enabled;
  if not found then raise exception 'POINT_RULE_DISABLED'; end if;
  insert into public.ekodi_point_wallets(site_id,user_id) values(p_site,p_user)
    on conflict(site_id,user_id) do nothing;
  if exists(select 1 from public.ekodi_point_ledger
            where site_id=p_site and user_id=p_user and event_key=p_event_key) then
    select balance into v_balance from public.ekodi_point_wallets
      where site_id=p_site and user_id=p_user;
    return jsonb_build_object('awarded',false,'reason','DUPLICATE','balance',v_balance);
  end if;
  -- Day boundaries are local Korean dates, including DST-safe timestamp construction.
  v_start := (v_today::timestamp at time zone 'Asia/Seoul');
  v_end := ((v_today+1)::timestamp at time zone 'Asia/Seoul');
  select coalesce(sum(amount),0), count(*) into v_rule_points,v_rule_events
    from public.ekodi_point_ledger
    where site_id=p_site and user_id=p_user and rule_id=p_rule
      and event_kind='earn' and created_at>=v_start and created_at<v_end;
  select coalesce(sum(amount),0) into v_site_points
    from public.ekodi_point_ledger
    where site_id=p_site and user_id=p_user
      and event_kind='earn' and created_at>=v_start and created_at<v_end;
  if v_rule_events >= v_rule.daily_events
     or v_rule_points + v_rule.points > v_rule.daily_cap
     or v_site_points + v_rule.points > v_site.daily_cap then
    return jsonb_build_object('awarded',false,'reason','DAILY_CAP');
  end if;
  -- Evidence must be verified by the trusted caller, never accepted directly
  -- from a browser. Minimum active seconds is enforced as a second guard.
  if v_rule.min_active_seconds > 0
     and (coalesce(p_evidence->>'verified_active_seconds','') !~ '^[0-9]{1,6}$'
          or (p_evidence->>'verified_active_seconds')::integer < v_rule.min_active_seconds) then
    raise exception 'UNVERIFIED_ACTIVITY_TIME';
  end if;
  insert into public.ekodi_point_ledger
    (site_id,user_id,amount,event_kind,rule_id,event_key,metadata)
    values(p_site,p_user,v_rule.points,'earn',p_rule,p_event_key,p_evidence);
  update public.ekodi_point_wallets set balance=balance+v_rule.points,updated_at=now()
    where site_id=p_site and user_id=p_user returning balance into v_balance;
  return jsonb_build_object('awarded',true,'points',v_rule.points,'balance',v_balance);
end;
$$;
revoke all on function ekodi_points_private.award_activity(text,uuid,text,text,jsonb) from public,anon,authenticated;
-- Explicitly limit execution to trusted server/database roles.
grant usage on schema ekodi_points_private to service_role;
grant execute on function ekodi_points_private.award_activity(text,uuid,text,text,jsonb) to service_role;
