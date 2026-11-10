-- EKODI #7778 / #6739: disposable DB only, rollback enforced by runner.
-- The legacy heartbeat remains callable for contract compatibility but must
-- never be an award source: browser foreground and interaction are not proof.
DO $qa_clock$
DECLARE
  v_auth uuid;
  v_person uuid;
  v_result jsonb;
  v_error text;
BEGIN
  SELECT id INTO v_auth FROM auth.users u WHERE NOT EXISTS
    (SELECT 1 FROM public.login_identities li WHERE li.auth_user_id=u.id) LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Unlinked auth fixture required'; END IF;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('qa-active-'||replace(gen_random_uuid()::text,'-',''),'QA nonverified policy')
    RETURNING id INTO v_person;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email,status)
    VALUES(v_person,v_auth,'clock-smoke',gen_random_uuid()::text,'clock@example.invalid','active');
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-clock','QA Clock',true,100);
  INSERT INTO public.ekodi_point_rules
    (site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled)
    VALUES('qa-clock','active',5,15,3,60,false);

  -- Even an owner-authorized policy change cannot enable browser-reported
  -- time awards without an explicit, reviewed new migration.
  v_error := NULL;
  BEGIN
    UPDATE public.ekodi_point_rules SET enabled=true
    WHERE site_id='qa-clock' AND rule_id='active';
  EXCEPTION WHEN check_violation THEN v_error := 'blocked'; END;
  IF v_error IS NULL THEN RAISE EXCEPTION 'Unsafe active rule enabled'; END IF;

  PERFORM set_config('request.jwt.claim.sub','',true);
  v_error := NULL;
  BEGIN
    PERFORM public.ekodi_points_active_heartbeat('qa-clock',NULL,true,true);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'POINTS_AUTH_REQUIRED' THEN
    RAISE EXCEPTION 'Anonymous active heartbeat not denied: %',v_error;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  v_error := NULL;
  BEGIN
    v_result := public.ekodi_points_active_heartbeat('qa-clock',NULL,true,true);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'ACTIVE_RULE_DISABLED' THEN
    RAISE EXCEPTION 'Enabled user gained a time-based credit: %, %',v_error,v_result;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM ekodi_points_private.award_activity('qa-clock',v_person,'active',
       'qa-clock-unverified-claim',jsonb_build_object('verified_active_seconds',3600));
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'POINT_RULE_DISABLED' THEN
    RAISE EXCEPTION 'Direct trusted actor used active award rule: %',v_error;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ekodi_point_ledger WHERE site_id='qa-clock')
    OR EXISTS(SELECT 1 FROM public.ekodi_point_wallets WHERE site_id='qa-clock')
    OR EXISTS(SELECT 1 FROM public.ekodi_point_activity_sessions WHERE site_id='qa-clock')
  THEN RAISE EXCEPTION 'Disabled time rule mutated wallet, ledger or sessions'; END IF;

  IF has_table_privilege('anon','public.ekodi_point_activity_sessions','INSERT')
    OR has_table_privilege('authenticated','public.ekodi_point_activity_sessions','SELECT')
    OR has_function_privilege('anon','public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.ekodi_points_active_heartbeat(text,uuid,boolean,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'Heartbeat RLS / RPC grants invalid'; END IF;
END $qa_clock$;
SELECT 'POINT_CLOCK_ISOLATED_SMOKE_PASS' AS result;
