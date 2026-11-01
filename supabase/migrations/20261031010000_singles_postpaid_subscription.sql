-- EKODI 동행 요금 구조 개편(2026-10-31 소유자 결정).
-- 1) 가입비·선불 적립금 폐지. 유료회원 = 기간제 구독권 보유(1일 15,000·10일 75,000·20일 120,000·1달 150,000원, 기존 단가의 1.5배).
-- 2) 모든 요청 건별 청구(후불): 상대가 수락하면 양쪽에 청구서 발행 → 각자 계좌이체·운영자 확인 →
--    둘 다 결제되면 연결(메시지 교환) 또는 연락처 공개. 7일 안에 결제가 끝나지 않으면 연결 취소.
--    요금 = 기본 요금 + 입력·공개 할인: 메시지 교환 15,000원(할인 없음), 연락처 교환 150,000원(최대 50% 할인).
-- 3) 자동 운영·개선: 매일 만료·미결제 정리와 운영 지표 점검 → 개선안은 '제안'으로만 쌓이고
--    소유자(설정 권한 운영자)가 승인해야 적용된다.

-- ── 상품: 구독권·청구서 결제 ──
alter table public.singles_bank_plans drop constraint if exists singles_bank_plans_code_check;
alter table public.singles_bank_plans add constraint singles_bank_plans_code_check check (code in
 ('community','community_90','community_365','consulting','credit_initial','credit_topup',
  'sub_1d','sub_10d','sub_20d','sub_30d','subscription','request_fee'));
insert into public.singles_bank_plans(code,display_name,amount_krw,duration_days,active) values
 ('sub_1d','동행 구독권 1일',15000,1,true),
 ('sub_10d','동행 구독권 10일',75000,10,true),
 ('sub_20d','동행 구독권 20일',120000,20,true),
 ('sub_30d','동행 구독권 1달(30일)',150000,30,true),
 ('subscription','동행 구독(이용 기간 기록용)',null,1,false),
 ('request_fee','동행 요청·수락 청구서',null,1,false)
 on conflict(code) do update set display_name=excluded.display_name,amount_krw=excluded.amount_krw,duration_days=excluded.duration_days,active=excluded.active;
-- 가입비·적립금 충전 판매 종료, 이전 기간권(적립금 결제) 중지.
update public.singles_bank_plans set active=false where code in ('credit_initial','credit_topup');
update public.singles_pass_plans set active=false;

-- ── 요금 규칙(1.5배) ──
alter table public.singles_price_rules drop constraint if exists singles_price_rules_standard_krw_check;
alter table public.singles_price_rules drop constraint if exists singles_price_rules_floor_krw_check;
alter table public.singles_price_rules add constraint singles_price_rules_standard_krw_check check (standard_krw between 10000 and 150000);
alter table public.singles_price_rules add constraint singles_price_rules_floor_krw_check check (floor_krw between 10000 and 150000);
update public.singles_price_rules set standard_krw=15000,floor_krw=15000,max_discount_pct=0,updated_at=now() where kind='message';
-- 최저 금액은 실제 최대 할인(50%) 적용 금액과 같게 둔다(2026-10-30 정합성 원칙).
update public.singles_price_rules set standard_krw=150000,floor_krw=75000,max_discount_pct=50,updated_at=now() where kind='contact';

-- ── 요청: 후불 방식 ──
alter table public.singles_paid_requests add column if not exists billing_mode text not null default 'prepaid'
 check (billing_mode in ('prepaid','postpaid'));
alter table public.singles_paid_requests drop constraint if exists singles_paid_requests_status_check;
alter table public.singles_paid_requests add constraint singles_paid_requests_status_check check (status in
 ('pending','accepted','declined','expired','withdrawn','awaiting_payment','connected','lapsed'));
alter table public.singles_paid_requests drop constraint if exists singles_paid_requests_requester_fee_krw_check;
alter table public.singles_paid_requests drop constraint if exists singles_paid_requests_responder_fee_krw_check;
alter table public.singles_paid_requests add constraint singles_paid_requests_requester_fee_krw_check check (requester_fee_krw between 0 and 150000);
alter table public.singles_paid_requests add constraint singles_paid_requests_responder_fee_krw_check check (responder_fee_krw between 0 and 150000);
drop index if exists public.singles_paid_requests_one_pending;
create unique index if not exists singles_paid_requests_one_open
 on public.singles_paid_requests(requester_id,responder_id,kind) where status in ('pending','awaiting_payment');

