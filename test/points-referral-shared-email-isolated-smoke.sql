-- Isolated development database only (#6739 P0 shared-email guard).
-- Apply all point migrations first, then execute INSIDE BEGIN ... ROLLBACK.
DO $shared_email$
DECLARE
  v_inviter uuid; v_inviter_auth uuid;
  v_a_auth uuid; v_a uuid; v_b_auth uuid; v_b uuid;
  v_code uuid; v_denied text;
BEGIN
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    VALUES('qa-shared-email','Shared email QA',true,100);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-shared-email','referral',2,10,5,true);
  INSERT INTO auth.users(id,created_at,email_confirmed_at)
    VALUES(gen_random_uuid(),now()-interval '90 days',now()-interval '90 days') RETURNING id INTO v_inviter_auth;
  INSERT INTO public.people(ekodi_id,display_name,created_at)
    VALUES('inv-'||replace(gen_random_uuid()::text,'-',''),'Inviter',now()-interval '90 days') RETURNING id INTO v_inviter;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email,linked_at)
    VALUES(v_inviter,v_inviter_auth,'qa',gen_random_uuid()::text,'inviter@example.invalid',now()-interval '90 days');
  INSERT INTO public.ekodi_point_referral_invites(site_id,inviter_person_id,issued_at,expires_at)
    VALUES('qa-shared-email',v_inviter,now()-interval '5 minutes',now()+interval '1 day') RETURNING invite_code INTO v_code;

  -- First fresh Person (e.g. Kakao) with mailbox M: genuine, credited once.
  INSERT INTO auth.users(id,created_at,email_confirmed_at) VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO v_a_auth;
  INSERT INTO public.people(ekodi_id,display_name) VALUES('a-'||replace(gen_random_uuid()::text,'-',''),'First') RETURNING id INTO v_a;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email)
    VALUES(v_a,v_a_auth,'qa-kakao',gen_random_uuid()::text,'same@example.invalid');
  PERFORM set_config('request.jwt.claim.sub',v_a_auth::text,true);
  IF (public.ekodi_points_confirm_shared_signup(v_code))->>'confirmed'<>'true' THEN
    RAISE EXCEPTION 'Genuine first new member refused';
  END IF;

  -- Second fresh Person (e.g. Google) with the same mailbox, also after invite.
  INSERT INTO auth.users(id,created_at,email_confirmed_at) VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO v_b_auth;
  INSERT INTO public.people(ekodi_id,display_name) VALUES('b-'||replace(gen_random_uuid()::text,'-',''),'Second') RETURNING id INTO v_b;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email)
    VALUES(v_b,v_b_auth,'qa-google',gen_random_uuid()::text,' SAME@example.invalid ');
  PERFORM set_config('request.jwt.claim.sub',v_b_auth::text,true);
  v_denied:=NULL;
  BEGIN PERFORM public.ekodi_points_confirm_shared_signup(v_code);
  EXCEPTION WHEN raise_exception THEN v_denied:=SQLERRM;END;
  IF v_denied IS DISTINCT FROM 'REFERRAL_EXISTING_MEMBER' THEN
    RAISE EXCEPTION 'Same-mailbox second Person not refused: %',v_denied;
  END IF;
  IF (SELECT person_id FROM public.login_identities WHERE auth_user_id=v_b_auth)<>v_b THEN
    RAISE EXCEPTION 'Email match must never merge identities';
  END IF;
  IF (SELECT balance FROM public.ekodi_point_wallets WHERE site_id='qa-shared-email' AND user_id=v_inviter)<>2 THEN
    RAISE EXCEPTION 'Inviter credited more than once for one mailbox';
  END IF;
  IF EXISTS(SELECT 1 FROM ekodi_points_private.wallet_reconciliation()) THEN
    RAISE EXCEPTION 'Ledger/wallet drift after shared-email check';
  END IF;
END $shared_email$;
SELECT 'REFERRAL_SHARED_EMAIL_SMOKE_PASS' AS result;
