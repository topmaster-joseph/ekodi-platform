-- Isolated DEV only: load test/fixtures/points-attendance-isolated-core.sql,
-- apply all point migrations, then run THIS script inside BEGIN/ROLLBACK.
-- It refuses to replace a real authorization function.
DO $guard$
BEGIN
  IF to_regprocedure('public.activity_is_workspace_operator(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'REFUSE_TO_OVERRIDE_REAL_ACTIVITY_AUTH';
  END IF;
END $guard$;
CREATE FUNCTION public.activity_is_workspace_operator(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $mock$
  SELECT auth.uid() IS NOT NULL
    AND p_tenant_id::text=current_setting('points.test.tenant',true)
    AND current_setting('points.test.allowed',true)='yes'
$mock$;

DO $operator_test$
DECLARE
  v_tenant uuid;
  v_actor uuid;
  v_person uuid;
  v_activity uuid := gen_random_uuid();
  v_participation uuid := gen_random_uuid();
  v_result jsonb;
  v_denied boolean;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM auth.users ORDER BY id LIMIT 1;
  IF v_tenant IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION 'DEV_FIXTURE_MISSING'; END IF;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('points-operator-smoke-'||replace(gen_random_uuid()::text,'-',''),'Operator QA')
    RETURNING id INTO v_person;
  INSERT INTO public.ekodi_point_sites(site_id,display_name,daily_cap,enabled)
    VALUES('qa-operator','Operator QA',200,true);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-operator','attendance',80,160,2,true);
  INSERT INTO public.ekodi_point_site_tenants(site_id,tenant_id,enabled)
    VALUES('qa-operator',v_tenant,true);
  INSERT INTO public.activities(id,workspace_tenant_id,status,starts_at)
    VALUES(v_activity,v_tenant,'published',now()-interval '2 hours');
  INSERT INTO public.activity_participations(id,activity_id,person_id,status,checked_in_at)
    VALUES(v_participation,v_activity,v_person,'attended',now()-interval '1 hour');
  INSERT INTO public.activity_participation_audit
    (activity_id,participation_id,actor_user_id,action,after_state,source_channel)
    VALUES(v_activity,v_participation,v_actor,'admin_update',
      '{"status":"attended"}'::jsonb,'admin');

  v_denied:=false;
  BEGIN
    PERFORM public.ekodi_points_operator_award_attendance('qa-operator',v_participation);
  EXCEPTION WHEN raise_exception THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNAUTHENTICATED_AWARD'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('points.test.tenant',v_tenant::text,true);
  PERFORM set_config('points.test.allowed','no',true);
  v_denied:=false;
  BEGIN
    PERFORM public.ekodi_points_operator_award_attendance('qa-operator',v_participation);
  EXCEPTION WHEN raise_exception THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNAUTHORIZED_AWARD'; END IF;

  PERFORM set_config('points.test.allowed','yes',true);
  v_result:=public.ekodi_points_operator_award_attendance('qa-operator',v_participation);
  IF v_result->>'awarded'<>'true' OR (v_result->>'balance')::bigint<>80 THEN
    RAISE EXCEPTION 'AUTHORIZED_AWARD_FAILED: %',v_result;
  END IF;
  v_result:=public.ekodi_points_operator_award_attendance('qa-operator',v_participation);
  IF v_result->>'reason'<>'DUPLICATE' THEN
    RAISE EXCEPTION 'REPLAY_NOT_BLOCKED: %',v_result;
  END IF;
  IF has_function_privilege('anon',
      'public.ekodi_points_operator_award_attendance(text,uuid)','EXECUTE') OR
     NOT has_function_privilege('authenticated',
      'public.ekodi_points_operator_award_attendance(text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC_ROLE_GRANTS_INVALID';
  END IF;
END $operator_test$;
SELECT 'POINT_OPERATOR_ISOLATED_SMOKE_PASS' AS result;
