-- EKODI store/tenant RLS helper hardening.
-- These boolean helpers must bypass recursive membership-table RLS to evaluate auth.uid(),
-- but they are not public RPCs. Keep SECURITY DEFINER and restrict EXECUTE to authenticated
-- and service roles only.

alter function public.has_store_access(uuid) security definer;
alter function public.has_store_private_access(uuid) security definer;
alter function public.has_tenant_access(uuid) security definer;

revoke all on function public.has_store_access(uuid) from public, anon;
revoke all on function public.has_store_private_access(uuid) from public, anon;
revoke all on function public.has_tenant_access(uuid) from public, anon;

grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_private_access(uuid) to authenticated, service_role;
grant execute on function public.has_tenant_access(uuid) to authenticated, service_role;

comment on function public.has_store_access(uuid) is
  'Intentional authenticated SECURITY DEFINER RLS predicate. Returns only an auth.uid()-scoped store-access boolean; anonymous execution is forbidden.';
comment on function public.has_store_private_access(uuid) is
  'Intentional authenticated SECURITY DEFINER RLS predicate. Returns only an auth.uid()-scoped private-store-access boolean; anonymous execution is forbidden.';
comment on function public.has_tenant_access(uuid) is
  'Intentional authenticated SECURITY DEFINER RLS predicate. Returns only an auth.uid()-scoped tenant-access boolean; anonymous execution is forbidden.';
