-- EKODI Singles: non-brokerage digital communication & community product catalog.
-- Catalog-only release: no collection or entitlement grants until separate reviewed release.
-- Marriage consultation, introductions, matching guarantees and arranged meetings prohibited in this operating mode.
create table if not exists public.singles_product_catalog (
 code text primary key check(code ~ '^[a-z][a-z0-9_]{2,49}$'),
 title text not null check(char_length(title) between 2 and 90),
 category text not null check(category in ('message_credit','message_contact','message_period','event_application','coaching')),
 scope text not null check(scope in ('per_message','per_contact','per_period','per_application','session')),
 amount_krw integer not null check(amount_krw between 4900 and 200000),
 message_credits integer check(message_credits is null or message_credits between 1 and 10000),
 contact_credits integer check(contact_credits is null or contact_credits between 1 and 1000),
 period_days integer check(period_days is null or period_days between 1 and 366),
 session_minutes integer check(session_minutes is null or session_minutes between 15 and 240),
 active boolean not null default false,
 legal_reviewed boolean not null default false,
 published_at timestamptz,
 revised_at timestamptz not null default now(),
 check (
  (scope='per_message' and message_credits is not null and contact_credits is null and period_days is null) or
  (scope='per_contact' and contact_credits is not null and message_credits is null and period_days is null) or
  (scope='per_period' and period_days is not null and message_credits is null and contact_credits is null) or
  (scope in ('per_application','session') and message_credits is null and contact_credits is null and period_days is null)
 ),
 check(not active or (legal_reviewed and published_at is not null))
);
alter table public.singles_product_catalog enable row level security;
revoke all on public.singles_product_catalog from public, anon, authenticated;
grant select,insert,update on public.singles_product_catalog to service_role;

-- Immutable purchase snapshots avoid retroactive price or policy changes.
create table if not exists public.singles_product_price_snapshots (
 id uuid primary key default gen_random_uuid(),
 product_code text not null references public.singles_product_catalog(code),
 buyer_id uuid not null references auth.users(id),
 amount_krw integer not null check(amount_krw between 4900 and 200000),
 scope text not null,
 message_credits integer,
 contact_credits integer,
 period_days integer,
 terms_version text not null,
 payment_reference text unique,
 status text not null default 'pending' check(status in ('pending','confirmed','cancelled','refunded')),
 created_at timestamptz not null default now()
);
alter table public.singles_product_price_snapshots enable row level security;
revoke all on public.singles_product_price_snapshots from public, anon, authenticated;
grant select,insert on public.singles_product_price_snapshots to service_role;

