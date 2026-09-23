-- EKODIBIZ operating core.
-- Additive only. Uses the existing tenant/member identity boundary instead of creating a second identity system.
-- Validate in staging before any production application.

create extension if not exists pgcrypto;

create table if not exists public.ekodibiz_divisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name_ko text not null check (char_length(name_ko) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  status text not null default 'active' check (status in ('planned','active','paused','archived')),
  domain text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, domain)
);

create table if not exists public.ekodibiz_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  division_id uuid not null references public.ekodibiz_divisions(id) on delete restrict,
  code text,
  name text not null check (char_length(name) between 1 and 180),
  description text not null default '',
  status text not null default 'planned' check (status in ('planned','active','waiting','completed','cancelled','archived')),
  owner_person_id uuid references public.people(id) on delete set null,
  started_at date,
  due_at date,
  completed_at date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, code),
  check (due_at is null or started_at is null or due_at >= started_at),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists public.ekodibiz_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  division_id uuid not null references public.ekodibiz_divisions(id) on delete restrict,
  project_id uuid references public.ekodibiz_projects(id) on delete set null,
  record_type text not null check (record_type in (
    'decision','activity','finance','document','contract','customer','partner',
    'publication','trade','marketing','research','system'
  )),
  title text not null check (char_length(title) between 1 and 240),
  body text not null default '',
  amount numeric(16,2),
  currency text not null default 'KRW' check (char_length(currency) between 3 and 8),
  occurred_at timestamptz not null default now(),
  status text not null default 'confirmed' check (status in ('draft','confirmed','void','archived')),
  source text not null default 'manual' check (source in ('manual','ai','import','integration','system')),
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ekodibiz_document_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  division_id uuid references public.ekodibiz_divisions(id) on delete set null,
  project_id uuid references public.ekodibiz_projects(id) on delete set null,
  record_id uuid references public.ekodibiz_records(id) on delete cascade,
  provider text not null default 'google_drive',
  external_id text,
  url text not null,
  title text not null default '',
  mime_type text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (division_id is not null or project_id is not null or record_id is not null)
);

create index if not exists ekodibiz_divisions_tenant_status_idx
  on public.ekodibiz_divisions(tenant_id, status, code);
create index if not exists ekodibiz_projects_division_status_idx
  on public.ekodibiz_projects(division_id, status, updated_at desc);
create index if not exists ekodibiz_projects_tenant_idx
  on public.ekodibiz_projects(tenant_id, updated_at desc);
create index if not exists ekodibiz_records_project_time_idx
  on public.ekodibiz_records(project_id, occurred_at desc);
create index if not exists ekodibiz_records_division_time_idx
  on public.ekodibiz_records(division_id, occurred_at desc);
create index if not exists ekodibiz_records_tenant_type_time_idx
  on public.ekodibiz_records(tenant_id, record_type, occurred_at desc);
create index if not exists ekodibiz_document_links_record_idx
  on public.ekodibiz_document_links(record_id, created_at desc);

create or replace function public.ekodibiz_has_tenant_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and p.platform_admin = true
  ) or exists (
    select 1
      from public.tenant_members tm
     where tm.tenant_id = p_tenant_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
  )
$$;

create or replace function public.ekodibiz_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'ekodibiz_projects' then
    if not exists (
      select 1 from public.ekodibiz_divisions d
       where d.id = new.division_id and d.tenant_id = new.tenant_id
    ) then
      raise exception 'ekodibiz_scope_mismatch';
    end if;
  elsif tg_table_name = 'ekodibiz_records' then
    if not exists (
      select 1 from public.ekodibiz_divisions d
       where d.id = new.division_id and d.tenant_id = new.tenant_id
    ) then
      raise exception 'ekodibiz_scope_mismatch';
    end if;
    if new.project_id is not null and not exists (
      select 1 from public.ekodibiz_projects p
       where p.id = new.project_id
         and p.tenant_id = new.tenant_id
         and p.division_id = new.division_id
    ) then
      raise exception 'ekodibiz_project_scope_mismatch';
    end if;
  elsif tg_table_name = 'ekodibiz_document_links' then
    if new.division_id is not null and not exists (
      select 1 from public.ekodibiz_divisions d
       where d.id = new.division_id and d.tenant_id = new.tenant_id
    ) then
      raise exception 'ekodibiz_scope_mismatch';
    end if;
    if new.project_id is not null and not exists (
      select 1 from public.ekodibiz_projects p
       where p.id = new.project_id and p.tenant_id = new.tenant_id
    ) then
      raise exception 'ekodibiz_project_scope_mismatch';
    end if;
    if new.record_id is not null and not exists (
      select 1 from public.ekodibiz_records r
       where r.id = new.record_id and r.tenant_id = new.tenant_id
    ) then
      raise exception 'ekodibiz_record_scope_mismatch';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.ekodibiz_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists ekodibiz_projects_scope_guard on public.ekodibiz_projects;
