-- EKODI 동행 과금(2026-10-27 결정): 월 이용권 50,000원 + 요청 크레딧 1단위=10,000원.
-- 요청 시에는 요청자 크레딧 1단위를 '잡아두기'만 하고, 상대가 수락하는 순간
-- 요청자 1단위 확정 + 응답자 1단위 차감. 거절·만료·탈퇴 시 요청자에게 반환.
-- 최초 충전은 50만원(50단위) 필수, 이후 10만원(10단위) 단위 추가 충전.
-- 판매 개시는 별도: 플랜 active=false, 기능 스위치 SINGLES_REQUEST_BILLING_ENABLED 기본 OFF.

alter table public.singles_bank_plans drop constraint if exists singles_bank_plans_code_check;
alter table public.singles_bank_plans add constraint singles_bank_plans_code_check
 check (code in ('community','community_90','community_365','consulting','credit_initial','credit_topup'));
alter table public.singles_bank_plans add column if not exists credit_units integer
 check (credit_units is null or credit_units between 1 and 1000);
update public.singles_bank_plans set amount_krw=50000,display_name='동행 월 이용권 (30일)' where code='community';
insert into public.singles_bank_plans(code,display_name,amount_krw,duration_days,active,credit_units) values
 ('credit_initial','동행 기본 적립금 (요청 크레딧 50회)',500000,1,false,50),
 ('credit_topup','동행 적립금 추가 충전 (요청 크레딧 10회)',100000,1,false,10)
 on conflict(code) do update set display_name=excluded.display_name,amount_krw=excluded.amount_krw,credit_units=excluded.credit_units;

alter table public.singles_message_credit_wallets drop constraint if exists singles_message_credit_wallets_scope_check;
alter table public.singles_message_credit_wallets add constraint singles_message_credit_wallets_scope_check
 check (scope in ('per_message','per_contact','request'));

create table if not exists public.singles_request_billing(
 interest_id uuid primary key references public.singles_interests(id) on delete cascade,
 requester_id uuid not null,
 responder_id uuid not null,
 status text not null default 'pending' check (status in ('pending','accepted','declined','expired','withdrawn')),
 requester_units integer not null default 0 check (requester_units between 0 and 1),
 responder_units integer not null default 0 check (responder_units between 0 and 1),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 check (requester_id<>responder_id),
 check (status<>'accepted' or (requester_units=1 and responder_units=1 and decided_at is not null)),
 check (status not in ('declined','expired','withdrawn') or (requester_units=0 and responder_units=0))
);
create index if not exists singles_request_billing_pending on public.singles_request_billing(created_at) where status='pending';
create table if not exists public.singles_request_ledger(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 delta_units integer not null check (delta_units<>0),
 reason text not null check (reason in ('topup','request_reserved','request_charged','request_released','response_charged','refund')),
 ref text not null,
 created_at timestamptz not null default now()
);
create index if not exists singles_request_ledger_user on public.singles_request_ledger(user_id,created_at desc);
alter table public.singles_request_billing enable row level security;
alter table public.singles_request_ledger enable row level security;
revoke all on table public.singles_request_billing,public.singles_request_ledger from public,anon,authenticated;
grant select on table public.singles_request_billing,public.singles_request_ledger to service_role;

-- 요청 생성: 연결(호감) 행 생성 + 요청자 크레딧 1단위 잡아두기를 한 트랜잭션으로.
create or replace function public.singles_request_create(p_requester uuid,p_responder uuid)
 returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare iid uuid; w public.singles_message_credit_wallets%rowtype;
begin
 if p_requester is null or p_responder is null or p_requester=p_responder
 then raise exception 'invalid_request' using errcode='22023'; end if;
 select id into iid from public.singles_interests where from_user_id=p_requester and to_user_id=p_responder;
 if found then raise exception 'request_exists' using errcode='23505'; end if;
 select * into w from public.singles_message_credit_wallets where user_id=p_requester and scope='request' for update;
 if not found or w.available<1 then raise exception 'insufficient_request_credit' using errcode='P0001'; end if;
 insert into public.singles_interests(from_user_id,to_user_id,status) values(p_requester,p_responder,'pending') returning id into iid;
 update public.singles_message_credit_wallets set available=available-1,reserved=reserved+1,updated_at=now()
  where user_id=p_requester and scope='request';
 insert into public.singles_request_billing(interest_id,requester_id,responder_id) values(iid,p_requester,p_responder);
 insert into public.singles_request_ledger(user_id,delta_units,reason,ref) values(p_requester,-1,'request_reserved',iid::text);
 return iid;
