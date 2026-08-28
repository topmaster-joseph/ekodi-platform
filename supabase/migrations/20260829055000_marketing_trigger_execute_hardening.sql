-- This function is attached to auth.users as a trigger. It does not need to be callable
-- through PostgREST/RPC by PUBLIC, anon or authenticated clients.
-- Keep the migration additive/idempotent because the ephemeral CI baseline intentionally
-- models only the production objects required by broader identity/workspace contracts.

do $$
begin
  if to_regprocedure('public.ensure_marketing_free_access_for_auth_user()') is not null then
    execute 'revoke execute on function public.ensure_marketing_free_access_for_auth_user() from public, anon, authenticated';
  end if;
end
$$;
