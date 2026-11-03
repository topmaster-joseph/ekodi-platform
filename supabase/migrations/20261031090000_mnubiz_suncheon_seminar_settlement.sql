-- EKODI / MNU Business Alumni / Suncheon seminar / member-only settlement
-- Financial claims are submitted only; approval is a separately authorized operator action.
create table if not exists public.mnubiz_suncheon_participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  event_key text not null default 'suncheon-2026' check (event_key='suncheon-2026'),
  status text not null default 'requested' check (status in ('requested','approved','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mnubiz_suncheon_claims (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'suncheon-2026' check (event_key='suncheon-2026'),
  participant_user_id uuid not null references public.mnubiz_suncheon_participants(user_id),
  kind text not null check (kind in ('contribution','personal_expense')),
  category text not null check (category in ('숙박','개인식사','현지이동','참가비','기타')),
  amount_krw integer not null check (amount_krw>0 and amount_krw<=5000000),
  memo text not null default '' check (char_length(memo)<=250),
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mnubiz_suncheon_claims_user_idx on public.mnubiz_suncheon_claims(participant_user_id,created_at desc);
alter table public.mnubiz_suncheon_participants enable row level security;
alter table public.mnubiz_suncheon_claims enable row level security;
grant select,insert,update on public.mnubiz_suncheon_participants to authenticated;
grant select,insert,update on public.mnubiz_suncheon_claims to authenticated;
revoke all on public.mnubiz_suncheon_participants from anon;
revoke all on public.mnubiz_suncheon_claims from anon;
-- No membership is inferred from Google login alone: an active mnubiz tenant membership is required.
drop policy if exists mnubiz_participants_read on public.mnubiz_suncheon_participants;
create policy mnubiz_participants_read on public.mnubiz_suncheon_participants for select to authenticated using (
  (user_id=(select auth.uid()) and exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active'))
  or exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
);
drop policy if exists mnubiz_participants_apply on public.mnubiz_suncheon_participants;
create policy mnubiz_participants_apply on public.mnubiz_suncheon_participants for insert to authenticated with check (
  user_id=(select auth.uid()) and status='requested' and
  exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active')
);
drop policy if exists mnubiz_participants_admin_update on public.mnubiz_suncheon_participants;
create policy mnubiz_participants_admin_update on public.mnubiz_suncheon_participants for update to authenticated
using (
  exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
)
with check (
  exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
);
drop policy if exists mnubiz_claims_read on public.mnubiz_suncheon_claims;
create policy mnubiz_claims_read on public.mnubiz_suncheon_claims for select to authenticated using (
  (participant_user_id=(select auth.uid()) and exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active'))
  or exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
);
drop policy if exists mnubiz_claims_submit on public.mnubiz_suncheon_claims;
create policy mnubiz_claims_submit on public.mnubiz_suncheon_claims for insert to authenticated with check (
  participant_user_id=(select auth.uid()) and created_by=(select auth.uid()) and status='submitted' and
  exists(select 1 from public.mnubiz_suncheon_participants sp where sp.user_id=(select auth.uid()) and sp.status='approved')
  and exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active')
);
drop policy if exists mnubiz_claims_admin_update on public.mnubiz_suncheon_claims;
create policy mnubiz_claims_admin_update on public.mnubiz_suncheon_claims for update to authenticated
using (
  exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
)
with check (
  exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where t.slug='mnubiz' and m.user_id=(select auth.uid()) and m.status='active' and m.role::text in ('tenant_admin','platform_admin'))
  or exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.platform_admin=true)
);