create table if not exists public.singles_request_invoices(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.singles_paid_requests(id) on delete cascade,
 user_id uuid not null,
 role text not null check (role in ('requester','responder')),
 amount_krw integer not null check (amount_krw between 100 and 150000),
 status text not null default 'unpaid' check (status in ('unpaid','paid','void','refund_due')),
 order_reference text,
 due_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 unique(request_id,role)
);
create index if not exists singles_request_invoices_user on public.singles_request_invoices(user_id,status);
create unique index if not exists singles_request_invoices_order on public.singles_request_invoices(order_reference) where order_reference is not null;
alter table public.singles_request_invoices enable row level security;
revoke all on table public.singles_request_invoices from public,anon,authenticated;
grant select,insert,update on table public.singles_request_invoices to service_role;

alter table public.singles_signup_attempts drop constraint if exists singles_signup_attempts_action_check;
alter table public.singles_signup_attempts add constraint singles_signup_attempts_action_check
 check (action in ('enroll','enroll_failed','join_order','withdraw','subscribe_order'));

-- ── 자동 운영 제안(소유자 승인 후 적용) ──
create table if not exists public.singles_ops_proposals(
 id uuid primary key default gen_random_uuid(),
 rule text not null check (char_length(rule) between 3 and 60),
 kind text not null check (kind in ('price','ops')),
 title text not null check (char_length(title) between 3 and 160),
 rationale text not null check (char_length(rationale)<=1000),
 metrics jsonb not null default '{}'::jsonb,
 proposed_change jsonb not null default '{}'::jsonb,
 status text not null default 'proposed' check (status in ('proposed','approved','rejected','applied')),
 decided_by uuid,
 decided_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists singles_ops_proposals_one_open on public.singles_ops_proposals(rule) where status='proposed';
alter table public.singles_ops_proposals enable row level security;
revoke all on table public.singles_ops_proposals from public,anon,authenticated;
grant select,insert,update on table public.singles_ops_proposals to service_role;

-- ── 유료회원 = 구독 중 ──
create or replace function public.singles_is_paid_member(p_user uuid)
 returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.singles_bank_grants g join public.singles_memberships m on m.user_id=g.user_id
  where g.user_id=p_user and g.plan_code='subscription' and g.expires_at>now() and m.status='active')
$$;

-- 요금 = 기본 요금 × (1 − 최대할인율 × (입력률+공개율)/2), 1,000원 단위 내림, 최저 금액 보장.
create or replace function public.singles_price_quote(p_user uuid,p_kind text)
 returns integer language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.singles_price_rules%rowtype; s record; price numeric;
begin
 select * into r from public.singles_price_rules where kind=p_kind;
 if not found then raise exception 'invalid_kind' using errcode='22023'; end if;
 select * into s from public.singles_profile_score(p_user);
 price:=r.standard_krw*(1-(r.max_discount_pct/100.0)*((s.filled+s.shown)::numeric/(2*s.total)));
 return greatest(r.floor_krw,(floor(price/1000)*1000)::integer);
end $$;

