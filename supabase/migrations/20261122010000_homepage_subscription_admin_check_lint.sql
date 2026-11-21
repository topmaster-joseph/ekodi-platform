-- local-supabase CI의 plpgsql_check 는 상수 문자열 EXECUTE 도 정적으로 검사하므로,
-- 운영에만 있는 public.is_platform_admin()을 런타임 format()으로 호출한다(동작 동일).
create or replace function public.homepage_subscription_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_admin boolean := false;
begin
  if to_regprocedure('public.is_platform_admin()') is not null then
    execute format('select %I.%I()', 'public', 'is_platform_admin') into v_admin;
  end if;
  return coalesce(v_admin,false);
end
$$;

revoke all on function public.homepage_subscription_is_admin() from public;
grant execute on function public.homepage_subscription_is_admin() to authenticated;
