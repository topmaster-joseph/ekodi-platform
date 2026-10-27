-- EKODI 동행 유료회원 모델(2026-10-28 소유자 결정).
-- 1) 무료회원: 서비스 개념 안내만. 프로필 입력·공개, 요청·수락 불가.
-- 2) 유료회원: 가입비 500,000원 계좌이체 → 운영자 확인 시 같은 금액이 적립금(원 단위)으로 생성.
-- 3) 요청 요금 = 종류별 기본 요금 − 입력·공개 할인(최저 금액 보장, 1만~10만원 범위).
--    메시지 교환 요청 기본 10,000원, 연락처 교환 요청 기본 100,000원.
--    요청자: 요청 시 자기 요금이 보류되고, 상대 수락 시 확정. 수락자: 수락 시 자기 요금이 확정 차감.
--    거절·만료·탈퇴 시 요청자 보류액 반환.
-- 4) 기간제 이용권(1·10·20·30일): 적립금에서 구매, 기간 중 메시지 교환 요청·수락 요금 면제(연락처 교환은 별도).
-- 5) 메시지 속 연락처는 연락처 교환이 수락된 사이에서만 보이고, 그 전에는 서버가 가린다(코드에서 처리).
-- 6) 가입 시도(시간·Google 계정)를 기록한다.
-- 7) 시범 운영 명단: 공개 개통 전에는 명단에 있는 계정과 운영자만 회원 기능을 쓴다(코드에서 처리).
-- 판매 개시는 별도: 기능 스위치 OFF, 계좌 설정 active=false 유지.

-- 가입비·추가 충전은 원 단위 적립금으로 들어간다.
alter table public.singles_bank_plans add column if not exists credit_krw integer
 check (credit_krw is null or credit_krw between 10000 and 10000000);
update public.singles_bank_plans set display_name='동행 유료회원 가입비 (적립금 500,000원 생성)',amount_krw=500000,credit_krw=500000,credit_units=null where code='credit_initial';
update public.singles_bank_plans set display_name='동행 적립금 추가 충전 (100,000원)',amount_krw=100000,credit_krw=100000,credit_units=null where code='credit_topup';
-- 이전 월 이용권 상품은 유료회원 모델로 대체되어 판매하지 않는다.
update public.singles_bank_plans set active=false where code in ('community','community_90','community_365');

alter table public.singles_memberships add column if not exists paid_member_since timestamptz;

