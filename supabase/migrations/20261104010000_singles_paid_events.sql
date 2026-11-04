-- 에코디 동행(2026-11-04): 참가비 있는 행사·모임 선택 개설(소유자 결정).
-- 흐름: 신청 → 자리 확보(결제 대기) + 계좌이체 주문 발급 → 운영자 입금 확인 → 신청 완료.
-- 기본 환불 규칙(소유자가 바꿀 수 있는 운영 기본값):
--  · 결제 기한(신청 후 3일, 늦어도 행사 1시간 전) 안에 입금 확인이 안 되면 신청 자동 취소, 자리 반환.
--  · 행사 시작 24시간 전까지 본인이 취소하면 전액 환불, 그 뒤 취소는 환불하지 않음(신청 화면에 미리 안내).
--  · 운영자가 행사를 취소하면 결제한 모든 분께 전액 환불.
--  · 취소·만료된 뒤 들어온 입금은 전액 환불.
-- 돈은 자동으로 나가지 않는다. 환불 대상은 singles_order_refunds에 기록되고 운영자가 송금 후 거래번호를 남긴다.

alter table public.singles_bank_plans drop constraint if exists singles_bank_plans_code_check;
alter table public.singles_bank_plans add constraint singles_bank_plans_code_check check (code in
 ('community','community_90','community_365','consulting','credit_initial','credit_topup',
  'sub_1d','sub_10d','sub_20d','sub_30d','subscription','request_fee','event_fee'));
insert into public.singles_bank_plans(code,display_name,amount_krw,duration_days,active)
 values('event_fee','동행 행사·모임 참가비',null,1,false)
 on conflict(code) do update set display_name=excluded.display_name,active=false;

alter table public.singles_event_rsvps drop constraint if exists singles_event_rsvps_status_check;
alter table public.singles_event_rsvps add constraint singles_event_rsvps_status_check
 check (status in ('requested','approved','cancelled','rejected','pending_payment'));
alter table public.singles_event_rsvps add column if not exists fee_krw integer not null default 0;
alter table public.singles_event_rsvps add column if not exists order_reference text;
alter table public.singles_event_rsvps add column if not exists pay_due_at timestamptz;
alter table public.singles_event_rsvps add column if not exists paid_at timestamptz;
create unique index if not exists singles_event_rsvps_order on public.singles_event_rsvps(order_reference) where order_reference is not null;
create index if not exists singles_event_rsvps_due on public.singles_event_rsvps(status,pay_due_at) where status='pending_payment';

alter table public.singles_order_refunds drop constraint if exists singles_order_refunds_reason_check;
alter table public.singles_order_refunds add constraint singles_order_refunds_reason_check
 check (reason in ('withdrawal','event_cancel','event_cancelled','event_unavailable'));
alter table public.singles_order_refunds alter column revoked_days drop not null;

