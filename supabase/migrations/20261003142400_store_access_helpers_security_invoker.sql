-- EKODI RLS helper privilege hardening.
-- These helpers inspect auth.uid()-scoped membership and do not need elevated execution.
-- Production already uses SECURITY INVOKER semantics; this migration makes the repository
-- and ephemeral Supabase baseline converge on that least-privilege state.

alter function public.has_store_access(uuid) security invoker;
alter function public.has_store_private_access(uuid) security invoker;
alter function public.has_tenant_access(uuid) security invoker;

revoke all on function public.has_store_access(uuid) from public, anon;
revoke all on function public.has_store_private_access(uuid) from public, anon;
revoke all on function public.has_tenant_access(uuid) from public, anon;

grant execute on function public.has_store_access(uuid) to authenticated, service_role;
grant execute on function public.has_store_private_access(uuid) to authenticated, service_role;
grant execute on function public.has_tenant_access(uuid) to authenticated, service_role;

comment on function public.has_store_access(uuid) is
  'SECURITY INVOKER RLS helper. Evaluates auth.uid()-scoped store access without elevated privileges.';
comment on function public.has_store_private_access(uuid) is
  'SECURITY INVOKER RLS helper. Evaluates auth.uid()-scoped private store access; anonymous direct execution is forbidden.';
comment on function public.has_tenant_access(uuid) is
  'SECURITY INVOKER RLS helper. Evaluates auth.uid()-scoped tenant access without elevated privileges.';
