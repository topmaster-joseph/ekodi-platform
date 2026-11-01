-- 에코디 동행 H6: 구독권 청약철회 환불(2026-10-31).
-- 결제(입금 확인)일로부터 7일 이내, 그 구독권 기간에 요청·수락·거절·메시지·행사 신청을 한 번도 하지 않았다면
-- 회원이 스스로 청약철회를 신청한다. 신청 즉시 그 구독 기간을 회수하고 환불 대상(refund_due)으로 기록한다.
-- 돈은 자동으로 나가지 않는다. 운영자가 은행에서 송금한 뒤 송금 거래번호를 기록해 '환불 완료'로 바꾼다.
-- 가장 최근 구독권만 철회할 수 있다(이어서 산 구독권이 있으면 그것부터).

create table if not exists public.singles_order_refunds(
 reference text primary key references public.singles_bank_orders(reference),
 user_id uuid not null,
 amount_krw integer not null check (amount_krw between 100 and 10000000),
 reason text not null default 'withdrawal' check (reason in ('withdrawal')),
 status text not null default 'refund_due' check (status in ('refund_due','refunded')),
 revoked_days integer not null check (revoked_days between 1 and 366),
 requested_at timestamptz not null default now(),
 refund_due_at timestamptz not null default now(),
 refunded_at timestamptz,
 refunded_by uuid,
 refund_trace text,
 constraint singles_order_refunds_fields check (status <> 'refunded' or (refunded_at is not null and refunded_by is not null
   and refund_trace is not null and char_length(refund_trace) between 4 and 100))
);
create unique index if not exists singles_order_refunds_trace on public.singles_order_refunds(refund_trace) where refund_trace is not null;
create index if not exists singles_order_refunds_queue on public.singles_order_refunds(status,refund_due_at);
create index if not exists singles_order_refunds_user on public.singles_order_refunds(user_id,requested_at desc);
alter table public.singles_order_refunds enable row level security;
revoke all on table public.singles_order_refunds from public;
revoke all on table public.singles_order_refunds from anon;
revoke all on table public.singles_order_refunds from authenticated;
grant select,insert,update on table public.singles_order_refunds to service_role;

