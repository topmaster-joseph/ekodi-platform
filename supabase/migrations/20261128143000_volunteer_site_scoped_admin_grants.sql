-- EKODI Volunteer site-only administrators.
-- Deliberately separate from tenant_members and current_site_activity_contexts:
-- a volunteer administrator must not become an EKODI Mission tenant administrator.
-- Never seed a named user in a publicly versioned migration.
create table if not exists public.volunteer_site_admin_grants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'site_admin' check (role='site_admin'),
 status text not null default 'active' check (status in ('active','revoked')),
 source text not null default 'ekodi-orchestrator',
 granted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 note text
);
alter table public.volunteer_site_admin_grants enable row level security;
revoke all on table public.volunteer_site_admin_grants from public,anon,authenticated;
grant all on table public.volunteer_site_admin_grants to service_role;

create table if not exists public.volunteer_site_admin_audit (
 id bigint generated always as identity primary key,
 grantee_user_id uuid not null references auth.users(id) on delete cascade,
 action text not null check (action in ('grant','revoke','reconfirm')),
 origin text not null,
 actor_user_id uuid references auth.users(id) on delete set null,
 occurred_at timestamptz not null default now()
);
alter table public.volunteer_site_admin_audit enable row level security;
revoke all on table public.volunteer_site_admin_audit from public,anon,authenticated;
grant all on table public.volunteer_site_admin_audit to service_role;
grant all on sequence public.volunteer_site_admin_audit_id_seq to service_role;

create or replace function public.volunteer_is_site_admin()
returns boolean
language sql stable security definer
set search_path=public,auth,pg_temp
as $fn$
 select auth.uid() is not null and exists(
  select 1 from public.volunteer_site_admin_grants g
  where g.user_id=auth.uid() and g.role='site_admin' and g.status='active'
 );
$fn$;
revoke all on function public.volunteer_is_site_admin() from public,anon,authenticated;
grant execute on function public.volunteer_is_site_admin() to service_role;

-- Avoid activity_admin_snapshot: it can reveal non-volunteer activities when
-- called with a null key. This dedicated RPC requires an actual volunteer
-- campaign and returns only information needed by the Volunteer admin UI.
create or replace function public.volunteer_admin_registration_snapshot(
 p_workspace_slug text,p_activity_key text
)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v_activity public.activities%rowtype;
 v_tenant public.tenants%rowtype;
 v_rows jsonb;
begin
 select a.* into v_activity
 from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
 where t.slug=lower(trim(p_workspace_slug))
  and a.activity_key=p_activity_key
  and a.activity_type='volunteer'
 limit 1;
 if not found then raise exception 'VOLUNTEER_NOT_FOUND'; end if;
 if auth.uid() is null or not (
    public.volunteer_is_site_admin()
    or public.activity_is_workspace_operator(v_activity.workspace_tenant_id)
 ) then
  raise exception 'VOLUNTEER_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 select * into v_tenant from public.tenants where id=v_activity.workspace_tenant_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'participation_id',p.id,
  'name',pe.display_name,
  'phone',(select c.value from public.person_contacts c
    where c.person_id=pe.id and c.kind='phone'
    order by c.is_primary desc,c.created_at limit 1),
  'party_size',p.party_size,
  'status',p.status,
  'submitted_at',p.submitted_at
 ) order by p.submitted_at desc),'[]'::jsonb)
 into v_rows
 from public.activity_participations p
 join public.people pe on pe.id=p.person_id
 where p.activity_id=v_activity.id;
 return jsonb_build_object(
  'ok',true,
  'workspace',jsonb_build_object('slug',v_tenant.slug),
  'participants',v_rows
 );
end $fn$;
revoke all on function public.volunteer_admin_registration_snapshot(text,text) from public,anon,authenticated;
grant execute on function public.volunteer_admin_registration_snapshot(text,text) to authenticated,service_role;

