-- Run on an isolated staging database AFTER applying point migrations.
-- Required fixture: one auth.users row not already linked in login_identities.
-- Must be run INSIDE an explicit transaction which is then ROLLED BACK.
-- Never run this fixture outside a rollback transaction.
DO $points_test$
DECLARE
  auth_id uuid; person_id uuid; campaign_id uuid;
  site_a text := 'qa_' || left(replace(gen_random_uuid()::text,'-',''),12);
  site_b text := 'qb_' || left(replace(gen_random_uuid()::text,'-',''),12);
  result jsonb;
  amt bigint;
  rejected boolean := false;
BEGIN
  select a.id into auth_id from auth.users a
  where not exists (select 1 from public.login_identities li where li.auth_user_id=a.id)
  limit 1;
  if auth_id is null then raise exception 'Needs an unlinked auth fixture'; end if;
  insert into public.people(ekodi_id,display_name)
    values('points-smoke-'||replace(gen_random_uuid()::text,'-',''),'Points QA')
    returning id into person_id;
  insert into public.login_identities(person_id,auth_user_id,provider,provider_subject,email,status)
    values(person_id,auth_id,'points-smoke',gen_random_uuid()::text,'qa@example.invalid','active');
  if ekodi_points_private.resolve_person_for_auth(auth_id) is distinct from person_id then
    raise exception 'Canonical identity lookup failed';
  end if;
  insert into public.ekodi_point_sites(site_id,display_name,enabled,daily_cap)
    values(site_a,'Test A',true,500),(site_b,'Test B',true,500);
  insert into public.ekodi_point_rules(site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled)
    values(site_a,'active',20,60,3,60,true);
  insert into public.ekodi_point_transfer_policies(from_site,to_site,numerator,denominator,daily_cap,enabled)
    values(site_a,site_b,1,2,150,true);
  insert into public.ekodi_point_donation_campaigns(site_id,title,recipient_name,enabled)
    values(site_b,'QA donation campaign','QA recipient',true)
    returning campaign_id into campaign_id;
  begin
    perform ekodi_points_private.award_activity(site_a,person_id,'active','points-invalid-0001',
      '{"verified_active_seconds":10}'::jsonb);
  exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'Low activity duration was accepted'; end if;
  result := ekodi_points_private.award_activity(site_a,person_id,'active','points-earn-0001',
    '{"verified_active_seconds":65}'::jsonb);
  if (result->>'balance')::bigint <> 20 then raise exception 'Award failed: %',result; end if;
  result := ekodi_points_private.award_activity(site_a,person_id,'active','points-earn-0001',
    '{"verified_active_seconds":65}'::jsonb);
  if result->>'reason' <> 'DUPLICATE' then raise exception 'Award replay: %',result; end if;
  perform ekodi_points_private.award_activity(site_a,person_id,'active','points-earn-0002',
    '{"verified_active_seconds":65}'::jsonb);
  result := ekodi_points_private.spend(site_a,person_id,5,'points-spend-0001','QA purchase');
  if (result->>'balance')::bigint <> 35 then raise exception 'Spend failed: %',result; end if;
  result := ekodi_points_private.spend(site_a,person_id,100,'points-spend-0002','QA overdraw');
  if result->>'reason' <> 'INSUFFICIENT_BALANCE' then raise exception 'Overdraw allowed'; end if;
  result := ekodi_points_private.transfer_points(site_a,site_b,person_id,10,'points-transfer-0001');
  if (result->>'credited')::bigint <> 5 then raise exception 'Transfer failed: %',result; end if;
  result := ekodi_points_private.transfer_points(site_a,site_b,person_id,10,'points-transfer-0001');
  if result->>'reason' <> 'DUPLICATE' then raise exception 'Transfer replay'; end if;
  result := ekodi_points_private.donate_points(campaign_id,person_id,3,'points-donate-0001');
  if (result->>'balance')::bigint <> 2 then raise exception 'Donation failed: %',result; end if;
  result := ekodi_points_private.donate_points(campaign_id,person_id,3,'points-donate-0001');
  if result->>'reason' <> 'DUPLICATE' then raise exception 'Donation replay'; end if;
  select balance into amt from public.ekodi_point_wallets where site_id=site_a and user_id=person_id;
  if amt <> 25 then raise exception 'Incorrect source balance %',amt; end if;
  if exists(select 1 from ekodi_points_private.wallet_reconciliation()
    where site_id in (site_a,site_b)) then raise exception 'Ledger mismatch'; end if;
  rejected := false;
  begin update public.ekodi_point_ledger set amount=amount+1
    where site_id=site_a and user_id=person_id;
  exception when sqlstate '23514' then rejected := true; end;
  if not rejected then raise exception 'Ledger update must be rejected'; end if;
END $points_test$;
