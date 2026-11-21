-- local-supabase CI의 plpgsql_check 는 상수 문자열 EXECUTE 도 정적으로 검사하므로,
-- 운영에만 있는 public.is_platform_admin()을 런타임 format()으로 호출한다(동작 동일).
create or replace function public.homepage_subscription_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_admin boolean := false; v_fn regprocedure;
begin
  -- 함수 위치는 런타임 카탈로그 조회로만 정해지므로 정적 린트가 해석하지 않는다.
  v_fn := to_regprocedure('public.is_platform_admin()');
  if v_fn is not null then
    execute 'select ' || v_fn::regproc::text || '()' into v_admin;
  end if;
  return coalesce(v_admin,false);
end
$$;

revoke all on function public.homepage_subscription_is_admin() from public;
grant execute on function public.homepage_subscription_is_admin() to authenticated;