-- 청약철회 가능 여부(읽기 전용). 이유 코드: eligible / order_not_found / not_subscription / not_paid / already_requested /
-- withdrawal_period_over / newer_subscription_exists / subscription_period_ended / already_used
create or replace function public.singles_subscription_withdrawal_eval(p_user uuid,p_reference text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare o public.singles_bank_orders%rowtype; g public.singles_bank_grants%rowtype; s timestamptz; used boolean;
begin
 select * into o from public.singles_bank_orders where reference=p_reference and user_id=p_user;
 if not found then return jsonb_build_object('eligible',false,'reason','order_not_found'); end if;
 if o.plan_code not like 'sub\_%' then return jsonb_build_object('eligible',false,'reason','not_subscription'); end if;
 if o.status<>'verified' or o.verified_at is null then return jsonb_build_object('eligible',false,'reason','not_paid'); end if;
 if exists(select 1 from public.singles_order_refunds where reference=o.reference) then
  return jsonb_build_object('eligible',false,'reason','already_requested'); end if;
 if now()>o.verified_at+interval '7 days' then return jsonb_build_object('eligible',false,'reason','withdrawal_period_over'); end if;
 select * into g from public.singles_bank_grants where user_id=p_user and plan_code='subscription';
 if not found or g.last_order_reference<>o.reference then
  return jsonb_build_object('eligible',false,'reason','newer_subscription_exists'); end if;
 if g.expires_at<=now() then return jsonb_build_object('eligible',false,'reason','subscription_period_ended'); end if;
 -- 이 구독권 기간의 시작: 입금 확인 시각과 (만료 - 이 구독권 일수) 중 늦은 쪽.
 s:=greatest(o.verified_at,g.expires_at-make_interval(days=>o.duration_days));
 used:=exists(select 1 from public.singles_paid_requests where requester_id=p_user and created_at>=s)
  or exists(select 1 from public.singles_paid_requests where responder_id=p_user and decided_at>=s
            and status in ('accepted','declined','awaiting_payment','connected','lapsed'))
  or exists(select 1 from public.singles_messages where sender_id=p_user and created_at>=s)
  or exists(select 1 from public.singles_event_rsvps where user_id=p_user and created_at>=s);
 if used then return jsonb_build_object('eligible',false,'reason','already_used'); end if;
 return jsonb_build_object('eligible',true,'reason','eligible','amount_krw',o.amount_krw,
  'duration_days',o.duration_days,'deadline',o.verified_at+interval '7 days');
end $$;
revoke all on function public.singles_subscription_withdrawal_eval(uuid,text) from public;
revoke all on function public.singles_subscription_withdrawal_eval(uuid,text) from anon;
revoke all on function public.singles_subscription_withdrawal_eval(uuid,text) from authenticated;
grant execute on function public.singles_subscription_withdrawal_eval(uuid,text) to service_role;

-- 회원 본인의 청약철회 신청. 같은 트랜잭션에서 재확인 → 기간 회수 → 환불 대상 기록.
create or replace function public.singles_subscription_withdraw(p_user uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.singles_bank_orders%rowtype; g public.singles_bank_grants%rowtype; e jsonb;
begin
 select * into o from public.singles_bank_orders where reference=p_reference and user_id=p_user for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 select * into g from public.singles_bank_grants where user_id=p_user and plan_code='subscription' for update;
 e:=public.singles_subscription_withdrawal_eval(p_user,p_reference);
 if not (e->>'eligible')::boolean then raise exception 'withdrawal_not_allowed:%',e->>'reason' using errcode='22023'; end if;
 update public.singles_bank_grants set expires_at=greatest(now(),expires_at-make_interval(days=>o.duration_days)),updated_at=now()
  where user_id=p_user and plan_code='subscription';
 insert into public.singles_order_refunds(reference,user_id,amount_krw,revoked_days) values(o.reference,p_user,o.amount_krw,o.duration_days);
 return jsonb_build_object('status','refund_due','reference',o.reference,'amount_krw',o.amount_krw,
  'subscription_expires_at',(select expires_at from public.singles_bank_grants where user_id=p_user and plan_code='subscription'));
end $$;
revoke all on function public.singles_subscription_withdraw(uuid,text) from public;
revoke all on function public.singles_subscription_withdraw(uuid,text) from anon;
revoke all on function public.singles_subscription_withdraw(uuid,text) from authenticated;
grant execute on function public.singles_subscription_withdraw(uuid,text) to service_role;

-- 운영자 송금 기록(청약철회). 청구서 환불과 같은 규칙: 입금 확인 권한, 본인 건 금지, 거래번호 필수·전체 중복 금지.
create or replace function public.singles_order_refund_complete(p_operator uuid,p_reference text,p_trace text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.singles_order_refunds%rowtype; t text:=btrim(coalesce(p_trace,''));
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true) then
  raise exception 'verification_capability_required' using errcode='42501';
 end if;
 if char_length(t) not between 4 and 100 then raise exception 'refund_trace_required' using errcode='22023'; end if;
 select * into f from public.singles_order_refunds where reference=p_reference for update;
 if not found then raise exception 'refund_not_found' using errcode='P0002'; end if;
 if f.user_id=p_operator then raise exception 'operator_self_refund_forbidden' using errcode='42501'; end if;
 if f.status='refunded' then
  if f.refund_trace=t then return jsonb_build_object('status','refunded','reference',f.reference,'amount_krw',f.amount_krw,'already',true); end if;
  raise exception 'invoice_already_refunded' using errcode='23505';
 end if;
 if exists(select 1 from public.singles_order_refunds where refund_trace=t)
  or exists(select 1 from public.singles_request_invoices where refund_trace=t) then
  raise exception 'refund_trace_duplicate' using errcode='23505';
 end if;
 update public.singles_order_refunds set status='refunded',refunded_at=now(),refunded_by=p_operator,refund_trace=t where reference=f.reference;
 return jsonb_build_object('status','refunded','reference',f.reference,'amount_krw',f.amount_krw,'already',false);
end $$;
revoke all on function public.singles_order_refund_complete(uuid,text,text) from public;
revoke all on function public.singles_order_refund_complete(uuid,text,text) from anon;
revoke all on function public.singles_order_refund_complete(uuid,text,text) from authenticated;
grant execute on function public.singles_order_refund_complete(uuid,text,text) to service_role;

-- 청구서 환불도 청약철회 송금 거래번호와 겹치지 않게 다시 정의.
create or replace function public.singles_invoice_refund_complete(p_operator uuid,p_invoice uuid,p_trace text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.singles_request_invoices%rowtype; t text:=btrim(coalesce(p_trace,''));
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true) then
  raise exception 'verification_capability_required' using errcode='42501';
 end if;
 if char_length(t) not between 4 and 100 then raise exception 'refund_trace_required' using errcode='22023'; end if;
 select * into i from public.singles_request_invoices where id=p_invoice for update;
 if not found then raise exception 'invoice_not_found' using errcode='P0002'; end if;
 if i.user_id=p_operator then raise exception 'operator_self_refund_forbidden' using errcode='42501'; end if;
 if i.status='refunded' then
  if i.refund_trace=t then return jsonb_build_object('status','refunded','invoice_id',i.id,'amount_krw',i.amount_krw,'already',true); end if;
  raise exception 'invoice_already_refunded' using errcode='23505';
 end if;
 if i.status<>'refund_due' then raise exception 'invoice_not_refundable' using errcode='22023'; end if;
 if exists(select 1 from public.singles_request_invoices where refund_trace=t)
  or exists(select 1 from public.singles_order_refunds where refund_trace=t) then
  raise exception 'refund_trace_duplicate' using errcode='23505';
 end if;
 update public.singles_request_invoices set status='refunded',refunded_at=now(),refunded_by=p_operator,refund_trace=t where id=i.id;
 return jsonb_build_object('status','refunded','invoice_id',i.id,'amount_krw',i.amount_krw,'already',false);
end $$;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from public;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from anon;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from authenticated;
grant execute on function public.singles_invoice_refund_complete(uuid,uuid,text) to service_role;