create trigger ekodibiz_projects_scope_guard
before insert or update on public.ekodibiz_projects
for each row execute function public.ekodibiz_validate_scope();

drop trigger if exists ekodibiz_records_scope_guard on public.ekodibiz_records;
create trigger ekodibiz_records_scope_guard
before insert or update on public.ekodibiz_records
for each row execute function public.ekodibiz_validate_scope();

drop trigger if exists ekodibiz_document_links_scope_guard on public.ekodibiz_document_links;
create trigger ekodibiz_document_links_scope_guard
before insert or update on public.ekodibiz_document_links
for each row execute function public.ekodibiz_validate_scope();

drop trigger if exists ekodibiz_divisions_touch on public.ekodibiz_divisions;
create trigger ekodibiz_divisions_touch
before update on public.ekodibiz_divisions
for each row execute function public.ekodibiz_touch_updated_at();

drop trigger if exists ekodibiz_projects_touch on public.ekodibiz_projects;
create trigger ekodibiz_projects_touch
before update on public.ekodibiz_projects
for each row execute function public.ekodibiz_touch_updated_at();

drop trigger if exists ekodibiz_records_touch on public.ekodibiz_records;
create trigger ekodibiz_records_touch
before update on public.ekodibiz_records
for each row execute function public.ekodibiz_touch_updated_at();

alter table public.ekodibiz_divisions enable row level security;
alter table public.ekodibiz_projects enable row level security;
alter table public.ekodibiz_records enable row level security;
alter table public.ekodibiz_document_links enable row level security;

-- The core is private by default. Tenant membership or platform-admin capability is required.
create policy ekodibiz_divisions_member_all on public.ekodibiz_divisions
for all to authenticated
using (public.ekodibiz_has_tenant_access(tenant_id))
with check (public.ekodibiz_has_tenant_access(tenant_id));

create policy ekodibiz_projects_member_all on public.ekodibiz_projects
for all to authenticated
using (public.ekodibiz_has_tenant_access(tenant_id))
with check (public.ekodibiz_has_tenant_access(tenant_id));

create policy ekodibiz_records_member_all on public.ekodibiz_records
for all to authenticated
using (public.ekodibiz_has_tenant_access(tenant_id))
with check (public.ekodibiz_has_tenant_access(tenant_id));

create policy ekodibiz_document_links_member_all on public.ekodibiz_document_links
for all to authenticated
using (public.ekodibiz_has_tenant_access(tenant_id))
with check (public.ekodibiz_has_tenant_access(tenant_id));

revoke all on public.ekodibiz_divisions, public.ekodibiz_projects, public.ekodibiz_records, public.ekodibiz_document_links from anon;
revoke all on function public.ekodibiz_has_tenant_access(uuid) from public;
revoke all on function public.ekodibiz_validate_scope() from public;
revoke all on function public.ekodibiz_touch_updated_at() from public;

grant select, insert, update, delete on public.ekodibiz_divisions to authenticated;
grant select, insert, update, delete on public.ekodibiz_projects to authenticated;
grant select, insert, update, delete on public.ekodibiz_records to authenticated;
grant select, insert, update, delete on public.ekodibiz_document_links to authenticated;
grant execute on function public.ekodibiz_has_tenant_access(uuid) to authenticated;