create table if not exists public.singles_credit_accounts(
 user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
 balance_krw integer not null default 0 check (balance_krw>=0),
 reserved_krw integer not null default 0 check (reserved_krw>=0),
 joined_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.singles_credit_ledger(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 delta_krw integer not null default 0,
 reserved_delta_krw integer not null default 0,
 reason text not null check (reason in ('join_fee','topup','request_reserved','request_released','request_charged','accept_charged','pass_purchase','refund','adjustment')),
 ref text not null,
 created_at timestamptz not null default now(),
 check (delta_krw<>0 or reserved_delta_krw<>0)
);
create index if not exists singles_credit_ledger_user on public.singles_credit_ledger(user_id,created_at desc);

create table if not exists public.singles_price_rules(
 kind text primary key check (kind in ('message','contact')),
 display_name text not null,
 standard_krw integer not null check (standard_krw between 10000 and 100000),
 floor_krw integer not null check (floor_krw between 10000 and 100000),
 max_discount_pct integer not null check (max_discount_pct between 0 and 90),
 updated_at timestamptz not null default now(),
 check (floor_krw<=standard_krw)
);
insert into public.singles_price_rules(kind,display_name,standard_krw,floor_krw,max_discount_pct) values
 ('message','메시지 교환 요청·수락',10000,10000,0),
 ('contact','연락처 교환 요청·수락',100000,10000,50)
 on conflict(kind) do nothing;

create table if not exists public.singles_pass_plans(
 code text primary key check (code in ('pass_1d','pass_10d','pass_20d','pass_30d')),
 display_name text not null,
 days integer not null check (days between 1 and 31),
 price_krw integer not null check (price_krw between 10000 and 100000),
 active boolean not null default true,
 updated_at timestamptz not null default now()
);
-- 기간권 금액: 2026-10-28 소유자 확정(1일 1만·10일 5만·20일 8만·30일 10만원).
insert into public.singles_pass_plans(code,display_name,days,price_krw) values
 ('pass_1d','1일 메시지 이용권',1,10000),('pass_10d','10일 메시지 이용권',10,50000),
 ('pass_20d','20일 메시지 이용권',20,80000),('pass_30d','1달(30일) 메시지 이용권',30,100000)
 on conflict(code) do nothing;
create table if not exists public.singles_pass_grants(
 user_id uuid primary key references public.singles_memberships(user_id) on delete cascade,
 expires_at timestamptz not null,
 last_code text not null,
 updated_at timestamptz not null default now()
);

create table if not exists public.singles_paid_requests(
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null,
 responder_id uuid not null,
 kind text not null check (kind in ('message','contact')),
 status text not null default 'pending' check (status in ('pending','accepted','declined','expired','withdrawn')),
 requester_fee_krw integer not null check (requester_fee_krw between 0 and 100000),
 responder_fee_krw integer check (responder_fee_krw between 0 and 100000),
 interest_id uuid,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 check (requester_id<>responder_id),
 check (status<>'accepted' or (responder_fee_krw is not null and decided_at is not null))
);
create unique index if not exists singles_paid_requests_one_pending
 on public.singles_paid_requests(requester_id,responder_id,kind) where status='pending';
create index if not exists singles_paid_requests_responder on public.singles_paid_requests(responder_id,status);
create index if not exists singles_paid_requests_pending_age on public.singles_paid_requests(created_at) where status='pending';

create table if not exists public.singles_contact_unlocks(
 user_low uuid not null,
 user_high uuid not null,
 request_id uuid not null,
 unlocked_at timestamptz not null default now(),
 primary key(user_low,user_high),
 check (user_low<user_high)
);

create table if not exists public.singles_signup_attempts(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 email text check (email is null or char_length(email)<=320),
 action text not null check (action in ('enroll','enroll_failed','join_order','withdraw')),
 detail text check (detail is null or char_length(detail)<=120),
 created_at timestamptz not null default now()
);
create index if not exists singles_signup_attempts_user on public.singles_signup_attempts(user_id,created_at desc);

create table if not exists public.singles_pilot_users(
 user_id uuid primary key,
 email text not null,
 note text not null default '',
 added_at timestamptz not null default now()
);

create table if not exists public.singles_adult_verifications(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 operator_id uuid not null,
 method text not null check (method in ('id_document_in_person','id_document_video','certified_provider')),
 note text not null default '' check (char_length(note)<=200),
 created_at timestamptz not null default now(),
 check (user_id<>operator_id)
);

alter table public.singles_credit_accounts enable row level security;
revoke all on table public.singles_credit_accounts from public,anon,authenticated;
grant select,insert,update on table public.singles_credit_accounts to service_role;
alter table public.singles_credit_ledger enable row level security;
revoke all on table public.singles_credit_ledger from public,anon,authenticated;
grant select,insert,update on table public.singles_credit_ledger to service_role;
alter table public.singles_price_rules enable row level security;
revoke all on table public.singles_price_rules from public,anon,authenticated;
grant select,insert,update on table public.singles_price_rules to service_role;
alter table public.singles_pass_plans enable row level security;
revoke all on table public.singles_pass_plans from public,anon,authenticated;
grant select,insert,update on table public.singles_pass_plans to service_role;
alter table public.singles_pass_grants enable row level security;
revoke all on table public.singles_pass_grants from public,anon,authenticated;
grant select,insert,update on table public.singles_pass_grants to service_role;
alter table public.singles_paid_requests enable row level security;
revoke all on table public.singles_paid_requests from public,anon,authenticated;
grant select,insert,update on table public.singles_paid_requests to service_role;
alter table public.singles_contact_unlocks enable row level security;
revoke all on table public.singles_contact_unlocks from public,anon,authenticated;
grant select,insert,update on table public.singles_contact_unlocks to service_role;
alter table public.singles_signup_attempts enable row level security;
revoke all on table public.singles_signup_attempts from public,anon,authenticated;
grant select,insert,update on table public.singles_signup_attempts to service_role;
alter table public.singles_pilot_users enable row level security;
revoke all on table public.singles_pilot_users from public,anon,authenticated;
grant select,insert,update on table public.singles_pilot_users to service_role;
alter table public.singles_adult_verifications enable row level security;
revoke all on table public.singles_adult_verifications from public,anon,authenticated;
grant select,insert,update on table public.singles_adult_verifications to service_role;

-- 입력·공개 점수: 표시 이름(별명)·신앙 항목 제외 9개 항목. 화면·서버(profileScore)와 같은 기준.
create or replace function public.singles_profile_score(p_user uuid,out total integer,out filled integer,out shown integer)
 language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.singles_profiles%rowtype; k text; v text; vis jsonb;
begin
 total:=9;filled:=0;shown:=0;
 select * into p from public.singles_profiles where user_id=p_user;
 if not found then return; end if;
 vis:=coalesce(p.visibility,'{}'::jsonb);
 foreach k in array array['broad_region','intro','real_name','gender','age_band','occupation','education','hobbies','looking_for'] loop
  v:=case k when 'broad_region' then p.broad_region when 'intro' then p.intro else p.details->>k end;
  if coalesce(btrim(v),'')<>'' then
   filled:=filled+1;
   if (vis ? k and vis->>k='true') or (not (vis ? k) and k in ('broad_region','intro')) then shown:=shown+1; end if;
  end if;
 end loop;
end $$;

-- 요금 = 기본 요금 × (1 − 최대할인율 × (입력률+공개율)/2), 1,000원 단위 내림, 최저 금액 보장.
-- 메시지 이용권 기간 중 메시지 교환은 0원.
create or replace function public.singles_price_quote(p_user uuid,p_kind text)
 returns integer language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.singles_price_rules%rowtype; s record; price numeric;
begin
 select * into r from public.singles_price_rules where kind=p_kind;
 if not found then raise exception 'invalid_kind' using errcode='22023'; end if;
 if p_kind='message' and exists(select 1 from public.singles_pass_grants where user_id=p_user and expires_at>now()) then return 0; end if;
 select * into s from public.singles_profile_score(p_user);
 price:=r.standard_krw*(1-(r.max_discount_pct/100.0)*((s.filled+s.shown)::numeric/(2*s.total)));
 return greatest(r.floor_krw,(floor(price/1000)*1000)::integer);
end $$;

create or replace function public.singles_is_paid_member(p_user uuid)
 returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.singles_credit_accounts a join public.singles_memberships m on m.user_id=a.user_id
  where a.user_id=p_user and m.status='active' and m.paid_member_since is not null)
