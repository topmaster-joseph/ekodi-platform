-- Annual Sunday worship committee roster. Additive, isolated from worship
-- content and protected by the same church tenant-admin grant as worship edits.
-- Public names only; no phone, email or login identifiers exposed.
create table if not exists public.church_worship_committee_assignments (
  service_date date primary key,
  praise_leader text not null default '' check (char_length(praise_leader) <= 80),
  worship_leader text not null default '' check (char_length(worship_leader) <= 80),
  prayer_leader text not null default '' check (char_length(prayer_leader) <= 80),
  preacher text not null default '' check (char_length(preacher) <= 80),
  meal_coordinator text not null default '' check (char_length(meal_coordinator) <= 80),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint church_worship_committee_sunday check (extract(dow from service_date)=0)
);
alter table public.church_worship_committee_assignments enable row level security;
revoke all on public.church_worship_committee_assignments from public, anon, authenticated;
grant select on public.church_worship_committee_assignments to anon,authenticated;
grant insert,update,delete on public.church_worship_committee_assignments to authenticated;
grant all on public.church_worship_committee_assignments to service_role;
drop policy if exists "church public worship roster select" on public.church_worship_committee_assignments;
create policy "church public worship roster select"
on public.church_worship_committee_assignments for select to anon,authenticated using (true);
drop policy if exists "church tenant admin insert roster" on public.church_worship_committee_assignments;
create policy "church tenant admin insert roster"
on public.church_worship_committee_assignments for insert to authenticated
with check (exists(
 select 1 from public.site_access_registry r
 where lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
   and r.site_key='church' and r.status='active'
   and r.role='tenant_admin'::public.app_role
));
drop policy if exists "church tenant admin update roster" on public.church_worship_committee_assignments;
create policy "church tenant admin update roster"
on public.church_worship_committee_assignments for update to authenticated
using (exists(
 select 1 from public.site_access_registry r
 where lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
   and r.site_key='church' and r.status='active'
   and r.role='tenant_admin'::public.app_role
))
with check (exists(
 select 1 from public.site_access_registry r
 where lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
   and r.site_key='church' and r.status='active'
   and r.role='tenant_admin'::public.app_role
));
drop policy if exists "church tenant admin delete roster" on public.church_worship_committee_assignments;
create policy "church tenant admin delete roster"
on public.church_worship_committee_assignments for delete to authenticated
using (exists(
 select 1 from public.site_access_registry r
 where lower(r.email)=lower(coalesce((select auth.jwt())->>'email',''))
   and r.site_key='church' and r.status='active'
   and r.role='tenant_admin'::public.app_role
));
-- Verified source: 261122에코디주보, Worship committee (11/01..11/22).
-- Unverified weeks are not guessed or backfilled.
insert into public.church_worship_committee_assignments
(service_date,praise_leader,worship_leader,prayer_leader,preacher,meal_coordinator)
values
('2026-11-01','박은희','정찬균','정진','정찬균','박은희'),
('2026-11-08','박은희','정찬균','정성','정찬균','박은희'),
('2026-11-15','박은희','정찬균','정진','정찬균','박은희'),
('2026-11-22','박은희','정찬균','두본요','정찬균','박은희')
on conflict (service_date) do nothing;
