-- Trusted backend-only cross-site transfer. No browser execution rights.
-- Policy and site activation are mandatory; transfers are not cash payouts.
create or replace function ekodi_points_private.transfer_points(
  p_from_site text, p_to_site text, p_user uuid,
  p_amount integer, p_event_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_policy public.ekodi_point_transfer_policies%rowtype;
  v_credit bigint;
  v_used bigint;
  v_from_balance bigint;
  v_to_balance bigint;
  v_first text;
  v_second text;
  v_group uuid := gen_random_uuid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_from_site is null or p_to_site is null or p_from_site=p_to_site
     or p_user is null or p_amount is null or p_amount <= 0 or p_amount > 100000
     or p_event_key is null or length(p_event_key) not between 8 and 200 then
    raise exception 'INVALID_POINT_TRANSFER';
  end if;
  -- Lock both wallets in deterministic order to avoid cross-transfer deadlocks.
  v_first := least(p_from_site,p_to_site);
  v_second := greatest(p_from_site,p_to_site);
  perform pg_advisory_xact_lock(hashtextextended(v_first || ':' || p_user::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_second || ':' || p_user::text,0));
  if (select count(*) from public.ekodi_point_sites
      where site_id in (p_from_site,p_to_site) and enabled) <> 2 then
    raise exception 'POINT_SITE_DISABLED';
  end if;
  select * into v_policy from public.ekodi_point_transfer_policies
    where from_site=p_from_site and to_site=p_to_site and enabled for update;
  if not found then raise exception 'TRANSFER_POLICY_DISABLED'; end if;
  if exists(select 1 from public.ekodi_point_ledger
    where site_id=p_from_site and user_id=p_user and event_key=p_event_key) then
    return jsonb_build_object('transferred',false,'reason','DUPLICATE');
  end if;
  v_credit := (p_amount::bigint * v_policy.numerator) / v_policy.denominator;
  if v_credit < 1 or v_credit > 100000000 then
    raise exception 'INVALID_TRANSFER_RATE';
  end if;
  v_start := v_day::timestamp at time zone 'Asia/Seoul';
  v_end := (v_day+1)::timestamp at time zone 'Asia/Seoul';
  select coalesce(-sum(amount),0) into v_used from public.ekodi_point_ledger
    where site_id=p_from_site and user_id=p_user and event_kind='transfer_out'
      and created_at>=v_start and created_at<v_end;
  if v_used+p_amount > v_policy.daily_cap then
    return jsonb_build_object('transferred',false,'reason','DAILY_CAP');
  end if;
  insert into public.ekodi_point_wallets(site_id,user_id)
    values(p_to_site,p_user) on conflict(site_id,user_id) do nothing;
  update public.ekodi_point_wallets
    set balance=balance-p_amount,updated_at=now()
    where site_id=p_from_site and user_id=p_user and balance>=p_amount
    returning balance into v_from_balance;
  if not found then
    return jsonb_build_object('transferred',false,'reason','INSUFFICIENT_BALANCE');
  end if;
  update public.ekodi_point_wallets
    set balance=balance+v_credit,updated_at=now()
    where site_id=p_to_site and user_id=p_user
    returning balance into v_to_balance;
  insert into public.ekodi_point_ledger
    (site_id,user_id,amount,event_kind,event_key,transfer_group,metadata)
    values
    (p_from_site,p_user,-p_amount,'transfer_out',p_event_key,v_group,
      jsonb_build_object('counterparty_site',p_to_site)),
    (p_to_site,p_user,v_credit::integer,'transfer_in',p_event_key,v_group,
      jsonb_build_object('counterparty_site',p_from_site));
  return jsonb_build_object('transferred',true,'debited',p_amount,
    'credited',v_credit,'from_balance',v_from_balance,'to_balance',v_to_balance,
    'transfer_id',v_group);
end;
$$;
revoke all on function ekodi_points_private.transfer_points(text,text,uuid,integer,text)
  from public,anon,authenticated;
grant execute on function ekodi_points_private.transfer_points(text,text,uuid,integer,text)
  to service_role;
