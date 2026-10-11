-- Private, atomic credit reservation and receiver-confirmed debit.
-- No sale, credit funding, matchmaking or paid access activated by this migration.
create or replace function public.singles_reserve_message_credit(
 p_sender uuid, p_receiver uuid, p_request uuid, p_product text
) returns uuid
language plpgsql security definer set search_path=pg_catalog, public
as $$
declare
 v_credit public.singles_message_credit_wallets%rowtype;
 v_charge public.singles_message_consent_charges%rowtype;
 v_scope text;
begin
 if p_sender is null or p_receiver is null or p_sender=p_receiver or p_request is null then
  raise exception 'invalid_sender_receiver_request';
 end if;
 select scope into v_scope from public.singles_product_catalog
 where code=p_product and active=true and legal_reviewed=true;
 if v_scope not in ('per_message','per_contact') or v_scope is null then
  raise exception 'product_not_active_or_not_credit';
 end if;
 -- Caller must validate the authenticated sender, an existing mutual-consent request,
 -- a valid bank-confirmed purchase and any applicable rate limits before using this function.
 select * into v_charge from public.singles_message_consent_charges
 where request_id=p_request for update;
 if found then
  if v_charge.sender_id=p_sender and v_charge.receiver_id=p_receiver and
     v_charge.product_code=p_product and v_charge.status='pending' then
   return v_charge.id;
  end if;
  raise exception 'request_already_used';
 end if;
 select * into v_credit from public.singles_message_credit_wallets
 where user_id=p_sender and scope=v_scope for update;
 if not found or v_credit.available<1 then raise exception 'insufficient_prepaid_credit'; end if;
 update public.singles_message_credit_wallets
 set available=available-1,reserved=reserved+1,updated_at=now()
 where user_id=p_sender and scope=v_scope;
 insert into public.singles_message_consent_charges(
 sender_id,receiver_id,request_id,product_code,status,reservation_units,charged_units)
 values (p_sender,p_receiver,p_request,p_product,'pending',1,0)
 returning * into v_charge;
 return v_charge.id;
end;
$$;

create or replace function public.singles_decide_message_consent(
 p_receiver uuid,p_request uuid,p_decision text
) returns text
language plpgsql security definer set search_path=pg_catalog, public
as $$
declare
 v_charge public.singles_message_consent_charges%rowtype;
 v_scope text;
begin
 if p_receiver is null or p_request is null or p_decision not in ('accepted','declined') then
  raise exception 'invalid_consent_decision';
 end if;
 select * into v_charge from public.singles_message_consent_charges
 where request_id=p_request for update;
 if not found then raise exception 'request_not_found'; end if;
 if v_charge.receiver_id<>p_receiver then raise exception 'receiver_only'; end if;
 if v_charge.status in ('accepted','declined') then return v_charge.status; end if;
 if v_charge.status<>'pending' then raise exception 'request_no_longer_pending'; end if;
 select scope into v_scope from public.singles_product_catalog where code=v_charge.product_code;
 if v_scope not in ('per_message','per_contact') or v_scope is null then
  raise exception 'invalid_credit_scope';
 end if;
 update public.singles_message_credit_wallets set
  reserved=reserved-v_charge.reservation_units,
  available=available+case when p_decision='declined' then v_charge.reservation_units else 0 end,
  updated_at=now()
 where user_id=v_charge.sender_id and scope=v_scope and reserved>=v_charge.reservation_units;
 if not found then raise exception 'reserved_balance_mismatch'; end if;
 update public.singles_message_consent_charges set
  status=p_decision,
  accepted_at=case when p_decision='accepted' then now() else null end,
  charged_at=case when p_decision='accepted' then now() else null end,
  charged_units=case when p_decision='accepted' then reservation_units else 0 end
 where id=v_charge.id;
 return p_decision;
end;
$$;

revoke all on function public.singles_reserve_message_credit(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.singles_decide_message_consent(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_reserve_message_credit(uuid,uuid,uuid,text) to service_role;
grant execute on function public.singles_decide_message_consent(uuid,uuid,text) to service_role;
comment on function public.singles_reserve_message_credit(uuid,uuid,uuid,text) is
 'Service-side primitive only. Requires previously confirmed funds, authenticated identities, consent request and release gate.';
