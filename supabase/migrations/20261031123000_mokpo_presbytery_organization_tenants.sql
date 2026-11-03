-- Mokpo Presbytery (목포노회) and its Mission Department (선교부) join the shared,
-- tenant-scoped organization engine already used by Hammu (20260914095000).
-- Additive only: two tenant rows, tenant-local admin delegation, profile, term,
-- office rules and the two officers the user stated. No member roster, no
-- personal contact data, no finance entries. Re-runnable (on conflict).
-- Rollback: delete from public.tenants where slug in ('mokpo-presbytery','mokpo-mission');
--   (organization_* rows cascade; site_access_registry rows for these site_keys can be
--    deactivated with status='inactive').

insert into public.tenants(slug,name,status,kind,settings) values
  ('mokpo-presbytery','목포노회','active','association',jsonb_build_object('ownership','customer','operating_model','customer-site','site_key','mokpo-presbytery','canonical_path','/mokpo-presbytery','admin_path','/mokpo-presbytery/admin','organization_engine','v1','organization_level','presbytery','pilot_label','EKODI 기반 목포노회 업무지원 시범 공간')),
  ('mokpo-mission','목포노회 선교부','active','association',jsonb_build_object('ownership','customer','operating_model','customer-site','site_key','mokpo-mission','canonical_path','/mokpo-presbytery/mission','admin_path','/mokpo-presbytery/mission/admin','organization_engine','v1','organization_level','department','parent_slug','mokpo-presbytery','pilot_label','EKODI 기반 목포노회 업무지원 시범 공간'))
on conflict (slug) do update set name=excluded.name,status='active',kind=excluded.kind,settings=coalesce(public.tenants.settings,'{}'::jsonb)||excluded.settings;

-- One-time explicit delegation from the existing platform-admin identity into each tenant,
-- mirroring the Hammu bootstrap. No implicit platform->tenant inheritance is created.
with orgs as (select id,slug from public.tenants where slug in ('mokpo-presbytery','mokpo-mission')), delegated as (
  select distinct lower(email) email from public.site_access_registry where site_key='admin' and role='platform_admin'::public.app_role and status='active'
)
insert into public.site_access_registry(email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
select d.email,o.slug,o.id,'tenant_admin'::public.app_role,'active','explicit_user_delegation_mokpo_presbytery_20261031','Tenant-local bootstrap delegated by the user for Mokpo Presbytery operations; no platform authority inheritance.','standard',now(),now() from delegated d cross join orgs o
on conflict(email,site_key,tenant_id,role) do update set status='active',source=excluded.source,note=excluded.note,updated_at=now();

with orgs as (select id,slug from public.tenants where slug in ('mokpo-presbytery','mokpo-mission')), delegated as (
  select distinct lower(r.email) email,o.id tenant_id from public.site_access_registry r join orgs o on o.slug=r.site_key where r.role='tenant_admin'::public.app_role and r.status='active'
), identities as (
  select distinct li.auth_user_id,d.tenant_id from public.login_identities li join delegated d on lower(li.email)=d.email where li.status='active'
)
insert into public.tenant_members(tenant_id,user_id,role,status)
select i.tenant_id,i.auth_user_id,'tenant_admin'::public.app_role,'active' from identities i
on conflict(tenant_id,user_id,role) do update set status='active';

-- Profiles stay in review: the dedicated static pages remain the public face until
-- the presbytery approves official operation.
with o as (select id,slug from public.tenants where slug in ('mokpo-presbytery','mokpo-mission'))
insert into public.organization_profiles(tenant_id,organization_type,tagline,description,public_status,show_finance,show_attendance,updated_at)
select id,
  case when slug='mokpo-mission' then 'department' else 'presbytery' end,
  case when slug='mokpo-mission' then '함께 세우는 선교, 지역과 교회를 잇는 동행' else '함께 섬기는 목포노회' end,
  'EKODI 기반 목포노회 업무지원 시범 공간입니다. 공식 노회 홈페이지가 아닙니다.',
  'review',false,false,now()
from o
on conflict(tenant_id) do update set organization_type=excluded.organization_type,tagline=excluded.tagline,description=excluded.description,updated_at=now();

-- Term: from the 2026 autumn presbytery (제135회, 2026-10-20) to the 2027 autumn presbytery.
with o as (select id from public.tenants where slug in ('mokpo-presbytery','mokpo-mission'))
insert into public.organization_terms(tenant_id,label,starts_on,ends_on,status)
select id,'2026-2027 회기','2026-10-20','2027-10-31','current' from o
on conflict(tenant_id,label) do update set status='current',starts_on=excluded.starts_on,ends_on=excluded.ends_on;

with o as (select id from public.tenants where slug='mokpo-mission'),
rules(office_key,office_label,sort_order) as (values ('chair','부장',10),('secretary','서기',20),('treasurer','회계',30))
insert into public.organization_office_rules(tenant_id,office_key,office_label,sort_order,succession_from_office_key,auto_success,active)
select o.id,r.office_key,r.office_label,r.sort_order,null,false,true from o cross join rules r
on conflict(tenant_id,office_key) do update set office_label=excluded.office_label,sort_order=excluded.sort_order,active=true;

with o as (select id from public.tenants where slug='mokpo-presbytery'),
rules(office_key,office_label,sort_order) as (values ('moderator','노회장',10),('vice_moderator','부노회장',20),('clerk','서기',30),('recording_clerk','회록서기',40),('treasurer','회계',50))
insert into public.organization_office_rules(tenant_id,office_key,office_label,sort_order,succession_from_office_key,auto_success,active)
select o.id,r.office_key,r.office_label,r.sort_order,null,false,true from o cross join rules r
on conflict(tenant_id,office_key) do update set office_label=excluded.office_label,sort_order=excluded.sort_order,active=true;

-- Mission officers as stated by the user (선교부장 김찬구 목사·안좌대리교회, 서기 정찬균 목사·에코디교회).
with t as (select o.id tenant_id,tm.id term_id from public.tenants o join public.organization_terms tm on tm.tenant_id=o.id and tm.label='2026-2027 회기' where o.slug='mokpo-mission'),
officers(office_key,church_name,person_name) as (values ('chair','안좌대리교회','김찬구'),('secretary','에코디교회','정찬균'))
insert into public.organization_officers(tenant_id,term_id,office_key,church_name,person_name,source,locked)
select t.tenant_id,t.term_id,f.office_key,f.church_name,f.person_name,'manual',true from t cross join officers f
on conflict(term_id,office_key) do nothing;
