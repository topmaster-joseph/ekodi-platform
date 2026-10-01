-- Development-only legacy Supabase hardening.
-- Trigger and event-trigger helpers must never be callable through the exposed API roles.
-- RLS helper functions used by public policies are intentionally left unchanged in this migration.

begin;

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
    execute $sql$comment on function public.handle_new_user() is
      'Auth trigger helper. Direct API execution is forbidden; execution occurs only through the auth.users trigger.'$sql$;
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    execute $sql$comment on function public.rls_auto_enable() is
      'DDL event-trigger helper. Direct API execution is forbidden; execution occurs only through the database event trigger.'$sql$;
  end if;
end
$$;

commit;
