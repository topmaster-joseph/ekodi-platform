-- Run after loading the core stubs + ALL point migrations, INSIDE BEGIN/ROLLBACK.
-- This is an isolated staging DB smoke test, not a production seed.
DO $attendance_smoke$
DECLARE
  v_tenant uuid;
  v_other_tenant uuid;
  v_person uuid;
  v_actor uuid;
  v_activity uuid := gen_random_uuid();
  v_participation uuid := gen_random_uuid();
  v_result jsonb;
  v_failed boolean;
  v_balance bigint;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other_tenant FROM public.tenants WHERE id<>v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM auth.users ORDER BY id LIMIT 1;
  IF v_tenant IS NULL OR v_actor IS NULL OR v_other_tenant IS NULL THEN
    RAISE EXCEPTION 'Isolated dev tenant/user fixtures unavailable';
  END IF;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('attendance-smoke-'||replace(gen_random_uuid()::text,'-',''),'QA attendance')
    RETURNING id INTO v_person;
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-attend','QA attendance',true,500);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-attend','attendance',100,200,2,true);
  INSERT INTO public.ekodi_point_site_tenants(site_id,tenant_id)
    VALUES('qa-attend',v_tenant);
  INSERT INTO public.activities(id,workspace_tenant_id,status,starts_at)
    VALUES(v_activity,v_tenant,'published',now()-interval '1 hour');
  INSERT INTO public.activity_participations(id,activity_id,person_id,status)
    VALUES(v_participation,v_activity,v_person,'applied');

  v_failed := false;
  BEGIN
    PERFORM ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Disabled mapping awarded attendance'; END IF;

  UPDATE public.ekodi_point_site_tenants SET enabled=true WHERE site_id='qa-attend';
  v_failed := false;
  BEGIN
    PERFORM ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Unconfirmed participation awarded'; END IF;

  UPDATE public.activity_participations SET status='attended',checked_in_at=now()
    WHERE id=v_participation;
  v_failed := false;
  BEGIN
    PERFORM ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Attendance without audit awarded'; END IF;

  INSERT INTO public.activity_participation_audit
    (activity_id,participation_id,actor_user_id,action,after_state,source_channel)
    VALUES(v_activity,v_participation,v_actor,'admin_update','{"status":"attended"}'::jsonb,'admin');
  -- Tenant mismatch must be rejected even with a valid administrative audit.
  UPDATE public.activities SET workspace_tenant_id=v_other_tenant WHERE id=v_activity;
  v_failed := false;
  BEGIN
    PERFORM ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Cross-tenant attendance awarded'; END IF;
  UPDATE public.activities SET workspace_tenant_id=v_tenant WHERE id=v_activity;

  v_result := ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  IF v_result->>'awarded'<>'true' OR (v_result->>'balance')::bigint<>100 THEN
    RAISE EXCEPTION 'Verified attendance not awarded: %',v_result;
  END IF;
  v_result := ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  IF v_result->>'reason'<>'DUPLICATE' THEN
    RAISE EXCEPTION 'Attendance replay was not blocked: %',v_result;
  END IF;
  UPDATE public.activity_participations SET status='cancelled' WHERE id=v_participation;
  v_failed := false;
  BEGIN
    PERFORM ekodi_points_private.award_verified_attendance('qa-attend',v_participation);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Cancelled attendance was awarded'; END IF;
  SELECT balance INTO v_balance FROM public.ekodi_point_wallets
    WHERE site_id='qa-attend' AND user_id=v_person;
  IF v_balance<>100 THEN RAISE EXCEPTION 'Wrong final balance: %',v_balance; END IF;
  IF EXISTS(
    SELECT 1 FROM ekodi_points_private.wallet_reconciliation() WHERE site_id='qa-attend'
  ) THEN RAISE EXCEPTION 'Ledger reconciliation failed'; END IF;
END $attendance_smoke$;
SELECT 'ATTENDANCE_ISOLATED_SMOKE_PASS' AS result;
