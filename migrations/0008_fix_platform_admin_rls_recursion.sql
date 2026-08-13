create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.platform_admin = true
  )
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

comment on function public.is_platform_admin() is
  'RLS-safe platform admin check. SECURITY DEFINER prevents recursive profiles RLS evaluation while binding identity to auth.uid().';