end $$;

-- 응답: 수락이면 응답자 1단위 차감 + 요청자 잡아둔 1단위 확정, 거절이면 요청자에게 반환.
-- 응답자 크레딧이 없으면 수락이 처리되지 않는다(상대에게 전달되지 않음).
create or replace function public.singles_request_decide(p_responder uuid,p_interest uuid,p_decision text)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.singles_request_billing%rowtype; w public.singles_message_credit_wallets%rowtype;
begin
 if p_decision not in ('accepted','declined') then raise exception 'invalid_decision' using errcode='22023'; end if;
 select * into b from public.singles_request_billing where interest_id=p_interest for update;
 if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
 if b.responder_id<>p_responder then raise exception 'responder_only' using errcode='42501'; end if;
 if b.status<>'pending' then raise exception 'request_not_pending' using errcode='23514'; end if;
 if p_decision='accepted' then
  select * into w from public.singles_message_credit_wallets where user_id=p_responder and scope='request' for update;
  if not found or w.available<1 then raise exception 'responder_insufficient_credit' using errcode='P0001'; end if;
  update public.singles_message_credit_wallets set available=available-1,updated_at=now() where user_id=p_responder and scope='request';
  update public.singles_message_credit_wallets set reserved=reserved-1,updated_at=now()
   where user_id=b.requester_id and scope='request' and reserved>=1;
  if not found then raise exception 'reserved_balance_mismatch'; end if;
  update public.singles_request_billing set status='accepted',requester_units=1,responder_units=1,decided_at=now() where interest_id=p_interest;
  insert into public.singles_request_ledger(user_id,delta_units,reason,ref) values
   (p_responder,-1,'response_charged',p_interest::text);
  insert into public.singles_request_ledger(user_id,delta_units,reason,ref) values
   (b.requester_id,1,'request_released',p_interest::text),(b.requester_id,-1,'request_charged',p_interest::text);
 else
  update public.singles_message_credit_wallets set reserved=reserved-1,available=available+1,updated_at=now()
   where user_id=b.requester_id and scope='request' and reserved>=1;
  if not found then raise exception 'reserved_balance_mismatch'; end if;
  update public.singles_request_billing set status='declined',decided_at=now() where interest_id=p_interest;
  insert into public.singles_request_ledger(user_id,delta_units,reason,ref) values(b.requester_id,1,'request_released',p_interest::text);
 end if;
 update public.singles_interests set status=p_decision,updated_at=now()
  where id=p_interest and to_user_id=p_responder and status='pending';
 if not found then raise exception 'request_state_changed' using errcode='23514'; end if;
 return p_decision;
end $$;

-- 대기 요청 반환(만료·탈퇴): 요청자 잡아둔 크레딧을 돌려준다.
create or replace function public.singles_request_release_for_user(p_user uuid,p_reason text)
 returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare b record; n int:=0;
begin
 if p_reason not in ('expired','withdrawn') then raise exception 'invalid_release' using errcode='22023'; end if;
 for b in select * from public.singles_request_billing
   where status='pending' and (p_user is null and created_at<now()-interval '14 days' or requester_id=p_user or responder_id=p_user)
   for update loop
  update public.singles_message_credit_wallets set reserved=reserved-1,available=available+1,updated_at=now()
   where user_id=b.requester_id and scope='request' and reserved>=1;
  update public.singles_request_billing set status=p_reason,decided_at=now() where interest_id=b.interest_id;
  insert into public.singles_request_ledger(user_id,delta_units,reason,ref) values(b.requester_id,1,'request_released',b.interest_id::text);
  n:=n+1;
 end loop;
 return n;
end $$;

