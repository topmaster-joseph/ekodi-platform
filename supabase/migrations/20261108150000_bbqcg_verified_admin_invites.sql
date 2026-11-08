-- BBQCG administrator roster approved by customer.
-- Main accounts: existing verified EKODI highest administrators. Dedicated email: invitation only,
-- and zero authorization before real email confirmation in Supabase Auth.
-- This security migration also closes the existing preregistration-before-verification path.
begin;

create or replace function public.apply_preregistered_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $bbq_prereg_guard$
declare
  v_email text;
  r record;
begin
  -- Require server-owned proof of email confirmation, never mutable user_metadata or an
  -- unverified auth.users.email value. Auth trigger invokes this only at signup/confirmation.
  select lower(email) into v_email
    from auth.users
   where id = p_user_id
     and email_confirmed_at is not null
     and coalesce(is_anonymous, false) = false;
  if v_email is null then return; end if;

  insert into public.profiles(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  for r in
    select * from public.site_access_registry
     where lower(email)=v_email and status in ('pre_registered','active')
  loop
    if r.site_key='admin' or r.role='platform_admin' then
      update public.profiles set platform_admin=true where user_id=p_user_id;
    end if;
    if r.tenant_id is not null then
      insert into public.tenant_members(tenant_id,user_id,role,status)
      values(r.tenant_id,p_user_id,r.role,'active')
      on conflict(tenant_id,user_id,role) do update set status='active';
    end if;
    update public.site_access_registry
       set status='active',updated_at=now()
     where id=r.id and status='pre_registered';
  end loop;
exception when others then
  raise warning 'apply_preregistered_access verified user processing failed for %: %',p_user_id,sqlerrm;
end
$bbq_prereg_guard$;

-- Some DEV schema snapshots do not yet contain this historical auth trigger helper.
-- Install the same guarded, existing forwarding contract in both projects.
create or replace function public.handle_auth_user_access()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $bbq_auth_bridge$
begin
  perform public.apply_preregistered_access(new.id);
  return new;
exception when others then
  raise warning 'handle_auth_user_access failed for %: %',new.id,sqlerrm;
  return new;
end
$bbq_auth_bridge$;

-- Executed by trusted database triggers/management only, never as an open Data API RPC.
revoke all on function public.apply_preregistered_access(uuid) from public, anon, authenticated;
revoke all on function public.handle_auth_user_access() from public, anon, authenticated;

-- An unverified signup is ineligible. Email confirmation updates must re-run
-- the guard so the pending (site-scoped) role becomes active only after verification.
drop trigger if exists on_auth_user_access on auth.users;
create trigger on_auth_user_access
after insert or update of email,email_confirmed_at on auth.users
for each row execute function public.handle_auth_user_access();

do $bbq_admin_grant$
declare
  v_tenant uuid;
  v_store uuid;
  v_count int;
  v_owner text;
begin
  select t.id,s.id,t.settings->>'ownership'
    into v_tenant,v_store,v_owner
    from public.tenants t
    join public.stores s on s.tenant_id=t.id
   where t.slug='bbqcg' and t.name='BBQ 무안청계점'
     and t.kind='business' and t.status='active'
     and t.settings->>'site_key'='bbqcg'
     and s.slug='bbq-muan-cheonggye'
     and s.operating_space_slug='bbqcg'
     and s.name='BBQ 무안청계점'
   for update of t,s;
  if v_tenant is null or v_store is null or v_owner <> 'customer' then
    raise exception 'BBQCG identity or owner mismatch: refuse access mutation';
  end if;
  if to_regclass('private.admin_bootstrap_allowlist') is not null then
    if exists(
      select 1 from private.admin_bootstrap_allowlist a
       where lower(a.email)='bbqmuancg@gmail.com'
    ) then
      raise exception 'BBQCG email already in legacy unverified bootstrap allowlist';
    end if;
  end if;
  if exists(
    select 1 from public.site_access_registry r
     where r.tenant_id=v_tenant and r.site_key='bbqcg'
       and r.email not in ('topmaster.joseph@gmail.com','joseph@ekodi.kr','bbqmuancg@gmail.com')
       and r.status in ('active','pre_registered')
       and r.role::text in ('tenant_admin','platform_admin','store_owner')
  ) then
    raise exception 'BBQCG contains an unexpected administrator: manual reconciliation required';
  end if;

  -- Existing platform-wide administrators receive a distinct *tenant-local*
  -- administrator role ONLY for this BBQ tenant, never platform_admin here.
  insert into public.tenant_members(tenant_id,user_id,role,status)
  select v_tenant,u.id,'tenant_admin'::public.app_role,'active'
    from auth.users u
    join public.profiles p on p.user_id=u.id
   where lower(u.email) in ('topmaster.joseph@gmail.com','joseph@ekodi.kr')
     and u.email_confirmed_at is not null
     and p.platform_admin=true
  on conflict(tenant_id,user_id,role) do update set status='active';

  insert into public.site_access_registry(
    email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at
  )
  select lower(u.email),'bbqcg',v_tenant,'tenant_admin'::public.app_role,
    'active','bbqcg_owner_approved_operator_20261108',
    'Verified existing EKODI highest admin; explicit tenant-local delegation',
    'standard',now(),now()
    from auth.users u
    join public.profiles p on p.user_id=u.id
   where lower(u.email) in ('topmaster.joseph@gmail.com','joseph@ekodi.kr')
     and u.email_confirmed_at is not null
     and p.platform_admin=true
  on conflict(email,site_key,tenant_id,role) do update
     set status='active',updated_at=now(),
         source=excluded.source,note=excluded.note;

  -- No identity is invented here. Reserve ONLY this site's admin delegation.
  -- The verified-only auth trigger later promotes this specific user after signup.
  insert into public.site_access_registry(
    email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at
  )
  values(
    'bbqmuancg@gmail.com','bbqcg',v_tenant,'tenant_admin'::public.app_role,
    'pre_registered','bbqcg_owner_approved_operator_20261108',
    'Pending email ownership verification; not a Gmail account or active sign-in',
    'standard',now(),now()
  )
  on conflict(email,site_key,tenant_id,role) do update
     set status=case when exists(
       select 1 from auth.users u
       where lower(u.email)='bbqmuancg@gmail.com'
         and u.email_confirmed_at is not null
     ) then 'active' else 'pre_registered' end,
         updated_at=now(),source=excluded.source,note=excluded.note;

  -- Already verified user (unusual, but safe if signup races deploy): claim now.
  perform public.apply_preregistered_access(u.id)
  from auth.users u
  where lower(u.email)='bbqmuancg@gmail.com' and u.email_confirmed_at is not null;

  if exists(
    select 1 from public.tenant_members m
    join auth.users u on u.id=m.user_id
   where m.tenant_id=v_tenant and lower(u.email)='bbqmuancg@gmail.com'
     and u.email_confirmed_at is null
  ) then raise exception 'BBQCG unverified identity was granted a tenant membership'; end if;

  select count(*) into v_count
  from public.site_access_registry
  where tenant_id=v_tenant and site_key='bbqcg'
    and email in ('topmaster.joseph@gmail.com','joseph@ekodi.kr','bbqmuancg@gmail.com')
    and role='tenant_admin';
  if v_count<1 then raise exception 'BBQCG administrator roster persistence failed'; end if;
end
$bbq_admin_grant$;
commit;
