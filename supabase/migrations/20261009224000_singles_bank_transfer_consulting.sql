-- EKODI Singles: offline bank-transfer subscriptions and optional non-matchmaking consulting.
-- DEV-first, feature flags OFF. No payment gateway/cards and no automatic grant from member declaration.
create table if not exists public.singles_bank_settings (
  id smallint primary key default 1 check(id=1),
  bank_name text check(bank_name is null or char_length(bank_name) between 2 and 70),
  account_number text check(account_number is null or char_length(account_number) between 6 and 40),
  account_holder text check(account_holder is null or char_length(account_holder) between 2 and 70),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint singles_bank_ready check(not active or (bank_name is not null and account_number is not null and account_holder is not null))
);
create table if not exists public.singles_bank_plans (
  code text primary key check(code in ('community','consulting')),
  display_name text not null,
  amount_krw integer check(amount_krw is null or amount_krw between 100 and 10000000),
  duration_days integer not null check(duration_days between 1 and 366),
  active boolean not null default false,
  constraint singles_price_required check(not active or amount_krw is not null)
);
insert into public.singles_bank_plans(code,display_name,duration_days) values
 ('community','행사 참여 구독',30),('consulting','선택형 일반 교제·소통 컨설팅',30)
 on conflict(code) do nothing;
create table if not exists public.singles_bank_operators (
  user_id uuid primary key references auth.users(id),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.singles_bank_operators is
 'Provision only by authorized EKODI Core platform role workflow; no self registration / email domain grants.';
create table if not exists public.singles_bank_orders (
  reference text primary key check(reference ~ '^EDH-[A-F0-9]{32}$'),
  user_id uuid not null references public.singles_memberships(user_id),
  plan_code text not null references public.singles_bank_plans(code),
  amount_krw integer not null check(amount_krw between 100 and 10000000),
  duration_days integer not null check(duration_days between 1 and 366),
  payment_method text not null default 'bank_transfer' check(payment_method='bank_transfer'),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  status text not null default 'awaiting_transfer'
     check(status in ('awaiting_transfer','reported_paid','verified','rejected','cancelled')),
  created_at timestamptz not null default now(),
  reported_paid_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  bank_trace text unique check(bank_trace is null or char_length(bank_trace) between 4 and 100),
  member_acknowledged_at timestamptz,
  rejection_reason text check(rejection_reason is null or char_length(rejection_reason)<=200),
  constraint singles_bank_confirm_fields check(
    status <> 'verified' or (reported_paid_at is not null and verified_at is not null and verified_by is not null and bank_trace is not null)
  )
);
create index if not exists singles_bank_orders_owner on public.singles_bank_orders(user_id,created_at desc);
create index if not exists singles_bank_orders_review on public.singles_bank_orders(status,created_at);
create table if not exists public.singles_bank_grants (
  user_id uuid not null references public.singles_memberships(user_id) on delete cascade,
  plan_code text not null references public.singles_bank_plans(code),
  expires_at timestamptz not null,
  last_order_reference text not null references public.singles_bank_orders(reference),
  updated_at timestamptz not null default now(),
  primary key(user_id,plan_code)
);
create table if not exists public.singles_bank_audit (
  id uuid primary key default gen_random_uuid(),
  reference text not null references public.singles_bank_orders(reference),
  actor_id uuid not null references auth.users(id),
  action text not null check(action in ('opened','member_reported','admin_verified','admin_rejected','member_acknowledged')),
  created_at timestamptz not null default now()
);
create index if not exists singles_bank_audit_order on public.singles_bank_audit(reference,created_at);
-- Only service_role may execute these transaction-safe functions; revoke default PUBLIC EXECUTE.
-- Atomic verification: lock order, verify operator, assign benefit only once.
create or replace function public.singles_bank_confirm_order(
 p_reference text, p_operator uuid, p_action text, p_trace text default null, p_reason text default null
) returns text language plpgsql security definer
 set search_path = pg_catalog, public
as $$
declare r public.singles_bank_orders%rowtype;
begin
 if not exists(select 1 from public.singles_bank_operators where user_id=p_operator and enabled=true)
 then raise exception 'operator_not_authorized' using errcode='42501'; end if;
 if p_action not in ('verified','rejected') then raise exception 'invalid_action' using errcode='22023'; end if;
 select * into r from public.singles_bank_orders where reference=p_reference for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if r.status<>'reported_paid' then raise exception 'order_not_awaiting_verification' using errcode='23514'; end if;
 if p_action='verified' then
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
-- New tables remain service-owned; no direct browser table exposure.
alter table public.singles_bank_settings enable row level security;
alter table public.singles_bank_plans enable row level security;
alter table public.singles_bank_operators enable row level security;
alter table public.singles_bank_orders enable row level security;
alter table public.singles_bank_grants enable row level security;
alter table public.singles_bank_audit enable row level security;
revoke all on table public.singles_bank_settings,public.singles_bank_plans,
 public.singles_bank_operators,public.singles_bank_orders,public.singles_bank_grants,
 public.singles_bank_audit from public,anon,authenticated;
grant select on table public.singles_bank_settings,public.singles_bank_plans,public.singles_bank_operators to service_role;
grant select,insert,update on table public.singles_bank_orders,public.singles_bank_grants to service_role;
grant select,insert on table public.singles_bank_audit to service_role;


-- Self-assertion records the member's action, never activates an entitlement.
create or replace function public.singles_bank_report_order(p_reference text,p_actor uuid)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.singles_bank_orders set status='reported_paid',reported_paid_at=now()
 where reference=p_reference and user_id=p_actor and status='awaiting_transfer';
 if not found then raise exception 'order_cannot_be_reported' using errcode='23514'; end if;
 insert into public.singles_bank_audit(reference,actor_id,action)
 values(p_reference,p_actor,'member_reported');
 return 'reported_paid';
end $$;
revoke all on function public.singles_bank_report_order(text,uuid) from public,anon,authenticated;
grant execute on function public.singles_bank_report_order(text,uuid) to service_role;
create or replace function public.singles_bank_acknowledge_order(p_reference text,p_actor uuid)
 returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.singles_bank_orders set member_acknowledged_at=now()
 where reference=p_reference and user_id=p_actor and status='verified' and member_acknowledged_at is null;
 if not found then raise exception 'order_cannot_be_acknowledged' using errcode='23514'; end if;
 insert into public.singles_bank_audit(reference,actor_id,action)
 values(p_reference,p_actor,'member_acknowledged');
 return 'member_acknowledged';
end $$;
revoke all on function public.singles_bank_acknowledge_order(text,uuid) from public,anon,authenticated;
grant execute on function public.singles_bank_acknowledge_order(text,uuid) to service_role;
-- Optional *general* communication / community consulting, never matchmaking with a named person.
create table if not exists public.singles_consulting_requests(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.singles_memberships(user_id),
  topic text not null check(topic in ('communication','community_participation','personal_growth')),
  status text not null default 'requested' check(status in ('requested','scheduled','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists singles_consulting_owner on public.singles_consulting_requests(user_id,created_at desc);
alter table public.singles_consulting_requests enable row level security;
revoke all on table public.singles_consulting_requests from public,anon,authenticated;
grant select,insert,update on table public.singles_consulting_requests to service_role;
