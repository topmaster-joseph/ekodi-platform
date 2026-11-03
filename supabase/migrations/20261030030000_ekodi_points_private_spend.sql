-- EKODI backend-only atomic point spending.
-- Called only after the trusted service validates user authorization,
-- permitted redemption product, pricing, and site policy.
create or replace function ekodi_points_private.spend(
  p_site text, p_user uuid, p_amount integer, p_event_key text,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance bigint;
begin
  if p_site is null or p_user is null or p_amount is null
     or p_amount <= 0 or p_amount > 100000
     or p_event_key is null or length(p_event_key) not between 8 and 200
     or p_reason is null or length(trim(p_reason)) not between 3 and 120 then
    raise exception 'INVALID_POINT_SPEND';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site || ':' || p_user::text, 0));
  if not exists(select 1 from public.ekodi_point_sites where site_id=p_site and enabled) then
    raise exception 'POINT_SITE_DISABLED';
  end if;
  if exists(select 1 from public.ekodi_point_ledger
            where site_id=p_site and user_id=p_user and event_key=p_event_key) then
    select balance into v_balance from public.ekodi_point_wallets
      where site_id=p_site and user_id=p_user;
    return jsonb_build_object('spent',false,'reason','DUPLICATE','balance',v_balance);
  end if;
  update public.ekodi_point_wallets
    set balance=balance-p_amount,updated_at=now()
    where site_id=p_site and user_id=p_user and balance>=p_amount
    returning balance into v_balance;
  if not found then
    return jsonb_build_object('spent',false,'reason','INSUFFICIENT_BALANCE');
  end if;
  insert into public.ekodi_point_ledger
    (site_id,user_id,amount,event_kind,event_key,metadata)
    values(p_site,p_user,-p_amount,'spend',p_event_key,
           jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('spent',true,'amount',p_amount,'balance',v_balance);
end;
$$;
revoke all on function ekodi_points_private.spend(text,uuid,integer,text,text)
  from public,anon,authenticated;
grant execute on function ekodi_points_private.spend(text,uuid,integer,text,text)
  to service_role;
