-- EKODI recognition goals: isolated/ephemeral only; runner wraps in transaction rollback.
DO $goals$
DECLARE
  u1 uuid;u2 uuid;p1 uuid;p2 uuid;v jsonb;e text;
BEGIN
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled)
    VALUES('qa-recognition-a','Recognition QA A',true),('qa-recognition-b','Recognition QA B',true);
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO u1;
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO u2;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('goalsa-'||replace(gen_random_uuid()::text,'-',''),'Goal A') RETURNING id INTO p1;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('goalsb-'||replace(gen_random_uuid()::text,'-',''),'Goal B') RETURNING id INTO p2;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email)
    VALUES(p1,u1,'goals-qa',gen_random_uuid()::text,'goalsa@example.invalid'),
          (p2,u2,'goals-qa',gen_random_uuid()::text,'goalsb@example.invalid');

  -- Both RPCs reject anonymous callers.
  e:=null;
  BEGIN PERFORM public.ekodi_points_my_recognition_goal('qa-recognition-a');
  EXCEPTION WHEN raise_exception THEN e:=SQLERRM; END;
  IF e IS DISTINCT FROM 'POINTS_AUTH_REQUIRED' THEN RAISE EXCEPTION 'anonymous read: %',e; END IF;
  e:=null;
  BEGIN PERFORM public.ekodi_points_set_recognition_goal('qa-recognition-a',3,10);
  EXCEPTION WHEN raise_exception THEN e:=SQLERRM; END;
  IF e IS DISTINCT FROM 'POINTS_AUTH_REQUIRED' THEN RAISE EXCEPTION 'anonymous write: %',e; END IF;

  PERFORM set_config('request.jwt.claim.sub',u1::text,true);
  v:=public.ekodi_points_my_recognition_goal('qa-recognition-a');
  IF (v->>'configured')::boolean OR (v->>'weekly_target_days')::integer<>3
     OR (v->>'target_activities_90d')::integer<>10
  THEN RAISE EXCEPTION 'default target invalid: %',v; END IF;
  v:=public.ekodi_points_set_recognition_goal('qa-recognition-a',5,30);
  IF v->>'configured'<>'true' OR v->>'weekly_target_days'<>'5'
  THEN RAISE EXCEPTION 'save failed: %',v; END IF;
  IF (public.ekodi_points_my_recognition_goal('qa-recognition-b')->>'configured')::boolean
  THEN RAISE EXCEPTION 'site goal leaked'; END IF;

  -- Another Person can have an independent goal for the same site.
  PERFORM set_config('request.jwt.claim.sub',u2::text,true);
  v:=public.ekodi_points_my_recognition_goal('qa-recognition-a');
  IF (v->>'configured')::boolean THEN RAISE EXCEPTION 'person goal leaked: %',v; END IF;
  PERFORM public.ekodi_points_set_recognition_goal('qa-recognition-a',2,7);
  PERFORM set_config('request.jwt.claim.sub',u1::text,true);
  IF (public.ekodi_points_my_recognition_goal('qa-recognition-a')->>'target_activities_90d')::integer<>30
  THEN RAISE EXCEPTION 'other person overwrote saved goal'; END IF;

  e:=null;
  BEGIN PERFORM public.ekodi_points_set_recognition_goal('qa-recognition-a',0,30);
  EXCEPTION WHEN raise_exception THEN e:=SQLERRM; END;
  IF e IS DISTINCT FROM 'INVALID_RECOGNITION_GOAL' THEN RAISE EXCEPTION 'invalid range: %',e; END IF;
  e:=null;
  BEGIN PERFORM public.ekodi_points_set_recognition_goal('qa-recognition-a',3,null);
  EXCEPTION WHEN raise_exception THEN e:=SQLERRM; END;
  IF e IS DISTINCT FROM 'INVALID_RECOGNITION_GOAL' THEN RAISE EXCEPTION 'mixed null: %',e; END IF;

  v:=public.ekodi_points_set_recognition_goal('qa-recognition-a',null,null);
  IF v->>'configured'<>'false' OR
     (public.ekodi_points_my_recognition_goal('qa-recognition-a')->>'configured')::boolean
  THEN RAISE EXCEPTION 'reset not performed: %',v; END IF;

  UPDATE public.ekodi_point_sites SET enabled=false WHERE site_id='qa-recognition-b';
  e:=null;
  BEGIN PERFORM public.ekodi_points_set_recognition_goal('qa-recognition-b',4,14);
  EXCEPTION WHEN raise_exception THEN e:=SQLERRM; END;
  IF e IS DISTINCT FROM 'POINT_SITE_NOT_AVAILABLE' THEN RAISE EXCEPTION 'disabled site accepted goal: %',e; END IF;
  IF EXISTS(SELECT 1 FROM public.ekodi_point_ledger WHERE site_id LIKE 'qa-recognition-%')
  THEN RAISE EXCEPTION 'recognition setting changed points ledger'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
END $goals$;
DO $priv$
BEGIN
  IF has_table_privilege('authenticated','ekodi_points_private.member_recognition_goals','SELECT')
  THEN RAISE EXCEPTION 'authenticated direct table read allowed'; END IF;
  IF has_table_privilege('authenticated','ekodi_points_private.member_recognition_goals','INSERT')
  THEN RAISE EXCEPTION 'authenticated direct table write allowed'; END IF;
  IF has_function_privilege('anon','public.ekodi_points_my_recognition_goal(text)','EXECUTE')
     OR has_function_privilege('anon','public.ekodi_points_set_recognition_goal(text,integer,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'anonymous RPC execution permitted'; END IF;
END $priv$;
SELECT 'POINT_RECOGNITION_GOALS_SMOKE_PASS' AS result;
