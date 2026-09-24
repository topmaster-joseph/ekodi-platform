-- Register Brotherly Love Association as an independent EKODI customer site.
-- Tenant-local authority only; no platform-admin inheritance is implied.
-- The public homepage currently uses the code-level organization projection fallback,
-- while administration stays on the standard workspace admin surface.

insert into public.tenants(slug,name,status,kind,settings)
values (
  'bnslove',
  '형제사랑회',
  'active',
  'association',
  jsonb_build_object(
    'ownership','customer',
    'operating_model','customer-site',
    'site_key','bnslove',
    'canonical_path','/bnslove',
    'admin_path','/bnslove/admin',
    'default_activity_role','association_admin',
    'default_activity_role_label','형제사랑회 관리자'
  )
)
on conflict (slug) do update
set name=excluded.name,
    status='active',
    kind=excluded.kind,
    settings=coalesce(public.tenants.settings,'{}'::jsonb)||excluded.settings;

with site as (
  select id from public.tenants where slug='bnslove'
)
insert into public.site_access_registry
  (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
select
  'bnslove6510@gmail.com',
  'bnslove',
  site.id,
  'tenant_admin'::public.app_role,
  'active',
  'bnslove_site_admin_registry',
  '형제사랑회 사이트 관리자',
  'standard',
  now(),
  now()
from site
on conflict (email,site_key,tenant_id,role) do update
set status='active',
    source=excluded.source,
    note=excluded.note,
    plan=excluded.plan,
    updated_at=now();

with site as (
  select id from public.tenants where slug='bnslove'
), identity as (
  select distinct li.auth_user_id
  from public.login_identities li
  where lower(li.email)='bnslove6510@gmail.com'
    and li.status='active'
)
insert into public.tenant_members(tenant_id,user_id,role,status)
select site.id, identity.auth_user_id, 'tenant_admin'::public.app_role, 'active'
from site cross join identity
on conflict(tenant_id,user_id,role) do update set status='active';
