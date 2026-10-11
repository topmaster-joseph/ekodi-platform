-- Event fee changes require a separately provisioned, scoped organizer price capability.
create table if not exists public.singles_event_pricing_operators (
 user_id uuid primary key references auth.users(id),
 enabled boolean not null default false,
 can_price boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.singles_event_pricing_operators enable row level security;
revoke all on table public.singles_event_pricing_operators from public,anon,authenticated;
grant select on table public.singles_event_pricing_operators to service_role;
comment on table public.singles_event_pricing_operators is
 'Provision by authorized EKODI role workflow, never from self-registration or user profile.';
