-- Report without exposing correspondence to administrators. DEV-only until review.
create table if not exists public.singles_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.singles_memberships(user_id) on delete cascade,
 target_id uuid not null references public.singles_memberships(user_id) on delete cascade,
 category text not null check(category in ('harassment','fake_profile','spam','safety','other')),
 details text not null default '' check(char_length(details)<=500),
 status text not null default 'open' check(status in ('open','under_review','resolved','dismissed')),
 created_at timestamptz not null default now(),
 check(reporter_id<>target_id)
);
create index if not exists singles_reports_queue_idx on public.singles_reports(status,created_at);
alter table public.singles_reports enable row level security;
revoke all on table public.singles_reports from public,anon,authenticated;
grant select,insert,update on table public.singles_reports to service_role;
comment on table public.singles_reports is 'Safety worker scoped queue. No automatic read access to private messages or spiritual answers.';
