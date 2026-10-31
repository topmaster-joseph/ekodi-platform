-- Isolated development only, executed after the foundation, private awards,
-- reconciliation, identity resolver and referral migrations.
-- MUST run inside BEGIN ... ROLLBACK. Touches a DEV auth fixture temporarily
-- to simulate a confirmed signup; never use this file on production.
DO $referral_positive$
DECLARE
  v_auth uuid;
  v_inviter uuid;
  v_referred uuid;
  v_code uuid;
  v_second_code uuid;
  v_result jsonb;
  v_balance bigint;
BEGIN
  SELECT id INTO v_auth FROM auth.users a WHERE NOT EXISTS
    (SELECT 1 FROM public.login_identities li WHERE li.auth_user_id=a.id) LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Need an unlinked development auth fixture';END IF;
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=v_auth;
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-share','Share positive QA',true,100);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-share','referral',3,9,3,true);
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('referrer-qa-'||replace(gen_random_uuid()::text,'-',''),'Referrer QA')
    RETURNING id INTO v_inviter;
  -- An invite predating signup models a pre-existing, server-issued code.
  INSERT INTO public.ekodi_point_referral_invites
    (site_id,inviter_person_id,issued_at,expires_at)
    VALUES('qa-share',v_inviter,clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 day') RETURNING invite_code INTO v_code;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('referred-qa-'||replace(gen_random_uuid()::text,'-',''),'New member QA')
    RETURNING id INTO v_referred;
  INSERT INTO public.login_identities
    (person_id,auth_user_id,provider,provider_subject,email,status)
    VALUES(v_referred,v_auth,'referral-qa',gen_random_uuid()::text,
      'confirmed-referral@example.invalid','active');
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  -- P0: a pre-existing confirmed auth account relinked to a brand-new Person
  -- must NOT count as a new member (people.created_at alone is insufficient).
  UPDATE auth.users SET created_at=clock_timestamp()-interval '30 days' WHERE id=v_auth;
  BEGIN
    PERFORM public.ekodi_points_confirm_shared_signup(v_code);
    RAISE EXCEPTION 'Legacy auth account credited as new member';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'REFERRAL_NOT_NEW_MEMBER' THEN RAISE; END IF;
  END;
  -- Simulate a genuine signup after the invite (rolled back with the txn).
  UPDATE auth.users SET created_at=now() WHERE id=v_auth;
  v_result:=public.ekodi_points_confirm_shared_signup(v_code);
  IF v_result->>'confirmed'<>'true' THEN
    RAISE EXCEPTION 'Confirmed signup failed: %',v_result;
  END IF;
  SELECT balance INTO v_balance FROM public.ekodi_point_wallets
    WHERE site_id='qa-share' AND user_id=v_inviter;
  IF v_balance<>3 THEN RAISE EXCEPTION 'Inviter expected 3P, got %',v_balance;END IF;
  IF EXISTS(SELECT 1 FROM public.ekodi_point_wallets WHERE user_id=v_referred)
  THEN RAISE EXCEPTION 'Referred member was credited in error';END IF;
  v_result:=public.ekodi_points_confirm_shared_signup(v_code);
  IF v_result->>'reason'<>'ALREADY_CREDITED' THEN
    RAISE EXCEPTION 'Same-code repeat was not refused: %',v_result;
  END IF;
  INSERT INTO public.ekodi_point_referral_invites
    (site_id,inviter_person_id,issued_at,expires_at)
    VALUES('qa-share',v_inviter,clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 day')
    RETURNING invite_code INTO v_second_code;
  v_result:=public.ekodi_points_confirm_shared_signup(v_second_code);
  IF v_result->>'reason'<>'ALREADY_CREDITED' THEN
    RAISE EXCEPTION 'Cross-code duplicate was not refused: %',v_result;
  END IF;
  IF EXISTS(SELECT 1 FROM ekodi_points_private.wallet_reconciliation())
  THEN RAISE EXCEPTION 'Referral ledger drift';END IF;
END $referral_positive$;
SELECT 'REFERRAL_POSITIVE_SMOKE_PASS' AS result;
