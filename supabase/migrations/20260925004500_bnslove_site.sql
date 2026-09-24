-- Register Brotherly Love Association as an independent EKODI customer site.
-- Tenant-local authority only; no platform-admin inheritance is implied.

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
    'organization_engine','v1',
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

with site as (
  select id from public.tenants where slug='bnslove'
)
insert into public.organization_profiles
  (tenant_id,organization_type,tagline,description,public_status,show_finance,show_attendance,updated_at)
select
  site.id,
  'association',
  '서로 사랑하고, 함께 나누는 공동체',
  '형제사랑회의 소식과 모임, 임원 및 주요 활동을 한곳에서 확인합니다.',
  'published',
  true,
  true,
  now()
from site
on conflict(tenant_id) do update
set organization_type=excluded.organization_type,
    tagline=excluded.tagline,
    description=excluded.description,
    public_status='published',
    show_finance=true,
    show_attendance=true,
    updated_at=now();

with site as (
  select id from public.tenants where slug='bnslove'
)
insert into public.organization_terms(tenant_id,label,starts_on,ends_on,status)
select site.id,'2026 회기','2026-01-01','2026-12-31','current'
from site
on conflict(tenant_id,label) do update
set starts_on=excluded.starts_on,
    ends_on=excluded.ends_on,
    status='current';

with site as (
  select id from public.tenants where slug='bnslove'
), rules(office_key,office_label,sort_order) as (
  values
    ('chair','회장',10),
    ('vice_chair','부회장',20),
    ('secretary','총무',30),
    ('treasurer','회계',40)
)
insert into public.organization_office_rules
  (tenant_id,office_key,office_label,sort_order,succession_from_office_key,auto_success,active)
select site.id,r.office_key,r.office_label,r.sort_order,null,false,true
from site cross join rules r
on conflict(tenant_id,office_key) do update
set office_label=excluded.office_label,
    sort_order=excluded.sort_order,
    succession_from_office_key=null,
    auto_success=false,
    active=true;
