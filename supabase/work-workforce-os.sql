-- EKODI Work Local Workforce OS additive migration.
-- Adds private Work Passport data, institution/local networks, one-off Quick Hire requests,
-- and a minimal relationship ledger that can become the durable Work Graph.

create table if not exists public.work_passports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  availability_text text not null default '' check (char_length(availability_text) <= 500),
  preferred_types text[] not null default '{}',
  mobility_text text not null default '' check (char_length(mobility_text) <= 300),
  experience_summary text not null default '' check (char_length(experience_summary) <= 2000),
  alerts_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_networks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 120),
  network_type text not null check (network_type in ('university','merchant_association','municipality','institution','community')),
  operator_name text not null default 'EKODI' check (char_length(operator_name) between 1 and 120),
  region text not null default '',
  description text not null default '' check (char_length(description) <= 1200),
  status text not null default 'planning' check (status in ('planning','pilot','active','paused')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_network_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  organization_name text not null check (char_length(organization_name) between 2 and 120),
  network_type text not null check (network_type in ('university','merchant_association','municipality','institution','community')),
  region text not null default '' check (char_length(region) <= 120),
  note text not null default '' check (char_length(note) <= 2000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_quick_hire_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.work_organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  brief text not null check (char_length(brief) between 8 and 3000),
  urgency text not null default 'normal' check (urgency in ('normal','this_week','urgent')),
  target_date date,
  status text not null default 'submitted' check (status in ('submitted','reviewing','ready','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_relationships (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.work_applications(id) on delete cascade,
  job_id uuid not null references public.work_jobs(id) on delete cascade,
  organization_id uuid not null references public.work_organizations(id) on delete cascade,
  worker_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted','completed','cancelled')),
  connected_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists work_networks_public_idx on public.work_networks(is_public,status,region);
create index if not exists work_network_requests_user_idx on public.work_network_requests(requester_user_id,created_at desc);
create index if not exists work_quick_hire_owner_idx on public.work_quick_hire_requests(created_by,created_at desc);
create index if not exists work_relationships_worker_idx on public.work_relationships(worker_user_id,connected_at desc);
create index if not exists work_relationships_org_idx on public.work_relationships(organization_id,connected_at desc);

alter table public.work_passports enable row level security;
alter table public.work_networks enable row level security;
alter table public.work_network_requests enable row level security;
alter table public.work_quick_hire_requests enable row level security;
alter table public.work_relationships enable row level security;

drop policy if exists work_passports_own_select on public.work_passports;
drop policy if exists work_passports_own_insert on public.work_passports;
drop policy if exists work_passports_own_update on public.work_passports;
create policy work_passports_own_select on public.work_passports for select to authenticated using (user_id = auth.uid());
create policy work_passports_own_insert on public.work_passports for insert to authenticated with check (user_id = auth.uid());
create policy work_passports_own_update on public.work_passports for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists work_networks_public_select on public.work_networks;
create policy work_networks_public_select on public.work_networks for select to anon, authenticated using (
  is_public and status in ('pilot','active')
);

drop policy if exists work_network_requests_own_select on public.work_network_requests;
drop policy if exists work_network_requests_own_insert on public.work_network_requests;
create policy work_network_requests_own_select on public.work_network_requests for select to authenticated using (requester_user_id = auth.uid());
create policy work_network_requests_own_insert on public.work_network_requests for insert to authenticated with check (
  requester_user_id = auth.uid() and status = 'submitted'
);

drop policy if exists work_quick_hire_own_select on public.work_quick_hire_requests;
drop policy if exists work_quick_hire_own_insert on public.work_quick_hire_requests;
create policy work_quick_hire_own_select on public.work_quick_hire_requests for select to authenticated using (
  created_by = auth.uid() and public.work_owns_organization(organization_id)
);
create policy work_quick_hire_own_insert on public.work_quick_hire_requests for insert to authenticated with check (
  created_by = auth.uid() and status = 'submitted' and public.work_owns_organization(organization_id)
);

drop policy if exists work_relationships_parties_select on public.work_relationships;
create policy work_relationships_parties_select on public.work_relationships for select to authenticated using (
  worker_user_id = auth.uid() or public.work_owns_organization(organization_id)
);

-- Safe projection for the individual's relationship ledger. It intentionally exposes no employer/worker UUIDs.
create or replace function public.work_my_relationships()
returns table(
  relationship_id uuid,
  job_title text,
  organization_name text,
  status text,
  connected_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, j.title, o.name, r.status, r.connected_at, r.completed_at
  from public.work_relationships r
  join public.work_jobs j on j.id = r.job_id
  join public.work_organizations o on o.id = r.organization_id
  where r.worker_user_id = auth.uid()
  order by r.connected_at desc
$$;

-- Extend the existing status RPC so accepted matches become durable connections.
create or replace function public.work_update_application_status(p_application_id uuid, p_status text)
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

  if p_status = 'accepted' then
    insert into public.work_relationships(application_id,job_id,organization_id,worker_user_id,status,updated_at)
    select a.id,a.job_id,j.organization_id,a.applicant_user_id,'accepted',now()
    from public.work_applications a
    join public.work_jobs j on j.id = a.job_id
    where a.id = p_application_id
    on conflict on constraint work_relationships_application_id_key do update
      set status='accepted', updated_at=excluded.updated_at;
  elsif p_status = 'rejected' then
    update public.work_relationships
       set status='cancelled', updated_at=now()
     where work_relationships.application_id=p_application_id and work_relationships.status='accepted';
  end if;

  return next;
end
$$;

revoke all on public.work_passports, public.work_networks, public.work_network_requests, public.work_quick_hire_requests, public.work_relationships from anon, authenticated;
revoke all on function public.work_my_relationships() from public, anon;
revoke all on function public.work_update_application_status(uuid,text) from public, anon;

grant select (id,slug,name,network_type,operator_name,region,description,status,created_at,updated_at) on public.work_networks to anon, authenticated;

grant select,insert,update on public.work_passports to authenticated;
grant select (id,organization_name,network_type,region,note,status,created_at,updated_at) on public.work_network_requests to authenticated;
grant insert (requester_user_id,organization_name,network_type,region,note,status) on public.work_network_requests to authenticated;
grant select (id,organization_id,brief,urgency,target_date,status,created_at,updated_at) on public.work_quick_hire_requests to authenticated;
grant insert (organization_id,created_by,brief,urgency,target_date,status) on public.work_quick_hire_requests to authenticated;
grant select (id,application_id,job_id,organization_id,status,connected_at,completed_at,updated_at) on public.work_relationships to authenticated;
grant execute on function public.work_my_relationships() to authenticated;
grant execute on function public.work_update_application_status(uuid,text) to authenticated;
