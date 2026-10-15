-- Hardening follow-up for the online Education RLS migration.
-- Hide privileged site-access registry reads behind an unexposed schema.
-- The Data API can invoke only the narrow, security-invoker public wrapper.
create schema if not exists education_private;
revoke all on schema education_private from public, anon;
grant usage on schema education_private to authenticated;

create or replace function education_private.actor_role()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case
    when auth.uid() is null then 'learner'
    when exists (
      select 1 from public.site_access_registry r
       where r.status='active'
         and r.site_key='admin'
         and r.role::text='platform_admin'
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    ) then 'admin'
    when exists (
      select 1 from public.site_access_registry r
       where r.status='active'
         and r.site_key='edu'
         and r.role::text in ('tenant_admin','store_owner','store_staff')
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    ) then 'instructor'
    else 'learner'
  end
$$;
revoke all on function education_private.actor_role() from public, anon;
grant execute on function education_private.actor_role() to authenticated;

-- The old public function existed in an interim migration; replace it rather
-- than leaving public SECURITY DEFINER authority in the exposed API schema.
create or replace function public.education_actor_role()
returns text
language sql
stable
security invoker
set search_path = public, education_private, pg_temp
as $$
  select education_private.actor_role()
$$;
revoke all on function public.education_actor_role() from public, anon;
grant execute on function public.education_actor_role() to authenticated;

-- The RLS policy predicates continue calling public.education_actor_role().
-- No service-role key, user metadata, privileged data or write API is exposed.
