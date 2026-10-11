-- Post-operator-capability hardening: only can_verify may settle money, even via privileged RPC.
create or replace function public.singles_bank_confirm_order(
 p_reference text, p_operator uuid, p_action text, p_trace text default null, p_reason text default null
) returns text language plpgsql security definer
 set search_path = pg_catalog, public
as $$
declare r public.singles_bank_orders%rowtype;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_action not in ('verified','rejected') then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into r from public.singles_bank_orders where reference=p_reference for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if r.status<>'reported_paid' then raise exception 'order_not_awaiting_verification' using errcode='23514'; end if;
 if p_action='verified' then
  if not exists(select 1 from public.singles_memberships
    where user_id=r.user_id and status='active' and adult_verified_at is not null)
  then raise exception 'member_no_longer_eligible' using errcode='23514'; end if;
  if p_trace is null or char_length(trim(p_trace))<4 or char_length(p_trace)>100
  then raise exception 'bank_trace_required' using errcode='22023'; end if;
  update public.singles_bank_orders set status='verified',verified_at=now(),verified_by=p_operator,
    bank_trace=trim(p_trace),rejection_reason=null where reference=p_reference;
  insert into public.singles_bank_grants(user_id,plan_code,expires_at,last_order_reference)
    values(r.user_id,r.plan_code,now()+make_interval(days=>r.duration_days),r.reference)
    on conflict(user_id,plan_code) do update set
      expires_at=greatest(public.singles_bank_grants.expires_at,now())+make_interval(days=>r.duration_days),
      last_order_reference=excluded.last_order_reference,updated_at=now();
  insert into public.singles_bank_audit(reference,actor_id,action)
    values(p_reference,p_operator,'admin_verified');
 else
  update public.singles_bank_orders set status='rejected',verified_by=p_operator,
    rejection_reason=left(nullif(trim(coalesce(p_reason,'')),''),200) where reference=p_reference;
  insert into public.singles_bank_audit(reference,actor_id,action)
    values(p_reference,p_operator,'admin_rejected');
 end if;
 return p_action;
end $$;

revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.singles_bank_confirm_order(text,uuid,text,text,text) to service_role;
-- Immutable, redacted bank configuration change audit. Account numbers are never copied here.
create table if not exists public.singles_bank_settings_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 account_last4 text not null check(account_last4 ~ '^[0-9]{4}$'),
 community_amount_krw integer,
 consulting_amount_krw integer,
 created_at timestamptz not null default now()
);
alter table public.singles_bank_settings_audit enable row level security;
revoke all on table public.singles_bank_settings_audit from public,anon,authenticated;
grant select,insert on table public.singles_bank_settings_audit to service_role;
