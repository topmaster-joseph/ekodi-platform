-- Use ONLY with an isolated database, inside an explicit BEGIN ... ROLLBACK.
-- Preload point foundation + private award + identity resolver + heartbeat migrations.
-- An unlinked auth.users fixture is required; no sample records may persist.
do $qa_clock$
declare
  v_auth uuid;
  v_person uuid;
  v_session uuid;
  v_result jsonb;
  v_balance bigint;
  v_denied boolean;
begin
  select id into v_auth from auth.users u where not exists
    (select 1 from public.login_identities li where li.auth_user_id=u.id) limit 1;
  if v_auth is null then raise exception 'Unlinked auth fixture required'; end if;
  insert into public.people(ekodi_id,display_name)
    values('qa-active-'||replace(gen_random_uuid()::text,'-',''),'QA server time')
    returning id into v_person;
  insert into public.login_identities(person_id,auth_user_id,provider,provider_subject,email,status)
    values(v_person,v_auth,'clock-smoke',gen_random_uuid()::text,'clock@example.invalid','active');
  insert into public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    values('qa-clock','QA Clock',true,100);
  insert into public.ekodi_point_rules
    (site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled)
    values('qa-clock','active',5,15,3,60,true);

  -- Deliberately excessive time rewards are refused before wallet credit.
  update public.ekodi_point_rules set points=100
    where site_id='qa-clock' and rule_id='active';
  perform set_config('request.jwt.claim.sub',v_auth::text,true);
  v_denied:=false;
  begin
    perform public.ekodi_points_active_heartbeat('qa-clock',null,true,true);
  exception when raise_exception then v_denied:=true; end;
  if not v_denied then raise exception 'Excessive time reward was not refused'; end if;
  update public.ekodi_point_rules set points=5
    where site_id='qa-clock' and rule_id='active';
  perform set_config('request.jwt.claim.sub','',true);

  v_denied:=false;
  begin
    perform public.ekodi_points_active_heartbeat('qa-clock',null,true,true);
  exception when raise_exception then v_denied:=true; end;
  if not v_denied then raise exception 'Unauthenticated heartbeat allowed'; end if;
  perform set_config('request.jwt.claim.sub',v_auth::text,true);

  v_result:=public.ekodi_points_active_heartbeat('qa-clock',null,true,true);
  if v_result->>'reason'<>'INITIALIZED' then raise exception 'First pulse failed: %',v_result;end if;
  v_session:=(v_result->>'session_id')::uuid;
  v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,true,true);
  if v_result->>'reason'<>'WARMUP' then raise exception 'Warmup failed: %',v_result;end if;
  v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,true,true);
  if v_result->>'reason'<>'TOO_SOON' then raise exception 'Rapid poll counted: %',v_result;end if;

  -- Simulate three isolated 25-second server intervals without waiting.
  for i in 1..3 loop
    update public.ekodi_point_activity_sessions
      set last_ping_at=clock_timestamp()-interval '25 seconds'
      where site_id='qa-clock' and user_id=v_person;
    v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,true,true);
  end loop;
  if v_result->>'awarded'<>'true' then raise exception 'Active reward missing: %',v_result;end if;
  select balance into v_balance from public.ekodi_point_wallets
    where site_id='qa-clock' and user_id=v_person;
  if v_balance<>5 then raise exception 'Expected 5 points, got %',v_balance;end if;

  v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,false,false);
  if v_result->>'reason'<>'PAUSED' then raise exception 'Hidden state counted: %',v_result;end if;
  update public.ekodi_point_activity_sessions set last_ping_at=clock_timestamp()-interval '1 hour'
    where site_id='qa-clock' and user_id=v_person;
  v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,true,true);
  if v_result->>'reason'<>'WARMUP' then raise exception 'Idle state not warmed: %',v_result;end if;
  update public.ekodi_point_activity_sessions set last_ping_at=clock_timestamp()-interval '45 seconds'
    where site_id='qa-clock' and user_id=v_person;
  v_result:=public.ekodi_points_active_heartbeat('qa-clock',v_session,true,true);
  if v_result->>'reason'<>'STALE_GAP' then raise exception 'Stale gap counted: %',v_result;end if;
  v_denied:=false;
  begin
    perform public.ekodi_points_active_heartbeat('qa-clock',gen_random_uuid(),true,true);
  exception when raise_exception then v_denied:=true;end;
  if not v_denied then raise exception 'Forged session accepted';end if;
  if has_table_privilege('anon','public.ekodi_point_activity_sessions','INSERT')
     or has_table_privilege('authenticated','public.ekodi_point_activity_sessions','SELECT')
     or has_function_privilege('anon','public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)','EXECUTE')
     or not has_function_privilege('authenticated','public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)','EXECUTE')
  then raise exception 'Heartbeat RLS / RPC grants invalid';end if;
end $qa_clock$;
select 'POINT_CLOCK_ISOLATED_SMOKE_PASS' as result;
