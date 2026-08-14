-- EKODI Mall: every verified Google identity may start as a free personal seller.
-- This mirrors the product policy: Member -> Seller Profile -> Product, Store optional.
-- Registry-backed business/organization workspaces remain separate and stronger.

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

    union all

    select
      'personal:' || coalesce(v_person_id::text, v_user_id::text),
      'personal',
      '개인 판매자',
      p_site_key,
      null::uuid,
      null::text,
      'member',
      'active',
      'free',
      null::uuid,
      null::text,
      null::text,
      true,
      'synthetic',
      -10
     where p_site_key = 'mall'
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

comment on function public.current_site_workspaces(text) is
  'Resolves linked-identity workspaces. Marketing keeps a no-handoff free workspace; Mall gets an active free personal seller workspace with one-time handoff.';
