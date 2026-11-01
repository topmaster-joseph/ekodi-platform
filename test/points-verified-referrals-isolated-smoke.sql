-- Isolated development database only. After foundation/awards/identity/referral
-- migrations, execute inside BEGIN ... ROLLBACK. Never persist test identities.
DO $referral_test$
DECLARE
  v_auth uuid;
  v_person uuid;
  v_invite uuid;
  v_result jsonb;
  v_denied boolean;
  v_total bigint;
BEGIN
  SELECT id INTO v_auth FROM auth.users u WHERE NOT EXISTS
    (SELECT 1 FROM public.login_identities l WHERE l.auth_user_id=u.id) LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Dev unlinked auth fixture required';END IF;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('referral-qa-'||replace(gen_random_uuid()::text,'-',''),'Referral QA')
    RETURNING id INTO v_person;
  INSERT INTO public.login_identities
    (person_id,auth_user_id,provider,provider_subject,email,status)
    VALUES(v_person,v_auth,'referral-smoke',gen_random_uuid()::text,
      'referral-qa@example.invalid','active');
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-share','Referral QA',true,100);
  INSERT INTO public.ekodi_point_rules
    (site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-share','referral',3,9,3,true);

  v_denied:=false;
  BEGIN PERFORM public.ekodi_points_issue_share_invite('qa-share');
  EXCEPTION WHEN raise_exception THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Anonymous invite issuance allowed';END IF;

  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  v_result:=public.ekodi_points_issue_share_invite('qa-share');
  IF v_result->>'rewarded'<>'false'
    OR v_result->>'reason'<>'SHARE_LINK_ISSUED_NOT_CONFIRMED' THEN
    RAISE EXCEPTION 'Unverified share credited: %',v_result;
  END IF;
  v_invite:=(v_result->>'invite_code')::uuid;
  v_denied:=false;
  BEGIN PERFORM public.ekodi_points_confirm_shared_signup(v_invite);
  EXCEPTION WHEN raise_exception THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Self referral credited';END IF;

  PERFORM public.ekodi_points_issue_share_invite('qa-share');
  PERFORM public.ekodi_points_issue_share_invite('qa-share');
  v_denied:=false;
  BEGIN PERFORM public.ekodi_points_issue_share_invite('qa-share');
  EXCEPTION WHEN raise_exception THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Invite issuance daily cap bypassed';END IF;

  SELECT count(*) INTO v_total FROM public.ekodi_point_ledger
    WHERE site_id='qa-share';
  IF v_total<>0 THEN RAISE EXCEPTION 'Share attempt created ledger credit';END IF;
  IF has_table_privilege('anon','public.ekodi_point_referral_invites','SELECT')
    OR has_table_privilege('authenticated','public.ekodi_point_referral_rewards','INSERT')
    OR has_function_privilege('anon','public.ekodi_points_issue_share_invite(text)','EXECUTE')
    OR has_function_privilege('anon','public.ekodi_points_confirm_shared_signup(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Referral grants unsafe';
  END IF;
END $referral_test$;
SELECT 'REFERRAL_ISOLATED_NEGATIVE_SMOKE_PASS' AS result;