-- Existing tenant-local administrators keep all previously approved access.
-- Volunteer-only site admins get the pledged donations for volunteer
-- activities, not the broader EKODI Mission workspace.
create or replace function public.volunteer_pledge_admin_snapshot(
 p_workspace_slug text,p_activity_key text
)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v_activity public.activities%rowtype;
 v_allowed boolean;
 v_rows jsonb;
begin
 select a.* into v_activity
 from public.activities a join public.tenants t on t.id=a.workspace_tenant_id
 where t.slug=lower(trim(p_workspace_slug))
  and a.activity_key=p_activity_key
  and a.activity_type='volunteer';
 if not found then raise exception 'VOLUNTEER_NOT_FOUND';end if;
 select exists(
  select 1 from jsonb_array_elements(public.current_site_activity_contexts()) x
  where x->>'tenant'=lower(trim(p_workspace_slug))
   and x->>'authorization_role' in ('tenant_admin','store_owner')
 ) or public.volunteer_is_site_admin()
 into v_allowed;
 if auth.uid() is null or not v_allowed then
  raise exception 'VOLUNTEER_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',v.id,'name',pe.display_name,'bricks',v.bricks,
  'amount_krw',v.amount_krw,'status',v.status,
  'created_at',v.created_at,'confirmed_at',v.confirmed_at
 ) order by v.created_at desc),'[]'::jsonb)
 into v_rows
 from public.volunteer_pledges v join public.people pe on pe.id=v.person_id
 where v.activity_id=v_activity.id;
 return jsonb_build_object('ok',true,'pledges',v_rows);
end $fn$;
revoke all on function public.volunteer_pledge_admin_snapshot(text,text) from public,anon;
grant execute on function public.volunteer_pledge_admin_snapshot(text,text) to authenticated,service_role;

create or replace function public.volunteer_pledge_admin_confirm(p_pledge_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v public.volunteer_pledges%rowtype;
 v_activity public.activities%rowtype;
 v_slug text;
 v_allowed boolean;
 v_old jsonb;
begin
 select * into v from public.volunteer_pledges where id=p_pledge_id for update;
 if not found then raise exception 'VOLUNTEER_PLEDGE_NOT_FOUND';end if;
 select a.* into v_activity from public.activities a where a.id=v.activity_id;
 if v_activity.activity_type is distinct from 'volunteer' then
  raise exception 'VOLUNTEER_NOT_FOUND';end if;
 select t.slug into v_slug from public.tenants t where t.id=v_activity.workspace_tenant_id;
 select exists(
  select 1 from jsonb_array_elements(public.current_site_activity_contexts()) x
  where x->>'tenant'=v_slug
   and x->>'authorization_role' in ('tenant_admin','store_owner')
 ) or public.volunteer_is_site_admin()
 into v_allowed;
 if auth.uid() is null or not v_allowed then
  raise exception 'VOLUNTEER_ADMIN_FORBIDDEN' using errcode='42501';
 end if;
 if v.status='cancelled' then raise exception 'CANCELLED_PLEDGE';end if;
 if v.status='confirmed' then
  return jsonb_build_object('ok',true,'id',v.id,'status','confirmed');
 end if;
 v_old:=to_jsonb(v);
 update public.volunteer_pledges
 set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now()
 where id=v.id returning * into v;
 insert into public.volunteer_pledge_audit(
  pledge_id,actor_id,action,before_record,after_record
 ) values(v.id,auth.uid(),'payment_manually_confirmed',v_old,to_jsonb(v));
 return jsonb_build_object('ok',true,'id',v.id,'status',v.status);
end $fn$;
revoke all on function public.volunteer_pledge_admin_confirm(uuid) from public,anon;
grant execute on function public.volunteer_pledge_admin_confirm(uuid) to authenticated,service_role;

comment on table public.volunteer_site_admin_grants is
 'Volunteer site-only admin role; never provides EKODI Mission tenant, platform or other site admin rights.';
comment on table public.volunteer_site_admin_audit is
 'Audit trail for explicit volunteer-site permission grants and revocations.';
