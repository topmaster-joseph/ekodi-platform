-- Align PROD's private RLS predicate with the tenant-local administrator contract
-- already used by public.can_manage_store_user_site and DEV's public helper.
-- Preserve existing global and direct store-member access; no identity or role grants.
begin;
do $bbqcg_store_access$
begin
  -- Older PROD has a private security-definer helper; DEV instead has a
  -- security-definer public.has_store_private_access that already checks
  -- active tenant_members. Upgrade only the existing private helper.
  if to_regprocedure('private.has_store_private_access(uuid)') is not null then
    execute $statement$
      create or replace function private.has_store_private_access(p_store uuid)
      returns boolean
      language sql stable security definer
      set search_path to 'public', 'private', 'auth', 'pg_catalog'
      as $function$
        select auth.uid() is not null and (
          private.is_platform_admin()
          or exists (
            select 1 from public.store_members sm
             where sm.store_id=p_store and sm.user_id=auth.uid()
          )
          or exists (
            select 1 from public.stores s
            join public.tenant_members tm on tm.tenant_id=s.tenant_id
            where s.id=p_store
              and tm.user_id=auth.uid()
              and tm.status='active'
              and tm.role::text in ('tenant_admin','platform_admin')
          )
        )
      $function$;
    $statement$;
  end if;
end
$bbqcg_store_access$;
commit;
