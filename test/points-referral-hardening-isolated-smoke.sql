-- Isolated development database only (#6739 P0 referral hardening).
-- Apply all point migrations first, then execute INSIDE BEGIN ... ROLLBACK.
-- Creates throwaway auth/person fixtures that MUST be rolled back.
DO $referral_hardening$
DECLARE
  v_inviter uuid;
  v_inviter_auth uuid;
  v_old_person uuid;
  v_old_auth uuid;
  v_new_auth uuid;
  v_new_person uuid;
  v_code uuid;
  v_denied text;
BEGIN
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-harden','Referral hardening QA',true,100);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-harden','referral',3,9,3,true);

  -- Inviter and an older existing member, both registered long before invite.
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now()-interval '90 days',now()-interval '90 days')
    RETURNING id INTO v_inviter_auth;
  INSERT INTO public.people(ekodi_id,display_name,created_at)
    VALUES('inv-'||replace(gen_random_uuid()::text,'-',''),'Inviter',now()-interval '90 days')
    RETURNING id INTO v_inviter;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email,linked_at)
    VALUES(v_inviter,v_inviter_auth,'qa',gen_random_uuid()::text,'Inviter@Example.invalid',now()-interval '90 days');
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now()-interval '60 days',now()-interval '60 days')
    RETURNING id INTO v_old_auth;
  INSERT INTO public.people(ekodi_id,display_name,created_at)
    VALUES('old-'||replace(gen_random_uuid()::text,'-',''),'Existing',now()-interval '60 days')
    RETURNING id INTO v_old_person;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email,linked_at)
    VALUES(v_old_person,v_old_auth,'qa',gen_random_uuid()::text,'existing@example.invalid',now()-interval '60 days');

  INSERT INTO public.ekodi_point_referral_invites(site_id,inviter_person_id,issued_at,expires_at)
    VALUES('qa-harden',v_inviter,now()-interval '1 minute',now()+interval '1 day')
    RETURNING invite_code INTO v_code;

  -- Case 1: brand-new auth + Person, but re-using an existing member's email
  -- (different letter case). Must be denied, and nothing may be merged.
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO v_new_auth;
  INSERT INTO public.people(ekodi_id,display_name)
    VALUES('new-'||replace(gen_random_uuid()::text,'-',''),'Re-registrant')
    RETURNING id INTO v_new_person;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email)
    VALUES(v_new_person,v_new_auth,'qa2',gen_random_uuid()::text,'EXISTING@example.invalid');
  PERFORM set_config('request.jwt.claim.sub',v_new_auth::text,true);
  v_denied:=NULL;
  BEGIN PERFORM public.ekodi_points_confirm_shared_signup(v_code);
  EXCEPTION WHEN raise_exception THEN v_denied:=SQLERRM;END;
  IF v_denied IS DISTINCT FROM 'REFERRAL_EXISTING_MEMBER' THEN
    RAISE EXCEPTION 'Existing-member email re-registration not refused: %',v_denied;
  END IF;
  IF (SELECT person_id FROM public.login_identities WHERE auth_user_id=v_new_auth)<>v_new_person THEN
    RAISE EXCEPTION 'Email match must never merge identities';
  END IF;

  -- Case 2: second account of the inviter (same email) is not a new member.
  UPDATE public.login_identities SET email='inviter@example.invalid' WHERE auth_user_id=v_new_auth;
  v_denied:=NULL;
  BEGIN PERFORM public.ekodi_points_confirm_shared_signup(v_code);
  EXCEPTION WHEN raise_exception THEN v_denied:=SQLERRM;END;
  IF v_denied IS DISTINCT FROM 'REFERRAL_EXISTING_MEMBER' THEN
    RAISE EXCEPTION 'Inviter self-account not refused: %',v_denied;
  END IF;

  -- Case 3: fresh email, but the Person also carries a (revoked) identity
  -- whose auth account predates the invite -> legacy account, denied.
  -- (Identities are attached by INSERT: reparenting via UPDATE is blocked
  -- by public.block_unreviewed_person_reparent where that guard exists.)
  UPDATE public.login_identities SET email='fresh@example.invalid' WHERE auth_user_id=v_new_auth;
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now()-interval '45 days',now()-interval '45 days')
    RETURNING id INTO v_old_auth;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email,status)
    VALUES(v_new_person,v_old_auth,'qa3',gen_random_uuid()::text,'legacy-alt@example.invalid','revoked');
  v_denied:=NULL;
  BEGIN PERFORM public.ekodi_points_confirm_shared_signup(v_code);
  EXCEPTION WHEN raise_exception THEN v_denied:=SQLERRM;END;
  IF v_denied IS DISTINCT FROM 'REFERRAL_NOT_NEW_MEMBER' THEN
    RAISE EXCEPTION 'Person with legacy auth identity not refused: %',v_denied;
  END IF;

  -- Case 4: remove the legacy link -> genuine new member is credited once.
  DELETE FROM public.login_identities WHERE auth_user_id=v_old_auth;
  IF (public.ekodi_points_confirm_shared_signup(v_code))->>'confirmed'<>'true' THEN
    RAISE EXCEPTION 'Genuine new member refused';
  END IF;
  IF (SELECT balance FROM public.ekodi_point_wallets WHERE site_id='qa-harden' AND user_id=v_inviter)<>3 THEN
    RAISE EXCEPTION 'Inviter balance mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM ekodi_points_private.wallet_reconciliation()) THEN
    RAISE EXCEPTION 'Ledger/wallet drift after referral';
  END IF;
END $referral_hardening$;
SELECT 'REFERRAL_HARDENING_ISOLATED_SMOKE_PASS' AS result;