$$;

create or replace function public.singles_paid_request_create(p_requester uuid,p_responder uuid,p_kind text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare fee integer; a public.singles_credit_accounts%rowtype; rid uuid; lo uuid; hi uuid;
begin
 if p_requester is null or p_responder is null or p_requester=p_responder then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_kind not in ('message','contact') then raise exception 'invalid_kind' using errcode='22023'; end if;
 if not public.singles_is_paid_member(p_requester) then raise exception 'paid_membership_required' using errcode='42501'; end if;
 if not public.singles_is_paid_member(p_responder) then raise exception 'responder_unavailable' using errcode='P0002'; end if;
 lo:=least(p_requester,p_responder);hi:=greatest(p_requester,p_responder);
 if p_kind='contact' and exists(select 1 from public.singles_contact_unlocks where user_low=lo and user_high=hi)
 then raise exception 'contact_already_shared' using errcode='23505'; end if;
 if p_kind='message' and exists(select 1 from public.singles_interests where status='accepted'
   and ((from_user_id=p_requester and to_user_id=p_responder) or (from_user_id=p_responder and to_user_id=p_requester)))
 then raise exception 'already_connected' using errcode='23505'; end if;
 if exists(select 1 from public.singles_paid_requests where requester_id=p_requester and responder_id=p_responder and kind=p_kind and status='pending')
 then raise exception 'request_exists' using errcode='23505'; end if;
 select * into a from public.singles_credit_accounts where user_id=p_requester for update;
 fee:=public.singles_price_quote(p_requester,p_kind);
 if a.balance_krw<fee then raise exception 'insufficient_credit:%',fee using errcode='P0001'; end if;
 insert into public.singles_paid_requests(requester_id,responder_id,kind,requester_fee_krw)
  values(p_requester,p_responder,p_kind,fee) returning id into rid;
 if fee>0 then
  update public.singles_credit_accounts set balance_krw=balance_krw-fee,reserved_krw=reserved_krw+fee,updated_at=now() where user_id=p_requester;
  insert into public.singles_credit_ledger(user_id,delta_krw,reserved_delta_krw,reason,ref) values(p_requester,-fee,fee,'request_reserved',rid::text);
 end if;
 return jsonb_build_object('request_id',rid,'fee_krw',fee,'kind',p_kind);
end $$;

create or replace function public.singles_paid_request_decide(p_responder uuid,p_request uuid,p_decision text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.singles_paid_requests%rowtype; fee integer:=0; a public.singles_credit_accounts%rowtype; iid uuid;
begin
 if p_decision not in ('accepted','declined') then raise exception 'invalid_decision' using errcode='22023'; end if;
 select * into q from public.singles_paid_requests where id=p_request for update;
 if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
 if q.responder_id<>p_responder then raise exception 'responder_only' using errcode='42501'; end if;
 if q.status<>'pending' then raise exception 'request_not_pending' using errcode='23514'; end if;
 if p_decision='accepted' then
  if not public.singles_is_paid_member(p_responder) then raise exception 'paid_membership_required' using errcode='42501'; end if;
  select * into a from public.singles_credit_accounts where user_id=p_responder for update;
  fee:=public.singles_price_quote(p_responder,q.kind);
  if a.balance_krw<fee then raise exception 'responder_insufficient_credit:%',fee using errcode='P0001'; end if;
  if fee>0 then
   update public.singles_credit_accounts set balance_krw=balance_krw-fee,updated_at=now() where user_id=p_responder;
   insert into public.singles_credit_ledger(user_id,delta_krw,reason,ref) values(p_responder,-fee,'accept_charged',q.id::text);
  end if;
  if q.requester_fee_krw>0 then
   update public.singles_credit_accounts set reserved_krw=reserved_krw-q.requester_fee_krw,updated_at=now()
    where user_id=q.requester_id and reserved_krw>=q.requester_fee_krw;
   if not found then raise exception 'reserved_balance_mismatch'; end if;
   insert into public.singles_credit_ledger(user_id,reserved_delta_krw,reason,ref) values(q.requester_id,-q.requester_fee_krw,'request_charged',q.id::text);
  end if;
  -- 대화 연결(양방향 중 기존 행 재사용, 없으면 생성).
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
  update public.singles_paid_requests set status='accepted',responder_fee_krw=fee,interest_id=iid,decided_at=now() where id=q.id;
 else
  if q.requester_fee_krw>0 then
   update public.singles_credit_accounts set reserved_krw=reserved_krw-q.requester_fee_krw,balance_krw=balance_krw+q.requester_fee_krw,updated_at=now()
    where user_id=q.requester_id and reserved_krw>=q.requester_fee_krw;
   if not found then raise exception 'reserved_balance_mismatch'; end if;
   insert into public.singles_credit_ledger(user_id,delta_krw,reserved_delta_krw,reason,ref) values(q.requester_id,q.requester_fee_krw,-q.requester_fee_krw,'request_released',q.id::text);
  end if;
  update public.singles_paid_requests set status='declined',decided_at=now() where id=q.id;
 end if;
 return jsonb_build_object('status',p_decision,'fee_krw',fee,'interest_id',iid,'kind',q.kind);
end $$;

-- 대기 요청 반환: p_user=null이면 14일 지난 요청 만료, 아니면 해당 회원 관련 대기 요청(탈퇴).
create or replace function public.singles_paid_request_release(p_user uuid,p_reason text)
 returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare q record; n int:=0;
begin
 if p_reason not in ('expired','withdrawn') then raise exception 'invalid_release' using errcode='22023'; end if;
 for q in select * from public.singles_paid_requests where status='pending'
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

create or replace function public.singles_pass_purchase(p_user uuid,p_code text)
 returns timestamptz language plpgsql security definer set search_path=pg_catalog,public as $$
declare pl public.singles_pass_plans%rowtype; a public.singles_credit_accounts%rowtype; v_until timestamptz;
begin
 if not public.singles_is_paid_member(p_user) then raise exception 'paid_membership_required' using errcode='42501'; end if;
 select * into pl from public.singles_pass_plans where code=p_code and active=true;
 if not found then raise exception 'pass_not_available' using errcode='P0002'; end if;
 select * into a from public.singles_credit_accounts where user_id=p_user for update;
 if a.balance_krw<pl.price_krw then raise exception 'insufficient_credit:%',pl.price_krw using errcode='P0001'; end if;
 update public.singles_credit_accounts set balance_krw=balance_krw-pl.price_krw,updated_at=now() where user_id=p_user;
 insert into public.singles_pass_grants(user_id,expires_at,last_code) values(p_user,now()+make_interval(days=>pl.days),pl.code)
  on conflict(user_id) do update set expires_at=greatest(public.singles_pass_grants.expires_at,now())+make_interval(days=>pl.days),
   last_code=excluded.last_code,updated_at=now()
  returning expires_at into v_until;
 insert into public.singles_credit_ledger(user_id,delta_krw,reason,ref) values(p_user,-pl.price_krw,'pass_purchase',pl.code);
 return v_until;
end $$;

-- 운영자 수동 성인 확인(본인확인기관 연동 전 실증용). 본인 확인 금지, 감사 기록 필수.
create or replace function public.singles_operator_verify_adult(p_operator uuid,p_user uuid,p_method text,p_note text)
 returns timestamptz language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_at timestamptz;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true and can_verify=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_operator=p_user then raise exception 'operator_self_verification_forbidden' using errcode='42501'; end if;
 if p_method not in ('id_document_in_person','id_document_video','certified_provider') then raise exception 'invalid_method' using errcode='22023'; end if;
 update public.singles_memberships set adult_verified_at=coalesce(adult_verified_at,now()),updated_at=now()
  where user_id=p_user and status='active' and age_19_confirmed=true returning adult_verified_at into v_at;
 if v_at is null then raise exception 'member_not_found' using errcode='P0002'; end if;
 insert into public.singles_adult_verifications(user_id,operator_id,method,note) values(p_user,p_operator,p_method,left(coalesce(p_note,''),200));
 return v_at;
end $$;

-- 입금 확인: 적립금 상품(credit_krw)이면 원 단위 적립금 생성·충전, 가입비면 유료회원 시작.
create or replace function public.singles_bank_confirm_order(p_reference text,p_operator uuid,p_action text,p_trace text default null,p_reason text default null)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.singles_bank_orders%rowtype; credit int;
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
  select credit_krw into credit from public.singles_bank_plans where code=r.plan_code;
  if r.plan_code='credit_topup' and not public.singles_is_paid_member(r.user_id)
  then raise exception 'paid_membership_required' using errcode='23514'; end if;
  update public.singles_bank_orders set status='verified',verified_at=now(),verified_by=p_operator,
    bank_trace=trim(p_trace),rejection_reason=null where reference=p_reference;
  if credit is not null then
   insert into public.singles_credit_accounts(user_id,balance_krw) values(r.user_id,credit)
    on conflict(user_id) do update set balance_krw=public.singles_credit_accounts.balance_krw+excluded.balance_krw,updated_at=now();
   insert into public.singles_credit_ledger(user_id,delta_krw,reason,ref)
    values(r.user_id,credit,case when r.plan_code='credit_initial' then 'join_fee' else 'topup' end,r.reference);
   if r.plan_code='credit_initial' then
    update public.singles_memberships set paid_member_since=coalesce(paid_member_since,now()),updated_at=now() where user_id=r.user_id;
   end if;
  else
  insert into public.singles_bank_grants(user_id,plan_code,expires_at,last_order_reference)
    values(r.user_id,r.plan_code,now()+make_interval(days=>r.duration_days),r.reference)
    on conflict(user_id,plan_code) do update set
      expires_at=greatest(public.singles_bank_grants.expires_at,now())+make_interval(days=>r.duration_days),
      last_order_reference=excluded.last_order_reference,updated_at=now();
  end if;
  insert into public.singles_bank_audit(reference,actor_id,action) values(p_reference,p_operator,'admin_verified');
 else
  update public.singles_bank_orders set status='rejected',verified_by=p_operator,
    rejection_reason=left(nullif(trim(coalesce(p_reason,'')),''),200) where reference=p_reference;
  insert into public.singles_bank_audit(reference,actor_id,action) values(p_reference,p_operator,'admin_rejected');
 end if;
 return p_action;
end $$;

-- 탈퇴: 유료 요청 보류액도 반환.
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
 insert into public.singles_consent_receipts(user_id,action,consent_version,religion_consent,marriage_opt_in)
   values(p_user,'withdrawn',p_version,false,false);
 return jsonb_build_object('closed_interests',closed_interests,'cancelled_rsvps',cancelled_rsvps);
end $$;

revoke all on function public.singles_profile_score(uuid) from public,anon,authenticated;
grant execute on function public.singles_profile_score(uuid) to service_role;
revoke all on function public.singles_price_quote(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_price_quote(uuid,text) to service_role;
revoke all on function public.singles_is_paid_member(uuid) from public,anon,authenticated;
grant execute on function public.singles_is_paid_member(uuid) to service_role;
revoke all on function public.singles_paid_request_create(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_paid_request_create(uuid,uuid,text) to service_role;
revoke all on function public.singles_paid_request_decide(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.singles_paid_request_decide(uuid,uuid,text) to service_role;
revoke all on function public.singles_paid_request_release(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_paid_request_release(uuid,text) to service_role;
revoke all on function public.singles_pass_purchase(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_pass_purchase(uuid,text) to service_role;
revoke all on function public.singles_operator_verify_adult(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.singles_operator_verify_adult(uuid,uuid,text,text) to service_role;
revoke all on function public.singles_bank_confirm_order(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.singles_bank_confirm_order(text,uuid,text,text,text) to service_role;
revoke all on function public.singles_withdraw_member(uuid,text) from public,anon,authenticated;
grant execute on function public.singles_withdraw_member(uuid,text) to service_role;
