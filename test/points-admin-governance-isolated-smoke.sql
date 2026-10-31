-- Isolated development database only (#6739 P1 admin governance).
-- Apply all point migrations first, then execute INSIDE BEGIN ... ROLLBACK.
DO $admin_gov$
DECLARE
  a1 text := 'ekodi-admin:owner@example.invalid';
  a2 text := 'ekodi-admin:second@example.invalid';
  v_person uuid;
  v jsonb;
  v_req uuid;
  v_req2 uuid;
  v_err text;
  v_ledger bigint;
  v_balance bigint;
  v_broken bigint;
BEGIN
  -- Unauthenticated / malformed actor is refused.
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_propose('owner','site','{"site_id":"qa-gov"}','{"display_name":"QA"}','reason ok','qa-gov-key-0');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'ADMIN_ACTOR_REQUIRED' THEN RAISE EXCEPTION 'actor guard failed: %',v_err; END IF;

  -- Standard policy change: create a disabled site, self-approval allowed.
  v:=public.ekodi_points_admin_propose(a1,'site','{"site_id":"qa-gov"}',
     '{"display_name":"Governance QA","daily_cap":100,"enabled":false}','new pilot site','qa-gov-key-1');
  IF v->>'risk'<>'standard' THEN RAISE EXCEPTION 'site create risk: %',v; END IF;
  v_req:=(v->>'request_id')::uuid;
  IF (public.ekodi_points_admin_propose(a1,'site','{"site_id":"qa-gov"}',
     '{"display_name":"Governance QA","daily_cap":100,"enabled":false}','new pilot site','qa-gov-key-1'))->>'replayed'<>'true'
  THEN RAISE EXCEPTION 'idempotent replay failed'; END IF;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_propose(a1,'site','{"site_id":"qa-gov"}','{"display_name":"Other"}','new pilot site','qa-gov-key-1');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'ADMIN_REQUEST_KEY_REUSED' THEN RAISE EXCEPTION 'key reuse: %',v_err; END IF;
  IF (public.ekodi_points_admin_decide(a1,v_req,true,'ok'))->>'status'<>'applied' THEN RAISE EXCEPTION 'site apply failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ekodi_point_sites WHERE site_id='qa-gov' AND NOT enabled AND daily_cap=100)
  THEN RAISE EXCEPTION 'site not created as disabled'; END IF;

  -- Enabling a site is economic: requester cannot self-approve.
  v_req:=(public.ekodi_points_admin_propose(a1,'site','{"site_id":"qa-gov"}','{"enabled":true}','pilot launch','qa-gov-key-2')->>'request_id')::uuid;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_decide(a1,v_req,true,'self');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'SECOND_APPROVER_REQUIRED' THEN RAISE EXCEPTION 'self approval allowed: %',v_err; END IF;
  IF (public.ekodi_points_admin_decide(a2,v_req,true,'second ok'))->>'status'<>'applied' THEN RAISE EXCEPTION 'second approval failed'; END IF;

  -- Low-trust rule ceilings and unknown fields are enforced at proposal time.
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_propose(a1,'rule','{"site_id":"qa-gov","rule_id":"active"}',
    '{"points":6,"daily_cap":50,"daily_events":10,"min_active_seconds":60,"enabled":true}','raise reward','qa-gov-key-3');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'LOW_TRUST_RULE_LIMIT' THEN RAISE EXCEPTION 'low-trust limit: %',v_err; END IF;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_propose(a1,'site','{"site_id":"qa-gov"}','{"balance":999}','sneaky','qa-gov-key-4');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'UNKNOWN_ADMIN_FIELD' THEN RAISE EXCEPTION 'unknown field: %',v_err; END IF;

  -- Concurrent edits: second request built on an old snapshot becomes stale.
  v_req:=(public.ekodi_points_admin_propose(a1,'rule','{"site_id":"qa-gov","rule_id":"attend"}',
    '{"points":10,"daily_cap":10,"daily_events":1,"min_active_seconds":0,"enabled":true}','attendance','qa-gov-key-5')->>'request_id')::uuid;
  v_req2:=(public.ekodi_points_admin_propose(a2,'rule','{"site_id":"qa-gov","rule_id":"attend"}',
    '{"points":20,"daily_cap":20,"daily_events":1,"min_active_seconds":0,"enabled":true}','attendance alt','qa-gov-key-6')->>'request_id')::uuid;
  PERFORM public.ekodi_points_admin_decide(a2,v_req,true,NULL);
  IF (public.ekodi_points_admin_decide(a1,v_req2,true,NULL))->>'status'<>'stale' THEN RAISE EXCEPTION 'stale not detected'; END IF;
  IF (SELECT points FROM public.ekodi_point_rules WHERE site_id='qa-gov' AND rule_id='attend')<>10
  THEN RAISE EXCEPTION 'stale request overwrote policy'; END IF;

  -- Earn once, then manual adjustment and reversal as compensating entries.
  INSERT INTO public.people(ekodi_id,display_name) VALUES('gov-'||replace(gen_random_uuid()::text,'-',''),'Gov QA') RETURNING id INTO v_person;
  PERFORM ekodi_points_private.award_activity('qa-gov',v_person,'attend','attend:qa-gov-0001','{}'::jsonb);
  SELECT id INTO v_ledger FROM public.ekodi_point_ledger WHERE site_id='qa-gov' AND user_id=v_person AND event_kind='earn';

  v_req:=(public.ekodi_points_admin_propose(a1,'adjustment',jsonb_build_object('site_id','qa-gov','person_id',v_person),
    '{"amount":-11}','correct overpay','qa-gov-key-7')->>'request_id')::uuid;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_decide(a2,v_req,true,NULL);
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'ADJUSTMENT_EXCEEDS_BALANCE' THEN RAISE EXCEPTION 'negative balance allowed: %',v_err; END IF;
  PERFORM public.ekodi_points_admin_cancel(a1,v_req);

  v_req:=(public.ekodi_points_admin_propose(a1,'adjustment',jsonb_build_object('site_id','qa-gov','person_id',v_person),
    '{"amount":5}','event volunteer','qa-gov-key-8')->>'request_id')::uuid;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_decide(a1,v_req,true,NULL);
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'SECOND_APPROVER_REQUIRED' THEN RAISE EXCEPTION 'adjustment self approval: %',v_err; END IF;
  PERFORM public.ekodi_points_admin_decide(a2,v_req,true,NULL);
  SELECT balance INTO v_balance FROM public.ekodi_point_wallets WHERE site_id='qa-gov' AND user_id=v_person;
  IF v_balance<>15 THEN RAISE EXCEPTION 'adjusted balance expected 15, got %',v_balance; END IF;

  v_req:=(public.ekodi_points_admin_propose(a2,'reversal',jsonb_build_object('ledger_id',v_ledger),'{}','mistaken attendance','qa-gov-key-9')->>'request_id')::uuid;
  PERFORM public.ekodi_points_admin_decide(a1,v_req,true,NULL);
  SELECT balance INTO v_balance FROM public.ekodi_point_wallets WHERE site_id='qa-gov' AND user_id=v_person;
  IF v_balance<>5 THEN RAISE EXCEPTION 'reversed balance expected 5, got %',v_balance; END IF;
  IF (SELECT amount FROM public.ekodi_point_ledger WHERE id=v_ledger)<>10 THEN RAISE EXCEPTION 'original entry modified'; END IF;
  v_err:=NULL;
  BEGIN PERFORM public.ekodi_points_admin_propose(a2,'reversal',jsonb_build_object('ledger_id',v_ledger),'{}','again please','qa-gov-key-10');
  EXCEPTION WHEN raise_exception THEN v_err:=SQLERRM; END;
  IF v_err IS DISTINCT FROM 'ALREADY_REVERSED' THEN RAISE EXCEPTION 'double reversal: %',v_err; END IF;
  IF EXISTS(SELECT 1 FROM ekodi_points_private.wallet_reconciliation()) THEN RAISE EXCEPTION 'ledger drift'; END IF;

  -- Overview and member audit read model.
  v:=public.ekodi_points_admin_overview(a1);
  IF (v->>'reconciliation_drift')::int<>0 OR v->'audit_chain_broken_at'<>'null'::jsonb
     OR jsonb_array_length(v->'audit')<10 THEN RAISE EXCEPTION 'overview wrong: %',v->'kpis'; END IF;
  v:=public.ekodi_points_admin_member_ledger(a1,'qa-gov',v_person,10);
  IF jsonb_array_length(v->'entries')<>3 THEN RAISE EXCEPTION 'member ledger entries: %',v; END IF;
  IF NOT EXISTS(SELECT 1 FROM ekodi_points_private.admin_audit WHERE action='view_member_ledger') THEN
    RAISE EXCEPTION 'member lookup not audited'; END IF;

  -- Append-only guarantees and tamper detection.
  v_err:=NULL;
  BEGIN UPDATE ekodi_points_private.admin_audit SET actor='x' WHERE seq=(SELECT min(seq) FROM ekodi_points_private.admin_audit);
  EXCEPTION WHEN check_violation THEN v_err:='blocked'; END;
  IF v_err IS NULL THEN RAISE EXCEPTION 'audit row mutable'; END IF;
  ALTER TABLE ekodi_points_private.admin_audit DISABLE TRIGGER ekodi_points_admin_audit_append_only;
  UPDATE ekodi_points_private.admin_audit SET detail='{"forged":true}'
    WHERE seq=(SELECT min(seq)+1 FROM ekodi_points_private.admin_audit);
  ALTER TABLE ekodi_points_private.admin_audit ENABLE TRIGGER ekodi_points_admin_audit_append_only;
  v_broken:=ekodi_points_private.admin_audit_verify();
  IF v_broken IS NULL THEN RAISE EXCEPTION 'tampering not detected'; END IF;

  -- Grants: never executable by browser roles.
  IF has_function_privilege('anon','public.ekodi_points_admin_propose(text,text,jsonb,jsonb,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ekodi_points_admin_decide(text,uuid,boolean,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ekodi_points_admin_overview(text)','EXECUTE')
     OR has_function_privilege('authenticated','public.ekodi_points_admin_member_ledger(text,text,uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.ekodi_points_admin_decide(text,uuid,boolean,text)','EXECUTE')
     OR has_table_privilege('service_role','ekodi_points_private.admin_audit','INSERT')
  THEN RAISE EXCEPTION 'admin governance grants unsafe'; END IF;
END $admin_gov$;
SELECT 'POINT_ADMIN_GOVERNANCE_SMOKE_PASS' AS result;
