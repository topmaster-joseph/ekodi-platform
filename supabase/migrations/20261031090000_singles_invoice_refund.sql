-- 에코디 동행 H3: 환불 대상(refund_due) 청구서 송금 처리(2026-10-31).
-- 돈은 자동으로 나가지 않는다. 운영자가 은행에서 직접 송금한 뒤, 그 송금 거래번호를 기록해 '환불 완료'로 바꾼다.
-- 원칙: 입금 확인과 같은 권한(can_verify), 본인 청구서 처리 금지, 거래번호 필수·중복 금지, 같은 요청 재처리는 결과만 돌려줌.

alter table public.singles_request_invoices drop constraint if exists singles_request_invoices_status_check;
alter table public.singles_request_invoices add constraint singles_request_invoices_status_check
 check (status in ('unpaid','paid','void','refund_due','refunded'));
alter table public.singles_request_invoices add column if not exists refund_due_at timestamptz;
alter table public.singles_request_invoices add column if not exists refunded_at timestamptz;
alter table public.singles_request_invoices add column if not exists refunded_by uuid;
alter table public.singles_request_invoices add column if not exists refund_trace text;
alter table public.singles_request_invoices drop constraint if exists singles_request_invoices_refund_fields;
alter table public.singles_request_invoices add constraint singles_request_invoices_refund_fields
 check (status <> 'refunded' or (refunded_at is not null and refunded_by is not null
   and refund_trace is not null and char_length(refund_trace) between 4 and 100));
create unique index if not exists singles_request_invoices_refund_trace
 on public.singles_request_invoices(refund_trace) where refund_trace is not null;
create index if not exists singles_request_invoices_refund_queue
 on public.singles_request_invoices(status,refund_due_at) where status in ('refund_due','refunded');

-- 환불 대상이 된 시각을 남긴다(3영업일 지급 기한 표시용).
create or replace function public.singles_invoice_refund_due_stamp()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status='refund_due' and (tg_op='INSERT' or old.status is distinct from 'refund_due') then
  new.refund_due_at:=coalesce(new.refund_due_at,now());
 end if;
 return new;
end $$;
revoke all on function public.singles_invoice_refund_due_stamp() from public;
revoke all on function public.singles_invoice_refund_due_stamp() from anon;
revoke all on function public.singles_invoice_refund_due_stamp() from authenticated;
drop trigger if exists singles_invoice_refund_due_stamp on public.singles_request_invoices;
create trigger singles_invoice_refund_due_stamp before insert or update of status on public.singles_request_invoices
 for each row execute function public.singles_invoice_refund_due_stamp();
-- 복제·점검 모드에서도 기록이 빠지지 않게 항상 실행.
alter table public.singles_request_invoices enable always trigger singles_invoice_refund_due_stamp;
update public.singles_request_invoices set refund_due_at=coalesce(paid_at,created_at)
 where status='refund_due' and refund_due_at is null;

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
 if exists(select 1 from public.singles_request_invoices where refund_trace=t) then
  raise exception 'refund_trace_duplicate' using errcode='23505';
 end if;
 update public.singles_request_invoices set status='refunded',refunded_at=now(),refunded_by=p_operator,refund_trace=t where id=i.id;
 return jsonb_build_object('status','refunded','invoice_id',i.id,'amount_krw',i.amount_krw,'already',false);
end $$;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from public;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from anon;
revoke all on function public.singles_invoice_refund_complete(uuid,uuid,text) from authenticated;
grant execute on function public.singles_invoice_refund_complete(uuid,uuid,text) to service_role;
