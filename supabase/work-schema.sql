-- EKODI Work isolated table namespace.
-- Validate in the isolated PostgreSQL CI environment before applying to production.

create extension if not exists pgcrypto;

create table if not exists public.work_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'seeker' check (role in ('seeker','employer','both')),
  region text not null default '',
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  visa_status text not null default '',
  discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  region text not null default '',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.work_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  summary text not null default '',
  category text not null default '',
  employment_type text not null default '아르바이트',
  region text not null default '',
  location_text text not null default '',
  schedule_text text not null default '',
  wage_type text not null default 'negotiable' check (wage_type in ('hourly','monthly','project','negotiable')),
  wage_amount numeric(14,2) check (wage_amount is null or wage_amount >= 0),
  currency text not null default 'KRW',
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  visa_guidance text not null default '',
  status text not null default 'draft' check (status in ('draft','published','closed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.work_jobs(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 3000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','interview','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, applicant_user_id)
);

create index if not exists work_jobs_public_idx on public.work_jobs(status, published_at desc);
create index if not exists work_jobs_region_idx on public.work_jobs(region);
create index if not exists work_applications_user_idx on public.work_applications(applicant_user_id, created_at desc);
create index if not exists work_applications_job_idx on public.work_applications(job_id, created_at desc);
create index if not exists work_org_owner_idx on public.work_organizations(owner_user_id);

alter table public.work_profiles enable row level security;
alter table public.work_organizations enable row level security;
alter table public.work_jobs enable row level security;
alter table public.work_applications enable row level security;

-- Small ownership helpers let policies verify hidden owner UUIDs without granting clients access to those columns.
create or replace function public.work_owns_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.work_organizations o
    where o.id = p_organization_id and o.owner_user_id = auth.uid()
  )
$$;

create or replace function public.work_owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_jobs j
    join public.work_organizations o on o.id = j.organization_id
    where j.id = p_job_id and o.owner_user_id = auth.uid()
  )
$$;

-- Profiles are private by default. Future discovery must go through a purpose-built safe projection/RPC.
drop policy if exists work_profiles_own_select on public.work_profiles;
drop policy if exists work_profiles_own_insert on public.work_profiles;
drop policy if exists work_profiles_own_update on public.work_profiles;
create policy work_profiles_own_select on public.work_profiles for select to authenticated using (user_id = auth.uid());
create policy work_profiles_own_insert on public.work_profiles for insert to authenticated with check (user_id = auth.uid());
create policy work_profiles_own_update on public.work_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Organizations are publicly nameable, but owner_user_id is protected by column privileges below.
drop policy if exists work_org_public_select on public.work_organizations;
drop policy if exists work_org_owner_insert on public.work_organizations;
drop policy if exists work_org_owner_update on public.work_organizations;
drop policy if exists work_org_owner_delete on public.work_organizations;
create policy work_org_public_select on public.work_organizations for select to anon, authenticated using (true);
create policy work_org_owner_insert on public.work_organizations for insert to authenticated with check (owner_user_id = auth.uid());
create policy work_org_owner_update on public.work_organizations for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy work_org_owner_delete on public.work_organizations for delete to authenticated using (owner_user_id = auth.uid());

-- Published jobs are public. Draft/closed jobs remain visible only to their creator.
drop policy if exists work_jobs_public_select on public.work_jobs;
drop policy if exists work_jobs_owner_insert on public.work_jobs;
drop policy if exists work_jobs_owner_update on public.work_jobs;
drop policy if exists work_jobs_owner_delete on public.work_jobs;
create policy work_jobs_public_select on public.work_jobs for select to anon, authenticated using (status = 'published' or created_by = auth.uid());
create policy work_jobs_owner_insert on public.work_jobs for insert to authenticated with check (
  created_by = auth.uid() and public.work_owns_organization(organization_id)
);
create policy work_jobs_owner_update on public.work_jobs for update to authenticated using (created_by = auth.uid()) with check (
  created_by = auth.uid() and public.work_owns_organization(organization_id)
);
create policy work_jobs_owner_delete on public.work_jobs for delete to authenticated using (created_by = auth.uid());

