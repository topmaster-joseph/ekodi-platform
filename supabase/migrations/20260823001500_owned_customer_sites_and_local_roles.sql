-- EKODI-owned operating organizations are first-class customer tenants.
-- Platform-global admin authority remains separate from tenant-local activity roles.

insert into public.tenants (slug, name, status, kind, settings)
values
  ('ekodi-church', '에코디교회', 'active', 'church', jsonb_build_object('ownership','ekodi','operating_model','customer-site','site_key','church','domain','church.ekodi.kr','default_activity_role','pastor','default_activity_role_label','목사')),
  ('ekodi-biz', '에코디비즈', 'active', 'business', jsonb_build_object('ownership','ekodi','operating_model','customer-site','site_key','biz','domain','biz.ekodi.kr','default_activity_role','representative','default_activity_role_label','대표')),
  ('ekodi-lab', '에코디연구소', 'active', 'organization', jsonb_build_object('ownership','ekodi','operating_model','customer-site','site_key','lab','domain','lab.ekodi.kr','default_activity_role','director','default_activity_role_label','연구소장')),
  ('ekodi-trade', 'EKODI Global Trading', 'active', 'business', jsonb_build_object('ownership','ekodi','operating_model','customer-site','site_key','trade','domain','trade.ekodi.kr','default_activity_role','representative','default_activity_role_label','대표')),
  ('ekodi-cafe', '에코디 카페', 'active', 'business', jsonb_build_object('ownership','ekodi','operating_model','customer-site','site_key','cafe','domain','cafe.ekodi.kr','default_activity_role','representative','default_activity_role_label','대표'))
on conflict (slug) do update
set name = excluded.name,
    status = 'active',
    kind = excluded.kind,
    settings = coalesce(public.tenants.settings, '{}'::jsonb) || excluded.settings;

with admin_source as (
  select distinct lower(email) as email
    from public.site_access_registry
   where site_key = 'admin'
     and role = 'platform_admin'::public.app_role
     and status = 'active'
     and source = 'existing_platform_admin'
),
owned(site_key, tenant_slug, activity_role, activity_role_label) as (
  values
    ('church','ekodi-church','pastor','목사'),
    ('biz','ekodi-biz','representative','대표'),
    ('lab','ekodi-lab','director','연구소장'),
    ('trade','ekodi-trade','representative','대표'),
    ('cafe','ekodi-cafe','representative','대표')
)
insert into public.site_access_registry
  (email, site_key, tenant_id, role, status, source, note, plan, created_at, updated_at)
select
  a.email,
  o.site_key,
  t.id,
  'tenant_admin'::public.app_role,
  'active',
  'owned_site_local_role',
  'Local activity role: ' || o.activity_role || ' (' || o.activity_role_label || ')',
  'standard',
  now(),
  now()
from admin_source a
cross join owned o
join public.tenants t on t.slug = o.tenant_slug
on conflict (email, site_key, tenant_id, role) do update
set status = 'active',
    source = excluded.source,
    note = excluded.note,
    plan = excluded.plan,
    updated_at = now();

create or replace function public.current_site_activity_contexts()
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
      r.site_key,
      r.tenant_id,
      r.role::text as authorization_role,
      t.slug as tenant_slug,
      t.name as tenant_name,
      t.kind as tenant_kind,
      t.settings,
      row_number() over (
        partition by r.site_key, r.tenant_id
        order by
          case r.status when 'active' then 0 else 1 end,
          case r.role::text
            when 'tenant_admin' then 0
            when 'store_owner' then 1
            when 'store_staff' then 2
            when 'member' then 3
            else 4
          end,
          r.created_at
      ) as rn
    from public.site_access_registry r
    join identity_scope i on lower(r.email) = i.email
    join public.tenants t on t.id = r.tenant_id
   where r.status in ('pre_registered','active')
     and coalesce(t.settings->>'operating_model','') = 'customer-site'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_key', 'tenant:' || tenant_id::text,
    'site', site_key,
    'tenant_id', tenant_id,
    'tenant', tenant_slug,
    'workspace_name', tenant_name,
    'workspace_kind', tenant_kind,
    'authorization_role', authorization_role,
    'activity_role', coalesce(nullif(settings->>'default_activity_role',''), authorization_role),
    'activity_role_label', coalesce(nullif(settings->>'default_activity_role_label',''), authorization_role),
    'authority_scope', 'tenant',
    'platform_admin_active', false,
    'operating_model', coalesce(settings->>'operating_model','customer-site')
  ) order by tenant_name, site_key), '[]'::jsonb)
    into v_result
    from ranked
   where rn = 1;

  return v_result;
end
$$;

revoke all on function public.current_site_activity_contexts() from public;
grant execute on function public.current_site_activity_contexts() to authenticated;