create or replace function public.singles_postpaid_request_create(p_requester uuid,p_responder uuid,p_kind text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare fee integer; rid uuid;
begin
 if p_requester is null or p_responder is null or p_requester=p_responder then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_kind not in ('message','contact') then raise exception 'invalid_kind' using errcode='22023'; end if;
 if not public.singles_is_paid_member(p_requester) then raise exception 'paid_membership_required' using errcode='42501'; end if;
 if not public.singles_is_paid_member(p_responder) then raise exception 'responder_unavailable' using errcode='P0002'; end if;
 if p_kind='contact' and exists(select 1 from public.singles_contact_unlocks
   where user_low=least(p_requester,p_responder) and user_high=greatest(p_requester,p_responder))
 then raise exception 'contact_already_shared' using errcode='23505'; end if;
 if p_kind='message' and exists(select 1 from public.singles_interests where status='accepted'
   and ((from_user_id=p_requester and to_user_id=p_responder) or (from_user_id=p_responder and to_user_id=p_requester)))
 then raise exception 'already_connected' using errcode='23505'; end if;
 if exists(select 1 from public.singles_paid_requests where requester_id=p_requester and responder_id=p_responder
   and kind=p_kind and status in ('pending','awaiting_payment'))
 then raise exception 'request_exists' using errcode='23505'; end if;
 fee:=public.singles_price_quote(p_requester,p_kind);
 insert into public.singles_paid_requests(requester_id,responder_id,kind,requester_fee_krw,billing_mode)
  values(p_requester,p_responder,p_kind,fee,'postpaid') returning id into rid;
 return jsonb_build_object('request_id',rid,'fee_krw',fee,'kind',p_kind);
end $$;

-- 수락: 양쪽 청구서 발행(결제 대기). 거절: 요금 없음.
create or replace function public.singles_postpaid_request_decide(p_responder uuid,p_request uuid,p_decision text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.singles_paid_requests%rowtype; fee integer; inv uuid;
begin
 if p_decision not in ('accepted','declined') then raise exception 'invalid_decision' using errcode='22023'; end if;
 select * into q from public.singles_paid_requests where id=p_request for update;
 if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
 if q.responder_id<>p_responder then raise exception 'responder_only' using errcode='42501'; end if;
 if q.status<>'pending' then raise exception 'request_not_pending' using errcode='23514'; end if;
 if p_decision='declined' then
  update public.singles_paid_requests set status='declined',decided_at=now() where id=q.id;
  return jsonb_build_object('status','declined','fee_krw',0,'kind',q.kind);
 end if;
 if not public.singles_is_paid_member(p_responder) then raise exception 'paid_membership_required' using errcode='42501'; end if;
 fee:=public.singles_price_quote(p_responder,q.kind);
 update public.singles_paid_requests set status='awaiting_payment',responder_fee_krw=fee,decided_at=now() where id=q.id;
 insert into public.singles_request_invoices(request_id,user_id,role,amount_krw) values(q.id,q.requester_id,'requester',q.requester_fee_krw);
 insert into public.singles_request_invoices(request_id,user_id,role,amount_krw) values(q.id,p_responder,'responder',fee) returning id into inv;
 return jsonb_build_object('status','awaiting_payment','fee_krw',fee,'invoice_id',inv,'kind',q.kind);
end $$;

-- 청구서 결제용 계좌이체 주문 발급(같은 청구서에 진행 중인 주문이 있으면 그것을 돌려준다).
create or replace function public.singles_invoice_open_order(p_user uuid,p_invoice uuid)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.singles_request_invoices%rowtype; s public.singles_bank_settings%rowtype; ref text; st text;
begin
 select * into i from public.singles_request_invoices where id=p_invoice for update;
 if not found or i.user_id<>p_user then raise exception 'invoice_not_found' using errcode='P0002'; end if;
 if i.status<>'unpaid' then raise exception 'invoice_not_payable' using errcode='23514'; end if;
 if i.order_reference is not null then
  select status into st from public.singles_bank_orders where reference=i.order_reference;
  if st in ('awaiting_transfer','reported_paid') then return i.order_reference; end if;
 end if;
 select * into s from public.singles_bank_settings where id=1;
 if not found or not s.active or s.bank_name is null or s.account_number is null or s.account_holder is null
 then raise exception 'bank_payment_not_configured' using errcode='P0001'; end if;
 ref:='EDH-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.singles_bank_orders(reference,user_id,plan_code,amount_krw,duration_days,bank_name,account_number,account_holder,status)
  values(ref,p_user,'request_fee',i.amount_krw,1,s.bank_name,s.account_number,s.account_holder,'awaiting_transfer');
 insert into public.singles_bank_audit(reference,actor_id,action) values(ref,p_user,'opened');
 update public.singles_request_invoices set order_reference=ref where id=i.id;
 return ref;
end $$;

-- 양쪽 청구서가 모두 결제되면 연결/연락처 공개.
create or replace function public.singles_postpaid_try_connect(p_request uuid)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.singles_paid_requests%rowtype; iid uuid;
begin
 select * into q from public.singles_paid_requests where id=p_request for update;
 if not found or q.status<>'awaiting_payment' then return coalesce(q.status,'missing'); end if;
 if exists(select 1 from public.singles_request_invoices where request_id=q.id and status<>'paid') then return 'awaiting_payment'; end if;
 select id into iid from public.singles_interests
  where (from_user_id=q.requester_id and to_user_id=q.responder_id) or (from_user_id=q.responder_id and to_user_id=q.requester_id)
  order by (status='accepted') desc limit 1 for update;
 if iid is null then
  insert into public.singles_interests(from_user_id,to_user_id,status) values(q.requester_id,q.responder_id,'accepted') returning id into iid;
 else
  update public.singles_interests set status='accepted',updated_at=now() where id=iid and status<>'accepted';
 end if;
 if q.kind='contact' then
  insert into public.singles_contact_unlocks(user_low,user_high,request_id)
   values(least(q.requester_id,q.responder_id),greatest(q.requester_id,q.responder_id),q.id) on conflict do nothing;
 end if;
 update public.singles_paid_requests set status='connected',interest_id=iid where id=q.id;
 return 'connected';
end $$;

-- 입금 확인: 구독권이면 구독 기간 연장, 청구서면 결제 처리 후 연결 시도(본인 주문 승인 금지 유지).
create or replace function public.singles_bank_confirm_order(p_reference text,p_operator uuid,p_action text,p_trace text default null,p_reason text default null)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.singles_bank_orders%rowtype; credit int; inv public.singles_request_invoices%rowtype;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_action not in ('verified','rejected') then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into r from public.singles_bank_orders where reference=p_reference for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if r.user_id=p_operator then raise exception 'operator_self_confirmation_forbidden' using errcode='42501'; end if;
 if r.status<>'reported_paid' then raise exception 'order_not_awaiting_verification' using errcode='23514'; end if;
 if p_action='verified' then
  if r.plan_code<>'request_fee' and not exists(select 1 from public.singles_memberships
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
     -- 기한이 지나 연결이 취소된 뒤 들어온 입금은 환불 대상으로 표시한다.
     update public.singles_request_invoices set status='refund_due',paid_at=now() where id=inv.id;
    end if;
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

-- 정리: 14일 무응답 요청 만료, 7일 미결제 연결 취소(미결제 청구서 무효, 결제된 쪽은 환불 대상).
create or replace function public.singles_postpaid_housekeeping(p_user uuid default null,p_reason text default 'expired')
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q record; expired int:=0; lapsed int:=0;
begin
 for q in select id from public.singles_paid_requests where billing_mode='postpaid' and status='pending'
   and ((p_user is null and created_at<now()-interval '14 days') or requester_id=p_user or responder_id=p_user) for update loop
  update public.singles_paid_requests set status=case when p_user is null then 'expired' else 'withdrawn' end,decided_at=now() where id=q.id;
  expired:=expired+1;
 end loop;
 for q in select distinct r.id from public.singles_paid_requests r join public.singles_request_invoices i on i.request_id=r.id
   where r.billing_mode='postpaid' and r.status='awaiting_payment'
   and ((p_user is null and i.status='unpaid' and i.due_at<now()) or r.requester_id=p_user or r.responder_id=p_user) loop
  update public.singles_request_invoices set status=case when status='paid' then 'refund_due' else 'void' end
   where request_id=q.id and status in ('unpaid','paid');
  update public.singles_paid_requests set status='lapsed' where id=q.id;
  lapsed:=lapsed+1;
 end loop;
 return jsonb_build_object('expired',expired,'lapsed',lapsed);
end $$;

-- 탈퇴: 후불 요청도 정리.
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
 perform public.singles_request_release_for_user(p_user,'withdrawn');
 perform public.singles_paid_request_release(p_user,'withdrawn');
 perform public.singles_postpaid_housekeeping(p_user,'withdrawn');
 insert into public.singles_consent_receipts(user_id,action,consent_version,religion_consent,marriage_opt_in)
   values(p_user,'withdrawn',p_version,false,false);
 return jsonb_build_object('closed_interests',closed_interests,'cancelled_rsvps',cancelled_rsvps);
end $$;

-- 이전(선불) 반환 함수는 선불 요청만 다룬다.
create or replace function public.singles_paid_request_release(p_user uuid,p_reason text)
 returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare q record; n int:=0;
begin
 if p_reason not in ('expired','withdrawn') then raise exception 'invalid_release' using errcode='22023'; end if;
 for q in select * from public.singles_paid_requests where status='pending' and billing_mode='prepaid'
   and ((p_user is null and created_at<now()-interval '14 days') or requester_id=p_user or responder_id=p_user) for update loop
  if q.requester_fee_krw>0 then
   update public.singles_credit_accounts set reserved_krw=reserved_krw-q.requester_fee_krw,balance_krw=balance_krw+q.requester_fee_krw,updated_at=now()
    where user_id=q.requester_id and reserved_krw>=q.requester_fee_krw;
   insert into public.singles_credit_ledger(user_id,delta_krw,reserved_delta_krw,reason,ref) values(q.requester_id,q.requester_fee_krw,-q.requester_fee_krw,'request_released',q.id::text);
  end if;
  update public.singles_paid_requests set status=p_reason,decided_at=now() where id=q.id;
  n:=n+1;
 end loop;
 return n;
end $$;

-- ── 자동 점검: 지표를 보고 개선안을 '제안'으로만 남긴다(적용은 소유자 승인 후) ──
create or replace function public.singles_ops_review()
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare decided int; accepted int; connected int; lapsed int; created int; open_reports int; slow numeric; contact_disc int; m jsonb;
begin
 select count(*) filter (where created_at>now()-interval '30 days'),
        count(*) filter (where decided_at>now()-interval '30 days' and status in ('awaiting_payment','connected','lapsed','declined')),
        count(*) filter (where decided_at>now()-interval '30 days' and status in ('awaiting_payment','connected','lapsed')),
        count(*) filter (where decided_at>now()-interval '30 days' and status='connected'),
        count(*) filter (where decided_at>now()-interval '30 days' and status='lapsed')
   into created,decided,accepted,connected,lapsed
  from public.singles_paid_requests where billing_mode='postpaid';
 select count(*) into open_reports from public.singles_reports where status='open' and created_at<now()-interval '3 days';
 select avg(extract(epoch from (verified_at-reported_paid_at))/3600) into slow from public.singles_bank_orders
  where status='verified' and verified_at>now()-interval '30 days';
 select max_discount_pct into contact_disc from public.singles_price_rules where kind='contact';
 m:=jsonb_build_object('requests_30d',created,'decided_30d',decided,'accepted_30d',accepted,'connected_30d',connected,
   'lapsed_30d',lapsed,'open_reports_over_3d',open_reports,'avg_confirm_hours',round(coalesce(slow,0),1),'contact_max_discount_pct',contact_disc);
 if decided>=10 and accepted::numeric/decided<0.2 and contact_disc<70 then
  insert into public.singles_ops_proposals(rule,kind,title,rationale,metrics,proposed_change)
   values('low_acceptance','price','연락처 교환 최대 할인 '||contact_disc||'% → '||(contact_disc+10)||'%',
    '최근 30일 수락률이 '||round(100.0*accepted/decided)||'%로 낮습니다. 입력·공개 할인을 넓혀 수락 부담을 줄이는 안입니다.',
    m,jsonb_build_object('price_kind','contact','max_discount_pct',contact_disc+10))
   on conflict do nothing;
 end if;
 if connected+lapsed>=10 and lapsed::numeric/(connected+lapsed)>0.5 then
  insert into public.singles_ops_proposals(rule,kind,title,rationale,metrics)
   values('unpaid_lapse','ops','수락 후 미결제 취소가 많음 — 결제 안내 강화·카드 자동결제 도입 검토',
    '최근 30일 수락 건 중 '||round(100.0*lapsed/(connected+lapsed))||'%가 7일 안에 결제되지 않아 취소됐습니다.',m)
   on conflict do nothing;
 end if;
 if coalesce(slow,0)>24 then
  insert into public.singles_ops_proposals(rule,kind,title,rationale,metrics)
   values('slow_confirmation','ops','입금 확인 평균 '||round(slow)||'시간 — 확인 담당 추가 또는 은행 내역 자동 대사 검토',
    '회원이 입금 신고 후 확인까지 하루 넘게 기다리고 있습니다.',m)
   on conflict do nothing;
 end if;
 if open_reports>0 then
  insert into public.singles_ops_proposals(rule,kind,title,rationale,metrics)
   values('stale_reports','ops','3일 넘은 미처리 신고 '||open_reports||'건 — 신고 처리 점검',
    '안전과 신뢰를 위해 신고는 3일 안에 처리하는 것이 좋습니다.',m)
   on conflict do nothing;
 end if;
 return m;
end $$;

-- 소유자 결정: 승인하면 가격 제안은 즉시 적용, 운영 제안은 승인 기록만 남긴다.
create or replace function public.singles_ops_decide(p_operator uuid,p_id uuid,p_decision text)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare pr public.singles_ops_proposals%rowtype; v_kind text; v_disc int;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_configure=true)
 then raise exception 'owner_decision_required' using errcode='42501'; end if;
 if p_decision not in ('approved','rejected') then raise exception 'invalid_decision' using errcode='22023'; end if;
 select * into pr from public.singles_ops_proposals where id=p_id for update;
 if not found then raise exception 'proposal_not_found' using errcode='P0002'; end if;
 if pr.status<>'proposed' then raise exception 'proposal_already_decided' using errcode='23514'; end if;
 if p_decision='rejected' then
  update public.singles_ops_proposals set status='rejected',decided_by=p_operator,decided_at=now() where id=p_id;
  return 'rejected';
 end if;
 if pr.kind='price' then
  v_kind:=pr.proposed_change->>'price_kind';v_disc:=(pr.proposed_change->>'max_discount_pct')::int;
  if v_kind not in ('message','contact') or v_disc is null or v_disc<0 or v_disc>90 then raise exception 'invalid_proposal' using errcode='22023'; end if;
  update public.singles_price_rules set max_discount_pct=v_disc,updated_at=now() where kind=v_kind;
  update public.singles_ops_proposals set status='applied',decided_by=p_operator,decided_at=now() where id=p_id;
  return 'applied';
 end if;
 update public.singles_ops_proposals set status='approved',decided_by=p_operator,decided_at=now() where id=p_id;
 return 'approved';
end $$;

-- 매일 자동 실행(새벽 4시 KST = 19:00 UTC): 정리 후 점검.
create or replace function public.singles_daily_ops()
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare h jsonb; m jsonb;
begin
 h:=public.singles_postpaid_housekeeping(null,'expired');
 perform public.singles_paid_request_release(null,'expired');
 m:=public.singles_ops_review();
 return jsonb_build_object('housekeeping',h,'metrics',m);
end $$;

revoke all on function public.singles_is_paid_member(uuid) from public,anon,authenticated;
grant execute on function public.singles_is_paid_member(uuid) to service_role;
revoke all on function public.singles_price_quote(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_price_quote(uuid,text) to service_role;
revoke all on function public.singles_postpaid_request_create(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_postpaid_request_create(uuid,uuid,text) to service_role;
revoke all on function public.singles_postpaid_request_decide(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_postpaid_request_decide(uuid,uuid,text) to service_role;
revoke all on function public.singles_invoice_open_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.singles_invoice_open_order(uuid,uuid) to service_role;
revoke all on function public.singles_postpaid_try_connect(uuid) from public,anon,authenticated;
grant execute on function public.singles_postpaid_try_connect(uuid) to service_role;
revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.singles_bank_confirm_order(text,uuid,text,text,text) to service_role;
revoke all on function public.singles_postpaid_housekeeping(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_postpaid_housekeeping(uuid,text) to service_role;
revoke all on function public.singles_withdraw_member(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_withdraw_member(uuid,text) to service_role;
revoke all on function public.singles_paid_request_release(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_paid_request_release(uuid,text) to service_role;
revoke all on function public.singles_ops_review() from public,anon,authenticated;
grant execute on function public.singles_ops_review() to service_role;
revoke all on function public.singles_ops_decide(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_ops_decide(uuid,uuid,text) to service_role;
revoke all on function public.singles_daily_ops() from public,anon,authenticated;
grant execute on function public.singles_daily_ops() to service_role;

-- pg_cron이 있는 환경(운영)에서만 매일 실행 등록.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname='singles-daily-ops';
  perform cron.schedule('singles-daily-ops','0 19 * * *','select public.singles_daily_ops()');
 end if;
end $$;