insert into public.singles_product_catalog
(code,title,category,scope,amount_krw,message_credits,contact_credits,period_days,session_minutes)
values
('message_1','메시지 1회권','message_credit','per_message',4900,1,null,null,null),
('message_5','메시지 5회권','message_credit','per_message',19900,5,null,null,null),
('message_20','메시지 20회권','message_credit','per_message',59000,20,null,null,null),
('contact_1','상호동의 상대 1인 대화권','message_contact','per_contact',14900,null,1,null,null),
('contact_5','상호동의 상대 5인 대화권','message_contact','per_contact',59000,null,5,null,null),
('period_30','메시지 기간권 30일','message_period','per_period',39900,null,null,30,null),
('period_90','메시지 기간권 90일','message_period','per_period',99000,null,null,90,null),
('period_365','메시지 기간권 365일','message_period','per_period',199000,null,null,365,null),
('coaching_30','소통 방법 안내 30분','coaching','session',49000,null,null,null,30),
('coaching_60','커뮤니티 참여·소통 안내 60분','coaching','session',99000,null,null,null,60),
('coaching_120','대화·갈등 관리 워크숍 120분','coaching','session',199000,null,null,null,120),
('event_basic','행사 기본 신청료','event_application','per_application',9900,null,null,null,null),
('event_plus','행사 특별 신청료','event_application','per_application',29900,null,null,null,null)
on conflict(code) do nothing;
-- Consent-based charging must happen once and only after verified receiver acceptance.
-- Credits are pre-funded, but an outgoing request merely reserves a right;
-- a receiver's verified acceptance atomically consumes it.
create table if not exists public.singles_message_credit_wallets (
 user_id uuid not null references auth.users(id),
 scope text not null check(scope in ('per_message','per_contact')),
 available integer not null default 0 check(available>=0),
 reserved integer not null default 0 check(reserved>=0),
 updated_at timestamptz not null default now(),
 primary key(user_id,scope)
);
create table if not exists public.singles_message_consent_charges (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id),
 receiver_id uuid not null references auth.users(id),
 request_id uuid not null unique,
 product_code text not null references public.singles_product_catalog(code),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
 reservation_units integer not null default 1 check(reservation_units>0),
 charged_units integer not null default 0 check(charged_units>=0),
 accepted_at timestamptz,
 charged_at timestamptz,
 created_at timestamptz not null default now(),
 check(sender_id<>receiver_id),
 check(status<>'accepted' or (charged_at is not null and accepted_at is not null and charged_units=reservation_units)),
 check(status not in ('declined','cancelled','expired') or charged_units=0)
);
create unique index if not exists singles_message_consent_once
 on public.singles_message_consent_charges(sender_id,receiver_id,product_code)
 where status='accepted' and product_code like 'contact_%';
-- SQL rights must be served by a trusted RPC with a transaction lock and separate
-- verified payment receipt, not client-side state or a self-reported deposit.
alter table public.singles_message_credit_wallets enable row level security;
alter table public.singles_message_consent_charges enable row level security;
revoke all on public.singles_message_credit_wallets,public.singles_message_consent_charges from public,anon,authenticated;
grant select,insert,update on public.singles_message_credit_wallets,public.singles_message_consent_charges to service_role;
-- Application-readiness checklist is administrative-only, never a brokerage launch permit.
create table if not exists public.singles_brokerage_application_checklist (
 regime text not null check(regime in ('domestic','international')),
 requirement text not null check(char_length(requirement) between 3 and 75),
 completed boolean not null default false,
 evidence_reference text check(evidence_reference is null or char_length(evidence_reference)<=500),
 checked_by uuid references auth.users(id),
 checked_at timestamptz,
 primary key(regime,requirement)
);
alter table public.singles_brokerage_application_checklist enable row level security;
revoke all on public.singles_brokerage_application_checklist from public,anon,authenticated;
grant select,insert,update on public.singles_brokerage_application_checklist to service_role;
insert into public.singles_brokerage_application_checklist(regime,requirement)
values
('domestic','관할 시군구·사업자 형태 확인'),
('domestic','중개사무소 적합 시설 및 사용권원'),
('domestic','대표·종사자 결격사유와 종사자 명단'),
('domestic','보증보험 가입·증빙'),
('domestic','계약서·수수료·환불 약관 법률 검토'),
('domestic','개인정보·기록 보존·접근통제 검토'),
('domestic','정부24 신청서와 제출서류 준비'),
('domestic','관할 시군구 신고 수리 확인'),
('international','관할 시군구·사업자 형태 확인'),
('international','중개사무소 적합 시설 및 사용권원'),
('international','국제결혼중개업 종사자 교육 수료'),
('international','자본금 또는 자산평가액 1억원 이상 증빙'),
('international','보증보험 가입·증빙'),
('international','대표·종사자 결격사유 및 종사자 명단'),
('international','국제결혼 서면계약·번역·정보 제공 의무 검토'),
('international','국가별 외국법·비자·인권·통역 의무 검토'),
('international','정부24 등록신청과 관련 서류 준비'),
('international','관할 시군구 등록 완료 및 등록증 확인')
on conflict do nothing;
-- All products disabled by default. No matchmaking services or bypass of confirmed payment.
