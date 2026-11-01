-- Isolated development database only (#6739 P2 evidence adapters + anomalies).
-- Apply all point migrations first, then execute INSIDE BEGIN ... ROLLBACK.
DO $p2$
DECLARE
  a1 text := 'ekodi-admin:owner@example.invalid';
  a2 text := 'ekodi-admin:second@example.invalid';
  v_auth uuid; v_auth2 uuid; v_member uuid; v_member2 uuid;
  v jsonb; v_req uuid; v_claim uuid; v_err text; v_bal bigint; i integer;
BEGIN
  INSERT INTO public.ekodi_point_sites(site_id,display_name,enabled,daily_cap) VALUES('qa-p2','P2 QA',true,100);
  INSERT INTO public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,enabled)
    VALUES('qa-p2','content',10,30,3,true),('qa-p2','devotion',8,80,10,true),('qa-p2','burst',1,100,100,true);

  -- Adapter registry goes through audited requests; enabling needs a 2nd admin.
  v := public.ekodi_points_admin_propose_adapter(a1,'{"site_id":"qa-p2","rule_id":"content","adapter":"content_approval"}',
        '{"trust":"verified","member_claimable":true,"enabled":true}','approved posts earn points','qa-p2-key-1');
  IF v->>'risk'<>'economic' THEN RAISE EXCEPTION 'adapter enable must be economic: %',v; END IF;
  v_req := (v->>'request_id')::uuid;
  v_err := NULL;
  BEGIN PERFORM public.ekodi_points_admin_decide(a1,v_req,true,NULL);
  EXCEPTION WHEN raise_exception THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'SECOND_APPROVER_REQUIRED' THEN RAISE EXCEPTION 'adapter self approval: %',v_err; END IF;
  IF (public.ekodi_points_admin_decide(a2,v_req,true,NULL))->>'status'<>'applied' THEN RAISE EXCEPTION 'adapter apply failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_evidence_adapters WHERE site_id='qa-p2' AND adapter='content_approval' AND enabled)
  THEN RAISE EXCEPTION 'adapter not enabled'; END IF;

  -- Self-report can never be registered as verified (schema constraint).
  v_err := NULL;
  BEGIN INSERT INTO public.ekodi_point_evidence_adapters VALUES('qa-p2','devotion','devotion_self_report','verified',true,true);
  EXCEPTION WHEN check_violation THEN v_err := 'blocked'; END;
  IF v_err IS NULL THEN RAISE EXCEPTION 'self-report accepted as verified'; END IF;
  -- Low-trust adapter on an over-limit rule cannot award.
  INSERT INTO public.ekodi_point_evidence_adapters VALUES('qa-p2','devotion','devotion_self_report','low_trust',true,true);

  -- Members.
  INSERT INTO auth.users(id,created_at,email_confirmed_at) VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO v_auth;
  INSERT INTO auth.users(id,created_at,email_confirmed_at) VALUES(gen_random_uuid(),now(),now()) RETURNING id INTO v_auth2;
  INSERT INTO public.people(ekodi_id,display_name) VALUES('p2a-'||replace(gen_random_uuid()::text,'-',''),'P2 A') RETURNING id INTO v_member;
  INSERT INTO public.people(ekodi_id,display_name) VALUES('p2b-'||replace(gen_random_uuid()::text,'-',''),'P2 B') RETURNING id INTO v_member2;
  INSERT INTO public.login_identities(person_id,auth_user_id,provider,provider_subject,email) VALUES
    (v_member,v_auth,'qa-p2',gen_random_uuid()::text,'p2a@example.invalid'),
    (v_member2,v_auth2,'qa-p2',gen_random_uuid()::text,'p2b@example.invalid');

  -- Anonymous claim refused; authenticated claim is pending and awards nothing.
  v_err := NULL;
  BEGIN PERFORM public.ekodi_points_submit_evidence_claim('qa-p2','content','content_approval','post/1001','my essay');
  EXCEPTION WHEN raise_exception THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'POINTS_AUTH_REQUIRED' THEN RAISE EXCEPTION 'anonymous claim: %',v_err; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  v := public.ekodi_points_submit_evidence_claim('qa-p2','content','content_approval','post/1001','my essay');
  IF v->>'submitted'<>'true' OR v->>'rewarded'<>'false' THEN RAISE EXCEPTION 'claim submit: %',v; END IF;
  v_claim := (v->>'claim_id')::uuid;
  IF (public.ekodi_points_submit_evidence_claim('qa-p2','content','content_approval','post/1001',''))->>'reason'<>'ALREADY_SUBMITTED'
  THEN RAISE EXCEPTION 'duplicate claim accepted'; END IF;
  IF EXISTS(SELECT 1 FROM public.ekodi_point_ledger WHERE site_id='qa-p2') THEN RAISE EXCEPTION 'claim awarded before approval'; END IF;
  -- A member cannot claim a non-claimable / disabled adapter.
  v_err := NULL;
  BEGIN PERFORM public.ekodi_points_submit_evidence_claim('qa-p2','content','attendance_checkin','evt/1','');
  EXCEPTION WHEN raise_exception THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'EVIDENCE_CLAIM_NOT_AVAILABLE' THEN RAISE EXCEPTION 'unregistered adapter claim: %',v_err; END IF;

  -- Approval awards through the shared path, exactly once.
  v := public.ekodi_points_admin_decide_claim(a1,v_claim,true,'looks good');
  IF v->'award'->>'awarded'<>'true' THEN RAISE EXCEPTION 'claim approve did not award: %',v; END IF;
  IF (public.ekodi_points_admin_decide_claim(a1,v_claim,true,NULL))->>'replayed'<>'true' THEN RAISE EXCEPTION 'claim replay'; END IF;
  SELECT balance INTO v_bal FROM public.ekodi_point_wallets WHERE site_id='qa-p2' AND user_id=v_member;
  IF v_bal<>10 THEN RAISE EXCEPTION 'expected 10P, got %',v_bal; END IF;

  -- Same evidence claimed by another person is flagged as shared evidence.
  PERFORM set_config('request.jwt.claim.sub',v_auth2::text,true);
  v_claim := (public.ekodi_points_submit_evidence_claim('qa-p2','content','content_approval','post/1001','also mine')->>'claim_id')::uuid;
  PERFORM public.ekodi_points_admin_decide_claim(a1,v_claim,true,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_anomalies WHERE kind='shared_evidence' AND person_id=v_member2)
  THEN RAISE EXCEPTION 'shared evidence not flagged'; END IF;

  -- Low-trust adapter on a rule above low-trust ceilings refuses to award.
  v_err := NULL;
  BEGIN PERFORM ekodi_points_private.award_evidence('qa-p2','devotion',v_member,'devotion_self_report','qt/2026-11-01','{}');
  EXCEPTION WHEN raise_exception THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'LOW_TRUST_RULE_LIMIT' THEN RAISE EXCEPTION 'low-trust ceiling: %',v_err; END IF;

  -- Rejections: three rejected claims in a week are flagged by the detectors.
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  FOR i IN 1..3 LOOP
    v_claim := (public.ekodi_points_submit_evidence_claim('qa-p2','content','content_approval','post/20'||i,'')->>'claim_id')::uuid;
    PERFORM public.ekodi_points_admin_decide_claim(a1,v_claim,false,'not approved content');
  END LOOP;

  -- Real-time burst detection: 20+ earn events within one hour.
  INSERT INTO public.ekodi_point_evidence_adapters VALUES('qa-p2','burst','operator_confirmed','verified',false,true);
  FOR i IN 1..21 LOOP
    PERFORM ekodi_points_private.award_evidence('qa-p2','burst',v_member2,'operator_confirmed','job/'||i,'{}');
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_anomalies WHERE kind='burst' AND person_id=v_member2 AND site_id='qa-p2')
  THEN RAISE EXCEPTION 'burst not flagged'; END IF;
  IF (SELECT count(*) FROM public.ekodi_point_anomalies WHERE kind='burst' AND person_id=v_member2)<>1
  THEN RAISE EXCEPTION 'burst not deduplicated'; END IF;

  -- Periodic detectors (scan) are idempotent and include rejection streaks.
  v := public.ekodi_points_admin_scan(a1);
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_anomalies WHERE kind='claim_rejections' AND person_id=v_member)
  THEN RAISE EXCEPTION 'claim rejections not flagged'; END IF;
  IF (public.ekodi_points_admin_scan(a1))->>'new_findings'<>'0' THEN RAISE EXCEPTION 'detectors not idempotent'; END IF;
  IF jsonb_array_length(v->'adapters')<3 THEN RAISE EXCEPTION 'scan adapters missing'; END IF;

  -- Drift detector: simulate a wallet drift without touching the ledger.
  UPDATE public.ekodi_point_wallets SET balance=balance+7 WHERE site_id='qa-p2' AND user_id=v_member;
  PERFORM public.ekodi_points_admin_scan(a1);
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_anomalies WHERE kind='ledger_drift' AND severity='critical')
  THEN RAISE EXCEPTION 'drift not flagged'; END IF;
  UPDATE public.ekodi_point_wallets SET balance=balance-7 WHERE site_id='qa-p2' AND user_id=v_member;

  -- Resolution requires a reason and is audited.
  v_err := NULL;
  BEGIN PERFORM public.ekodi_points_admin_resolve_anomaly(a1,(SELECT min(anomaly_id) FROM public.ekodi_point_anomalies),'resolved','');
  EXCEPTION WHEN raise_exception THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'ADMIN_REASON_REQUIRED' THEN RAISE EXCEPTION 'resolve without reason: %',v_err; END IF;
  PERFORM public.ekodi_points_admin_resolve_anomaly(a1,(SELECT min(anomaly_id) FROM public.ekodi_point_anomalies),'resolved','checked with site operator');
  IF NOT EXISTS(SELECT 1 FROM ekodi_points_private.admin_audit WHERE action='anomaly_resolved') THEN RAISE EXCEPTION 'resolution not audited'; END IF;
  IF ekodi_points_private.admin_audit_verify() IS NOT NULL THEN RAISE EXCEPTION 'audit chain broken'; END IF;
  IF EXISTS(SELECT 1 FROM ekodi_points_private.wallet_reconciliation()) THEN RAISE EXCEPTION 'ledger drift remains'; END IF;

  -- Grants.
  IF has_function_privilege('anon','public.ekodi_points_submit_evidence_claim(text,text,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.ekodi_points_submit_evidence_claim(text,text,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ekodi_points_admin_decide_claim(text,uuid,boolean,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ekodi_points_admin_scan(text)','EXECUTE')
     OR has_function_privilege('authenticated','ekodi_points_private.award_evidence(text,text,uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('service_role','ekodi_points_private.admin_decide_core(text,uuid,boolean,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ekodi_points_admin_decide(text,uuid,boolean,text)','EXECUTE')
     OR has_table_privilege('authenticated','public.ekodi_point_evidence_claims','SELECT')
  THEN RAISE EXCEPTION 'P2 grants unsafe'; END IF;
END $p2$;
SELECT 'POINT_EVIDENCE_ANOMALY_SMOKE_PASS' AS result;
