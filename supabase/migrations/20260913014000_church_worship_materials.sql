create table if not exists public.church_worship_materials (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('sunday','saturday')),
  service_date date not null,
  service_name text not null,
  service_time text not null,
  scripture text not null default '',
  title text not null default '',
  preacher text not null default '',
  songs text not null default '',
  prayer text not null default '',
  notice text not null default '',
  meal text not null default '',
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_type, service_date)
);

alter table public.church_worship_materials enable row level security;

drop policy if exists "published worship is public" on public.church_worship_materials;
create policy "published worship is public"
on public.church_worship_materials for select
to anon, authenticated
using (is_published = true);

drop policy if exists "church tenant admin can read all worship" on public.church_worship_materials;
create policy "church tenant admin can read all worship"
on public.church_worship_materials for select
to authenticated
using (exists (
  select 1 from public.site_access_registry r
  where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    and r.site_key='church' and r.status='active' and r.role::text='tenant_admin'
));

drop policy if exists "church tenant admin can insert worship" on public.church_worship_materials;
create policy "church tenant admin can insert worship"
on public.church_worship_materials for insert
to authenticated
with check (exists (
  select 1 from public.site_access_registry r
  where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    and r.site_key='church' and r.status='active' and r.role::text='tenant_admin'
));

drop policy if exists "church tenant admin can update worship" on public.church_worship_materials;
create policy "church tenant admin can update worship"
on public.church_worship_materials for update
to authenticated
using (exists (
  select 1 from public.site_access_registry r
  where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    and r.site_key='church' and r.status='active' and r.role::text='tenant_admin'
))
with check (exists (
  select 1 from public.site_access_registry r
  where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    and r.site_key='church' and r.status='active' and r.role::text='tenant_admin'
));

drop policy if exists "church tenant admin can delete worship" on public.church_worship_materials;
create policy "church tenant admin can delete worship"
on public.church_worship_materials for delete
to authenticated
using (exists (
  select 1 from public.site_access_registry r
  where lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    and r.site_key='church' and r.status='active' and r.role::text='tenant_admin'
));

grant select on public.church_worship_materials to anon, authenticated;
grant insert, update, delete on public.church_worship_materials to authenticated;