-- 결제 확인: 적립금 플랜이면 지갑 충전, 기간 플랜이면 이용권 부여(본인 주문 승인 금지 유지).
create or replace function public.singles_bank_confirm_order(p_reference text,p_operator uuid,p_action text,p_trace text default null,p_reason text default null)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.singles_bank_orders%rowtype; units int;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_action not in ('verified','rejected') then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into r from public.singles_bank_orders where reference=p_reference for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if r.user_id=p_operator then raise exception 'operator_self_confirmation_forbidden' using errcode='42501'; end if;
 if r.status<>'reported_paid' then raise exception 'order_not_awaiting_verification' using errcode='23514'; end if;
 if p_action='verified' then
  if not exists(select 1 from public.singles_memberships
    where user_id=r.user_id and status='active' and adult_verified_at is not null)
  then raise exception 'member_no_longer_eligible' using errcode='23514'; end if;
  if p_trace is null or char_length(trim(p_trace))<4 or char_length(p_trace)>100
  then raise exception 'bank_trace_required' using errcode='22023'; end if;
  update public.singles_bank_orders set status='verified',verified_at=now(),verified_by=p_operator,
    bank_trace=trim(p_trace),rejection_reason=null where reference=p_reference;
  select credit_units into units from public.singles_bank_plans where code=r.plan_code;
  if units is not null then
   -- 적립금 충전: 기간 이용권이 아니라 요청 크레딧(1단위=1만원)을 지갑에 넣는다.
   insert into public.singles_message_credit_wallets(user_id,scope,available,reserved)
     values(r.user_id,'request',units,0)
     on conflict(user_id,scope) do update set available=public.singles_message_credit_wallets.available+excluded.available,updated_at=now();
   insert into public.singles_request_ledger(user_id,delta_units,reason,ref)
     values(r.user_id,units,'topup',r.reference);
  else
  insert into public.singles_bank_grants(user_id,plan_code,expires_at,last_order_reference)
    values(r.user_id,r.plan_code,now()+make_interval(days=>r.duration_days),r.reference)
    on conflict(user_id,plan_code) do update set
      expires_at=greatest(public.singles_bank_grants.expires_at,now())+make_interval(days=>r.duration_days),
      last_order_reference=excluded.last_order_reference,updated_at=now();
  end if;
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

-- 탈퇴: 대기 요청의 잡아둔 크레딧 반환 추가.
create or replace function public.singles_withdraw_member(p_user uuid,p_version text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare closed_interests int; cancelled_rsvps int;
begin
 if p_user is null or p_version is null or char_length(p_version)>80
 then raise exception 'invalid_withdrawal' using errcode='22023'; end if;
 update public.singles_memberships set status='withdrawn',discoverable=false,marriage_opt_in=false,
   religion_consent=false,base_consent=false,withdrawn_at=now(),updated_at=now()
  where user_id=p_user;
 if not found then raise exception 'member_not_found' using errcode='P0002'; end if;
 update public.singles_interests set status='withdrawn',updated_at=now()
  where (from_user_id=p_user or to_user_id=p_user) and status in ('pending','accepted');
 get diagnostics closed_interests=row_count;
 update public.singles_event_rsvps set status='cancelled'
  where user_id=p_user and status in ('requested','approved');
 get diagnostics cancelled_rsvps=row_count;
 -- 대기 중인 요청의 잡아둔 크레딧은 요청자에게 돌려준다(탈퇴로 수락될 수 없음).
 perform public.singles_request_release_for_user(p_user,'withdrawn');
 insert into public.singles_consent_receipts(user_id,action,consent_version,religion_consent,marriage_opt_in)
   values(p_user,'withdrawn',p_version,false,false);
 return jsonb_build_object('closed_interests',closed_interests,'cancelled_rsvps',cancelled_rsvps);
end $$;

revoke all on function public.singles_request_create(uuid,uuid),public.singles_request_decide(uuid,uuid,text),
 public.singles_request_release_for_user(uuid,text),public.singles_bank_confirm_order(text,uuid,text,text,text),
 public.singles_withdraw_member(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_request_create(uuid,uuid),public.singles_request_decide(uuid,uuid,text),
 public.singles_request_release_for_user(uuid,text),public.singles_bank_confirm_order(text,uuid,text,text,text),
 public.singles_withdraw_member(uuid,text) to service_role;
