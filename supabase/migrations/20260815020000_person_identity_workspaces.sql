-- EKODI central identity: one person, multiple verified login identities, many workspaces.
-- This migration is additive and keeps auth.users / site_access_registry / tenant_members
-- as compatibility surfaces while person-level identity is introduced.

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  status text not null default 'active' check (status in ('active','merged','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.login_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  email text not null,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','revoked')),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (auth_user_id)
);

create index if not exists login_identities_person_idx
  on public.login_identities(person_id, status);
create index if not exists login_identities_email_idx
  on public.login_identities(lower(email));

alter table public.people enable row level security;
alter table public.login_identities enable row level security;

-- Identity challenges are server-only. Add purpose and initiator so an authenticated
-- person can explicitly link another Google account without changing the active session.
alter table public.identity_challenges
  add column if not exists purpose text not null default 'login';
alter table public.identity_challenges
  add column if not exists initiator_user_id uuid references auth.users(id) on delete cascade;

create index if not exists identity_challenges_initiator_idx
  on public.identity_challenges(initiator_user_id, expires_at);

create or replace function public.ensure_person_identity(
  p_auth_user_id uuid,
  p_provider text,
  p_provider_subject text,
  p_email text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
  v_subject_person_id uuid;
  v_subject_auth_user_id uuid;
  v_primary_exists boolean;
begin
  if p_auth_user_id is null
     or nullif(trim(p_provider),'') is null
     or nullif(trim(p_provider_subject),'') is null
     or nullif(trim(p_email),'') is null then
    raise exception 'identity_fields_required';
  end if;

  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = p_auth_user_id
     and status = 'active'
   limit 1;

  select person_id, auth_user_id
    into v_subject_person_id, v_subject_auth_user_id
    from public.login_identities
   where provider = lower(trim(p_provider))
     and provider_subject = trim(p_provider_subject)
     and status = 'active'
   limit 1;

  if v_person_id is not null then
    if v_subject_person_id is not null and v_subject_person_id <> v_person_id then
      raise exception 'identity_already_linked';
    end if;

    update public.login_identities
       set provider = lower(trim(p_provider)),
           provider_subject = trim(p_provider_subject),
           email = lower(trim(p_email)),
           last_seen_at = now()
     where auth_user_id = p_auth_user_id;

    update public.people
       set display_name = coalesce(nullif(trim(p_display_name),''), display_name),
           updated_at = now()
     where id = v_person_id;
    return v_person_id;
  end if;

  if v_subject_person_id is not null then
    if v_subject_auth_user_id <> p_auth_user_id then
      raise exception 'identity_subject_conflict';
    end if;
    return v_subject_person_id;
  end if;

  insert into public.people(display_name)
  values (nullif(trim(p_display_name),''))
  returning id into v_person_id;

  select exists(
    select 1 from public.login_identities where person_id = v_person_id and status = 'active'
  ) into v_primary_exists;

  insert into public.login_identities(
    person_id, auth_user_id, provider, provider_subject, email, is_primary
  ) values (
    v_person_id,
    p_auth_user_id,
    lower(trim(p_provider)),
    trim(p_provider_subject),
    lower(trim(p_email)),
    not v_primary_exists
  );

  return v_person_id;
end
$$;

create or replace function public.link_person_identity(
  p_initiator_user_id uuid,
  p_target_user_id uuid,
  p_provider text,
  p_provider_subject text,
  p_email text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
  v_target_person_id uuid;
  v_subject_person_id uuid;
begin
  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = p_initiator_user_id
     and status = 'active'
   limit 1;

  if v_person_id is null then
    raise exception 'initiator_person_required';
  end if;

  select person_id
    into v_target_person_id
    from public.login_identities
   where auth_user_id = p_target_user_id
     and status = 'active'
   limit 1;

  if v_target_person_id is not null and v_target_person_id <> v_person_id then
    raise exception 'target_account_already_linked';
  end if;

  select person_id
    into v_subject_person_id
    from public.login_identities
   where provider = lower(trim(p_provider))
     and provider_subject = trim(p_provider_subject)
     and status = 'active'
   limit 1;

  if v_subject_person_id is not null and v_subject_person_id <> v_person_id then
    raise exception 'identity_already_linked';
  end if;

  if v_target_person_id = v_person_id then
    update public.login_identities
       set email = lower(trim(p_email)),
           last_seen_at = now()
     where auth_user_id = p_target_user_id;
    return v_person_id;
  end if;

  insert into public.login_identities(
    person_id, auth_user_id, provider, provider_subject, email, is_primary
  ) values (
    v_person_id,
    p_target_user_id,
    lower(trim(p_provider)),
    trim(p_provider_subject),
    lower(trim(p_email)),
    false
  );

  update public.people
     set display_name = coalesce(display_name, nullif(trim(p_display_name),'')),
         updated_at = now()
   where id = v_person_id;

  return v_person_id;
end
$$;

create or replace function public.sync_person_access(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
begin
  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = p_auth_user_id
     and status = 'active'
   limit 1;

  if v_person_id is null then
    return;
  end if;

  insert into public.profiles(user_id)
  select li.auth_user_id
    from public.login_identities li
   where li.person_id = v_person_id and li.status = 'active'
  on conflict (user_id) do nothing;

  -- Memberships follow the person, not whichever Google door was used today.
  insert into public.tenant_members(tenant_id, user_id, role, status)
  select distinct tm.tenant_id, target.auth_user_id, tm.role, tm.status
    from public.tenant_members tm
    join public.login_identities source
      on source.auth_user_id = tm.user_id
     and source.person_id = v_person_id
     and source.status = 'active'
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
  on conflict (tenant_id, user_id, role)
  do update set status = excluded.status;

  insert into public.store_members(store_id, user_id, role)
  select distinct sm.store_id, target.auth_user_id, sm.role
    from public.store_members sm
    join public.login_identities source
      on source.auth_user_id = sm.user_id
     and source.person_id = v_person_id
     and source.status = 'active'
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
  on conflict (store_id, user_id, role) do nothing;

  -- Legacy/pre-registered email grants also become person-level once that Google
  -- identity has been explicitly verified and linked.
  insert into public.tenant_members(tenant_id, user_id, role, status)
  select distinct r.tenant_id, target.auth_user_id, r.role, 'active'
    from public.site_access_registry r
    join public.login_identities source
      on lower(source.email) = lower(r.email)
     and source.person_id = v_person_id
     and source.status = 'active'
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
   where r.tenant_id is not null
     and r.status in ('pre_registered','active')
  on conflict (tenant_id, user_id, role)
  do update set status = 'active';

  update public.site_access_registry r
     set status = 'active', updated_at = now()
   where r.status = 'pre_registered'
     and exists (
       select 1
         from public.login_identities li
        where li.person_id = v_person_id
          and li.status = 'active'
          and lower(li.email) = lower(r.email)
     );

  if exists (
    select 1
      from public.profiles p
      join public.login_identities li on li.auth_user_id = p.user_id
     where li.person_id = v_person_id
       and li.status = 'active'
       and p.platform_admin = true
    union all
    select 1
      from public.site_access_registry r
      join public.login_identities li on lower(li.email) = lower(r.email)
     where li.person_id = v_person_id
       and li.status = 'active'
       and r.status in ('pre_registered','active')
       and (r.site_key = 'admin' or r.role = 'platform_admin')
  ) then
    update public.profiles p
       set platform_admin = true
     where exists (
       select 1
         from public.login_identities li
        where li.person_id = v_person_id
          and li.status = 'active'
          and li.auth_user_id = p.user_id
     );
  end if;
end
$$;

create or replace function public.current_site_workspaces(p_site_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_person_id uuid;
  v_result jsonb;
begin
  if v_user_id is null or v_email = '' then
    return '[]'::jsonb;
  end if;

  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = v_user_id
     and status = 'active'
   limit 1;

  with identity_scope as (
    select lower(li.email) as email
      from public.login_identities li
     where v_person_id is not null
       and li.person_id = v_person_id
       and li.status = 'active'
    union
    select v_email
  ),
  ranked as (
    select
      r.id,
      r.site_key,
      r.tenant_id,
      r.role::text as role,
      r.status,
      coalesce(r.plan,'standard') as plan,
      t.slug as tenant_slug,
      t.name as tenant_name,
      t.kind as tenant_kind,
      s.id as store_id,
      s.slug as store_slug,
      s.name as store_name,
      row_number() over (
        partition by coalesce(r.tenant_id::text, '__account__')
        order by
          case r.status when 'active' then 0 else 1 end,
          case r.role::text
            when 'platform_admin' then 0
            when 'tenant_admin' then 1
            when 'store_owner' then 2
            when 'store_staff' then 3
            when 'member' then 4
            else 5
          end,
          case coalesce(r.plan,'standard')
            when 'enterprise' then 0
            when 'pro' then 1
            when 'basic' then 2
            when 'standard' then 3
            else 4
          end,
          r.created_at
      ) as rn
      from public.site_access_registry r
      join identity_scope i on lower(r.email) = i.email
      left join public.tenants t on t.id = r.tenant_id
      left join lateral (
        select st.id, st.slug, st.name
          from public.stores st
         where st.tenant_id = r.tenant_id
         order by case when st.slug = 'main' then 0 else 1 end, st.created_at
         limit 1
      ) s on true
     where r.site_key = p_site_key
       and r.status in ('pre_registered','active')
  ),
  rows as (
    select
      case when tenant_id is null
        then 'account:' || p_site_key
        else 'tenant:' || tenant_id::text
      end as workspace_key,
      case when tenant_id is null
        then 'personal'
        when tenant_kind = 'business' then 'business'
        else 'organization'
      end as workspace_kind,
      coalesce(tenant_name, '개인') as workspace_name,
      site_key,
      tenant_id,
      tenant_slug,
      role,
      status,
      plan,
      store_id,
      store_slug,
      store_name,
      true as requires_handoff,
      'registry'::text as source,
      case when tenant_id is null then 0 else 10 end as sort_order
      from ranked
     where rn = 1
    union all
    select
      'personal:' || coalesce(v_person_id::text, v_user_id::text),
      'personal',
      '개인',
      p_site_key,
      null::uuid,
      null::text,
      'member',
      'free',
      'free',
      null::uuid,
      null::text,
      null::text,
      false,
      'synthetic',
      -10
     where p_site_key = 'marketing'
       and not exists (
         select 1 from ranked where rn = 1 and tenant_id is null
       )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'workspace_key', workspace_key,
        'workspace_kind', workspace_kind,
        'workspace_name', workspace_name,
        'site', site_key,
        'tenant_id', tenant_id,
        'tenant', tenant_slug,
        'role', role,
        'status', status,
        'plan', plan,
        'store_id', store_id,
        'store', store_slug,
        'store_name', store_name,
        'requires_handoff', requires_handoff,
        'source', source
      ) order by sort_order, workspace_name, workspace_key
    ),
    '[]'::jsonb
  ) into v_result
  from rows;

  return v_result;
end
$$;

-- Keep the existing single-access RPC contract for older services. It now resolves
-- all linked Google identities and returns the strongest registry-backed workspace.
create or replace function public.current_site_access(p_site_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_workspaces jsonb;
  v_item jsonb;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('authenticated',false,'status','unauthenticated');
  end if;

  v_workspaces := public.current_site_workspaces(p_site_key);

  select value
    into v_item
    from jsonb_array_elements(v_workspaces)
   where value->>'source' = 'registry'
   order by
     case value->>'status' when 'active' then 0 else 1 end,
     case value->>'plan'
       when 'enterprise' then 0
       when 'pro' then 1
       when 'basic' then 2
       when 'standard' then 3
       else 4
     end
   limit 1;

  if v_item is null then
    return jsonb_build_object(
      'authenticated',true,
      'email',v_email,
      'status','unregistered',
      'plan','free',
      'workspace_count',jsonb_array_length(v_workspaces)
    );
  end if;

  return jsonb_build_object(
    'authenticated',true,
    'email',v_email,
    'status',v_item->>'status',
    'role',v_item->>'role',
    'tenant_id',v_item->'tenant_id',
    'tenant',v_item->>'tenant',
    'plan',coalesce(v_item->>'plan','standard'),
    'workspace_key',v_item->>'workspace_key',
    'workspace_name',v_item->>'workspace_name',
    'workspace_count',jsonb_array_length(v_workspaces)
  );
end
$$;

revoke all on function public.ensure_person_identity(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.link_person_identity(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.sync_person_access(uuid) from public, anon, authenticated;
grant execute on function public.ensure_person_identity(uuid,text,text,text,text) to service_role;
grant execute on function public.link_person_identity(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.sync_person_access(uuid) to service_role;

revoke all on function public.current_site_workspaces(text) from public, anon;
revoke all on function public.current_site_access(text) from public, anon;
grant execute on function public.current_site_workspaces(text) to authenticated;
grant execute on function public.current_site_access(text) to authenticated;

comment on table public.people is 'Canonical EKODI person record, independent of login provider or organization membership.';
comment on table public.login_identities is 'Verified login identities linked to one canonical EKODI person.';
comment on function public.current_site_workspaces(text) is 'Returns every workspace available to the current person for a service, including linked Google identities.';
