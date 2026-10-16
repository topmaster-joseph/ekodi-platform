-- EKODI Singles: opt-in profile references and multi-period subscription pricing.
-- No automatic publishing, payment collection or identity verification.
alter table public.singles_profiles
 add column if not exists public_link text
 check (public_link is null or (char_length(public_link) <= 300 and public_link ~ '^https://[^[:space:]]+$'));
alter table public.singles_events
 add column if not exists fee_krw integer not null default 0
 check (fee_krw between 0 and 1000000);
alter table public.singles_bank_plans
 drop constraint if exists singles_bank_plans_code_check;
alter table public.singles_bank_plans
 add constraint singles_bank_plans_code_check
 check (code in ('community','community_90','community_365','consulting'));
insert into public.singles_bank_plans (code,display_name,amount_krw,duration_days,active)
values ('community_90','동행 90일 구독',24900,90,false),
       ('community_365','동행 연간 구독',79000,365,false)
on conflict (code) do nothing;
-- All new prices are suggestions; operators may edit them by capability.
-- Collection stays closed until verified bank settings, terms and release approval.