-- 참가 신청(무료는 바로 신청, 유료는 자리 확보 + 주문 발급). 행 잠금으로 정원을 지킨다.
create or replace function public.singles_event_rsvp(p_user uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ev public.singles_events%rowtype; taken integer; cur public.singles_event_rsvps%rowtype; s public.singles_bank_settings%rowtype;
 ref text; st text; due timestamptz;
begin
 select * into ev from public.singles_events where id=p_event for update;
 if not found or ev.state<>'published' then raise exception 'event_not_available' using errcode='P0002'; end if;
 if ev.kind='event' and ev.starts_at<=now() then raise exception 'event_not_available' using errcode='P0002'; end if;
 select * into cur from public.singles_event_rsvps where event_id=p_event and user_id=p_user;
 if found and cur.status in ('requested','approved') then
  return jsonb_build_object('status',cur.status,'already',true);
 end if;
 if found and cur.status='pending_payment' then
  select status into st from public.singles_bank_orders where reference=cur.order_reference;
  if st in ('awaiting_transfer','reported_paid') then
   return jsonb_build_object('status','pending_payment','already',true,'order_reference',cur.order_reference,'fee_krw',cur.fee_krw,'pay_due_at',cur.pay_due_at);
  end if;
 end if;
 select count(*) into taken from public.singles_event_rsvps where event_id=p_event and status in ('requested','approved','pending_payment')
  and not (user_id=p_user);
 if ev.capacity is not null and taken>=ev.capacity then raise exception 'event_full' using errcode='23514'; end if;
 if ev.fee_krw=0 then
  insert into public.singles_event_rsvps(event_id,user_id,status,fee_krw,order_reference,pay_due_at,paid_at) values(p_event,p_user,'requested',0,null,null,null)
   on conflict (event_id,user_id) do update set status='requested',created_at=now(),fee_krw=0,order_reference=null,pay_due_at=null,paid_at=null;
  return jsonb_build_object('status','requested','taken',taken+1,'capacity',ev.capacity);
 end if;
 select * into s from public.singles_bank_settings where id=1;
 if not found or not s.active or s.bank_name is null or s.account_number is null or s.account_holder is null
 then raise exception 'bank_payment_not_configured' using errcode='P0001'; end if;
 due:=least(now()+interval '3 days',greatest(now()+interval '1 hour',ev.starts_at-interval '1 hour'));
 if ev.kind='group' then due:=now()+interval '3 days'; end if;
 ref:='EDH-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status)
  values(ref,p_user,'event_fee',ev.fee_krw,1,s.bank_name,s.account_number,s.account_holder,'awaiting_transfer');
 insert into public.singles_bank_audit(reference,actor_id,action) values(ref,p_user,'opened');
 insert into public.singles_event_rsvps(event_id,user_id,status,fee_krw,order_reference,pay_due_at,paid_at)
  values(p_event,p_user,'pending_payment',ev.fee_krw,ref,due,null)
  on conflict (event_id,user_id) do update set status='pending_payment',created_at=now(),fee_krw=ev.fee_krw,order_reference=ref,pay_due_at=due,paid_at=null;
 return jsonb_build_object('status','pending_payment','taken',taken+1,'capacity',ev.capacity,'order_reference',ref,'fee_krw',ev.fee_krw,'pay_due_at',due);
end $$;
revoke all on function public.singles_event_rsvp(uuid,uuid) from public;
revoke all on function public.singles_event_rsvp(uuid,uuid) from anon;
revoke all on function public.singles_event_rsvp(uuid,uuid) from authenticated;
grant execute on function public.singles_event_rsvp(uuid,uuid) to service_role;

-- 본인 취소: 결제 대기면 주문 취소, 결제했으면 24시간 전까지 전액 환불 대상.
create or replace function public.singles_event_rsvp_cancel(p_user uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.singles_event_rsvps%rowtype; ev public.singles_events%rowtype; refund integer:=0;
begin
 select * into ev from public.singles_events where id=p_event for update;
 select * into r from public.singles_event_rsvps where event_id=p_event and user_id=p_user for update;
 if not found or r.status not in ('requested','approved','pending_payment') then raise exception 'rsvp_not_found' using errcode='P0002'; end if;
 if r.status='pending_payment' then
  update public.singles_bank_orders set status='cancelled' where reference=r.order_reference and status='awaiting_transfer';
 elsif r.paid_at is not null and r.fee_krw>0 and ev.starts_at>now()+interval '24 hours' then
  insert into public.singles_order_refunds(reference,user_id,amount_krw,reason,revoked_days)
   values(r.order_reference,p_user,r.fee_krw,'event_cancel',null) on conflict (reference) do nothing;
  refund:=r.fee_krw;
 end if;
 update public.singles_event_rsvps set status='cancelled' where id=r.id;
 return jsonb_build_object('status','cancelled','refund_krw',refund);
end $$;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from public;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from anon;
revoke all on function public.singles_event_rsvp_cancel(uuid,uuid) from authenticated;
grant execute on function public.singles_event_rsvp_cancel(uuid,uuid) to service_role;

-- 운영자 행사 취소: 결제한 모든 분 전액 환불 대상, 결제 대기 주문 취소.
create or replace function public.singles_event_cancel(p_owner uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0; total integer:=0;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_owner and enabled=true and can_configure=true) then
  raise exception 'owner_capability_required' using errcode='42501';
 end if;
 perform 1 from public.singles_events where id=p_event for update;
 if not found then raise exception 'event_not_found' using errcode='P0002'; end if;
 update public.singles_events set state='cancelled',updated_at=now() where id=p_event;
 for r in select * from public.singles_event_rsvps where event_id=p_event and status in ('requested','approved','pending_payment') for update loop
  if r.status='pending_payment' then
   update public.singles_bank_orders set status='cancelled' where reference=r.order_reference and status='awaiting_transfer';
  elsif r.paid_at is not null and r.fee_krw>0 then
   insert into public.singles_order_refunds(reference,user_id,amount_krw,reason,revoked_days)
    values(r.order_reference,r.user_id,r.fee_krw,'event_cancelled',null) on conflict (reference) do nothing;
   n:=n+1; total:=total+r.fee_krw;
  end if;
  update public.singles_event_rsvps set status='cancelled' where id=r.id;
 end loop;
 return jsonb_build_object('status','cancelled','refunds',n,'refund_krw',total);
end $$;
revoke all on function public.singles_event_cancel(uuid,uuid) from public;
revoke all on function public.singles_event_cancel(uuid,uuid) from anon;
revoke all on function public.singles_event_cancel(uuid,uuid) from authenticated;
grant execute on function public.singles_event_cancel(uuid,uuid) to service_role;

-- 결제 기한이 지난 결제 대기 신청 정리(매일 자동 운영에서 호출).
create or replace function public.singles_event_payment_housekeeping()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
 for r in select * from public.singles_event_rsvps where status='pending_payment' and pay_due_at<now() for update loop
  update public.singles_bank_orders set status='cancelled' where reference=r.order_reference and status='awaiting_transfer';
  update public.singles_event_rsvps set status='cancelled' where id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.singles_event_payment_housekeeping() from public;
revoke all on function public.singles_event_payment_housekeeping() from anon;
revoke all on function public.singles_event_payment_housekeeping() from authenticated;
grant execute on function public.singles_event_payment_housekeeping() to service_role;

create or replace function public.singles_daily_ops()
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare h jsonb; m jsonb; e integer;
begin
 h:=public.singles_postpaid_housekeeping(null,'expired');
 perform public.singles_paid_request_release(null,'expired');
 e:=public.singles_event_payment_housekeeping();
 m:=public.singles_ops_review();
 return jsonb_build_object('housekeeping',h,'event_payments_expired',e,'metrics',m);
end $$;
revoke all on function public.singles_daily_ops() from public;
revoke all on function public.singles_daily_ops() from anon;
revoke all on function public.singles_daily_ops() from authenticated;
grant execute on function public.singles_daily_ops() to service_role;

-- 입금 확인: 행사 참가비 처리 추가(나머지 흐름은 2026-10-31 정의와 같다).
create or replace function public.singles_bank_confirm_order(p_reference text,p_operator uuid,p_action text,p_trace text default null,p_reason text default null)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.singles_bank_orders%rowtype; credit int; inv public.singles_request_invoices%rowtype; rv public.singles_event_rsvps%rowtype;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_action not in ('verified','rejected') then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into r from public.singles_bank_orders where reference=p_reference for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if r.user_id=p_operator then raise exception 'operator_self_confirmation_forbidden' using errcode='42501'; end if;
 if r.status<>'reported_paid' then raise exception 'order_not_awaiting_verification' using errcode='23514'; end if;
 if p_action='verified' then
  if r.plan_code not in ('request_fee','event_fee') and not exists(select 1 from public.singles_memberships
    where user_id=r.user_id and status='active' and adult_verified_at is not null)
  then raise exception 'member_no_longer_eligible' using errcode='23514'; end if;
  if p_trace is null or char_length(trim(p_trace))<4 or char_length(p_trace)>100
  then raise exception 'bank_trace_required' using errcode='22023'; end if;
  update public.singles_bank_orders set status='verified',verified_at=now(),verified_by=p_operator,
    bank_trace=trim(p_trace),rejection_reason=null where reference=p_reference;
  if r.plan_code like 'sub\_%' then
   insert into public.singles_bank_grants(user_id,plan_code,expires_at,last_order_reference)
    values(r.user_id,'subscription',now()+make_interval(days=>r.duration_days),r.reference)
    on conflict(user_id,plan_code) do update set
     expires_at=greatest(public.singles_bank_grants.expires_at,now())+make_interval(days=>r.duration_days),
     last_order_reference=excluded.last_order_reference,updated_at=now();
  elsif r.plan_code='request_fee' then
   select * into inv from public.singles_request_invoices where order_reference=r.reference for update;
   if found then
    if inv.status='unpaid' then
     update public.singles_request_invoices set status='paid',paid_at=now() where id=inv.id;
     perform public.singles_postpaid_try_connect(inv.request_id);
    elsif inv.status='void' then
     update public.singles_request_invoices set status='refund_due',paid_at=now() where id=inv.id;
    end if;
   end if;
  elsif r.plan_code='event_fee' then
   select * into rv from public.singles_event_rsvps where order_reference=r.reference for update;
   if found and rv.status='pending_payment' then
    update public.singles_event_rsvps set status='requested',paid_at=now() where id=rv.id;
   else
    -- 취소·만료 뒤 들어온 입금은 전액 환불 대상.
    insert into public.singles_order_refunds(reference,user_id,amount_krw,reason,revoked_days)
     values(r.reference,r.user_id,r.amount_krw,'event_unavailable',null) on conflict (reference) do nothing;
   end if;
  else
   select credit_krw into credit from public.singles_bank_plans where code=r.plan_code;
   if credit is not null then
    insert into public.singles_credit_accounts(user_id,balance_krw) values(r.user_id,credit)
     on conflict(user_id) do update set balance_krw=public.singles_credit_accounts.balance_krw+excluded.balance_krw,updated_at=now();
    insert into public.singles_credit_ledger(user_id,delta_krw,reason,ref)
     values(r.user_id,credit,case when r.plan_code='credit_initial' then 'join_fee' else 'topup' end,r.reference);
   else
    insert into public.singles_bank_grants(user_id,plan_code,expires_at,last_order_reference)
     values(r.user_id,r.plan_code,now()+make_interval(days=>r.duration_days),r.reference)
     on conflict(user_id,plan_code) do update set
      expires_at=greatest(public.singles_bank_grants.expires_at,now())+make_interval(days=>r.duration_days),
      last_order_reference=excluded.last_order_reference,updated_at=now();
   end if;
  end if;
  insert into public.singles_bank_audit(reference,actor_id,action) values(p_reference,p_operator,'admin_verified');
 else
  update public.singles_bank_orders set status='rejected',verified_by=p_operator,
    rejection_reason=left(nullif(trim(coalesce(p_reason,'')),''),200) where reference=p_reference;
  insert into public.singles_bank_audit(reference,actor_id,action) values(p_reference,p_operator,'admin_rejected');
 end if;
 return p_action;
end $$;
revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from public;
revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from anon;
revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from authenticated;
grant execute on function public.singles_bank_confirm_order(text,uuid,text,text,text) to service_role;
