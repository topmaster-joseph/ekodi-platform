-- Marketing AI workspaces must follow the verified store membership of the person,
-- not the first store that happens to exist under a tenant. Association-funded Basic
-- access is opt-in through tenant settings so the same policy can be reused beyond CGMA.

update public.tenants
   set settings = coalesce(settings, '{}'::jsonb)
     || jsonb_build_object(
          'marketing_ai',
          coalesce(settings->'marketing_ai', '{}'::jsonb)
          || jsonb_build_object('member_benefit', true, 'member_plan', 'basic')
        )
 where slug = 'cgma'
   and kind = 'association';

create or replace function public.current_site_workspaces_base(p_site_key text)
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
  identity_users as (
    select li.auth_user_id as user_id
      from public.login_identities li
     where v_person_id is not null
       and li.person_id = v_person_id
       and li.status = 'active'
    union
    select v_user_id
  ),
  store_scope_ranked as (
    select
      st.id as store_id,
      st.tenant_id,
      st.slug as store_slug,
      st.name as store_name,
      sm.role::text as store_role,
      row_number() over (
        partition by st.id
        order by case sm.role::text
          when 'platform_admin' then 0
          when 'tenant_admin' then 1
          when 'store_owner' then 2
          when 'store_staff' then 3
          when 'member' then 4
          else 5
        end
      ) as rn
      from public.stores st
      join public.store_members sm on sm.store_id = st.id
      join identity_users iu on iu.user_id = sm.user_id
  ),
  store_scope as (
    select store_id, tenant_id, store_slug, store_name, store_role
      from store_scope_ranked
     where rn = 1
  ),
  registry_scope as (
    select r.*
      from public.site_access_registry r
      join identity_scope i on lower(r.email) = i.email
     where r.status in ('pre_registered','active')
  ),
  direct_ranked as (
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
            when 'auto' then 1
            when 'pro' then 2
            when 'plus' then 3
            when 'basic' then 4
            when 'standard' then 5
            else 6
          end,
          r.created_at
      ) as rn
      from registry_scope r
      left join public.tenants t on t.id = r.tenant_id
     where r.site_key = p_site_key
  ),
  direct_selected as (
    select * from direct_ranked where rn = 1
  ),
  direct_rows as (
    -- Account-level registry access remains a personal workspace.
    select
      'account:' || p_site_key as workspace_key,
      'personal'::text as workspace_kind,
      '개인'::text as workspace_name,
      d.site_key,
      null::uuid as tenant_id,
      null::text as tenant_slug,
      d.role,
      d.status,
      d.plan,
      null::uuid as store_id,
      null::text as store_slug,
      null::text as store_name,
      true as requires_handoff,
      'registry'::text as source,
      0 as source_priority,
      0 as sort_order
      from direct_selected d
     where d.tenant_id is null

    union all

    -- If the person belongs to one or more stores under the tenant, emit the actual
    -- store workspaces instead of guessing the tenant's first store.
    select
      'store:' || s.store_id::text,
      'business'::text,
      s.store_name,
      d.site_key,
      d.tenant_id,
      d.tenant_slug,
      coalesce(s.store_role, d.role),
      d.status,
      d.plan,
      s.store_id,
      s.store_slug,
      s.store_name,
      true,
      'registry'::text,
      0,
      10
      from direct_selected d
      join store_scope s on s.tenant_id = d.tenant_id
     where d.tenant_id is not null

    union all

    -- Organization administrators and members without a confirmed store still retain
    -- their tenant workspace. Store-specific Marketing benefits are not granted here.
    select
      'tenant:' || d.tenant_id::text,
      case when d.tenant_kind = 'business' then 'business' else 'organization' end,
      coalesce(d.tenant_name, '조직'),
      d.site_key,
      d.tenant_id,
      d.tenant_slug,
      d.role,
      d.status,
      d.plan,
      null::uuid,
      null::text,
      null::text,
      true,
      'registry'::text,
      0,
      10
      from direct_selected d
     where d.tenant_id is not null
       and not exists (select 1 from store_scope s where s.tenant_id = d.tenant_id)
  ),
  association_ranked as (
    select
      r.tenant_id,
      t.slug as tenant_slug,
      t.name as tenant_name,
      lower(coalesce(t.settings#>>'{marketing_ai,member_plan}','')) as member_plan,
      row_number() over (
        partition by r.tenant_id
        order by
          case r.role::text
            when 'platform_admin' then 0
            when 'tenant_admin' then 1
            when 'store_owner' then 2
            when 'store_staff' then 3
            when 'member' then 4
            else 5
          end,
          r.created_at
      ) as rn
      from registry_scope r
      join public.tenants t on t.id = r.tenant_id
     where p_site_key = 'marketing'
       and r.status = 'active'
       and r.tenant_id is not null
       and t.kind = 'association'
       and coalesce((t.settings#>>'{marketing_ai,member_benefit}')::boolean, false) = true
       and lower(coalesce(t.settings#>>'{marketing_ai,member_plan}','')) in ('basic')
  ),
  association_rows as (
    -- An association benefit becomes a store-scoped Marketing Basic entitlement only
    -- after that person's store membership is confirmed.
    select
      'store:' || s.store_id::text as workspace_key,
      'business'::text as workspace_kind,
      s.store_name as workspace_name,
      'marketing'::text as site_key,
      a.tenant_id,
      a.tenant_slug,
      s.store_role as role,
      'active'::text as status,
      a.member_plan as plan,
      s.store_id,
      s.store_slug,
      s.store_name,
      true as requires_handoff,
      'association:' || a.tenant_slug as source,
      1 as source_priority,
      20 as sort_order
      from association_ranked a
      join store_scope s on s.tenant_id = a.tenant_id
     where a.rn = 1
  ),
  combined as (
    select * from direct_rows
    union all
    select * from association_rows
  ),
  deduped as (
    select *, row_number() over (
      partition by workspace_key
      order by source_priority, sort_order, workspace_name
    ) as workspace_rn
      from combined
  ),
  rows as (
    select
      workspace_key, workspace_kind, workspace_name, site_key, tenant_id, tenant_slug,
      role, status, plan, store_id, store_slug, store_name, requires_handoff, source,
      sort_order
      from deduped
     where workspace_rn = 1

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
         select 1 from direct_selected where tenant_id is null
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

revoke all on function public.current_site_workspaces_base(text) from public, anon, authenticated;

comment on function public.current_site_workspaces_base(text) is
  'Resolves person workspaces using verified store memberships and opt-in association-funded Marketing Basic benefits.';