-- Raw application rows are visible only to the applicant. Employers use the safe projection RPC below.
drop policy if exists work_applications_parties_select on public.work_applications;
drop policy if exists work_applications_self_select on public.work_applications;
drop policy if exists work_applications_self_insert on public.work_applications;
create policy work_applications_self_select on public.work_applications for select to authenticated using (
  applicant_user_id = auth.uid()
);
create policy work_applications_self_insert on public.work_applications for insert to authenticated with check (
  applicant_user_id = auth.uid()
  and exists (select 1 from public.work_profiles p where p.user_id = auth.uid())
  and exists (select 1 from public.work_jobs j where j.id = job_id and j.status = 'published')
);

-- Safe RPC: retrieve only the current employer's organization without exposing owner UUIDs publicly.
create or replace function public.work_get_my_organization()
returns table(id uuid, name text, region text, verified boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.region, o.verified, o.created_at, o.updated_at
  from public.work_organizations o
  where o.owner_user_id = auth.uid()
  order by o.created_at asc
  limit 1
$$;

-- Safe RPC: employer sees only applicants for jobs belonging to their organization.
create or replace function public.work_employer_applications()
returns table(
  application_id uuid,
  job_id uuid,
  job_title text,
  applicant_display_name text,
  applicant_region text,
  applicant_skills text[],
  applicant_languages text[],
  message text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.job_id, j.title, coalesce(p.display_name,'지원자'), coalesce(p.region,''),
         coalesce(p.skills,'{}'::text[]), coalesce(p.languages,'{}'::text[]), a.message, a.status, a.created_at
  from public.work_applications a
  join public.work_jobs j on j.id = a.job_id
  join public.work_organizations o on o.id = j.organization_id
  left join public.work_profiles p on p.user_id = a.applicant_user_id
  where o.owner_user_id = auth.uid()
  order by a.created_at desc
$$;

-- Safe RPC: only the owning employer may move an application through the hiring workflow.
drop function if exists public.work_update_application_status(uuid,text);
create function public.work_update_application_status(p_application_id uuid, p_status text)
returns table(application_id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('reviewing','interview','accepted','rejected') then
    raise exception 'invalid_application_status';
  end if;

  update public.work_applications a
     set status = p_status, updated_at = now()
   where a.id = p_application_id
     and public.work_owns_job(a.job_id)
  returning a.id, a.status, a.updated_at into application_id, status, updated_at;

  if application_id is null then
    raise exception 'application_not_found_or_not_authorized';
  end if;
  return next;
end
$$;

revoke all on public.work_profiles, public.work_organizations, public.work_jobs, public.work_applications from anon, authenticated;
revoke all on function public.work_owns_organization(uuid) from public;
revoke all on function public.work_owns_job(uuid) from public;
revoke all on function public.work_get_my_organization() from public;
revoke all on function public.work_employer_applications() from public;
revoke all on function public.work_update_application_status(uuid,text) from public;

-- Anonymous users receive only non-sensitive public columns.
grant select (id,name,region,verified,created_at,updated_at) on public.work_organizations to anon;
grant select (id,organization_id,title,summary,category,employment_type,region,location_text,schedule_text,wage_type,wage_amount,currency,skills,languages,visa_guidance,status,published_at,created_at,updated_at) on public.work_jobs to anon;

-- Authenticated users receive the same public fields plus operations protected by RLS/RPC.
grant select (id,name,region,verified,created_at,updated_at) on public.work_organizations to authenticated;
grant insert (owner_user_id,name,region) on public.work_organizations to authenticated;
grant update (name,region,updated_at) on public.work_organizations to authenticated;
grant delete on public.work_organizations to authenticated;

grant select (id,organization_id,title,summary,category,employment_type,region,location_text,schedule_text,wage_type,wage_amount,currency,skills,languages,visa_guidance,status,published_at,created_at,updated_at) on public.work_jobs to authenticated;
grant insert, update, delete on public.work_jobs to authenticated;

grant select, insert, update on public.work_profiles to authenticated;
grant select, insert on public.work_applications to authenticated;

grant execute on function public.work_owns_organization(uuid) to authenticated;
grant execute on function public.work_owns_job(uuid) to authenticated;
grant execute on function public.work_get_my_organization() to authenticated;
grant execute on function public.work_employer_applications() to authenticated;
grant execute on function public.work_update_application_status(uuid,text) to authenticated;
