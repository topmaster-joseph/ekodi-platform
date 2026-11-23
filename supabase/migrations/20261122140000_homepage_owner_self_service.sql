-- 홈페이지 구독: 로그인 계정 권한 기반 셀프서비스.
-- 신청자 본인(로그인 이메일 = 신청 이메일)은 사용자 페이지(ekodi.kr/homepage)에서 자기 신청·사이트를 보고
-- 홈페이지 내용(제목·소개·전화·주소·시간·링크)을 직접 고친다. 플랫폼 관리자는 같은 화면에서 모든 신청을 본다.
-- 공개/비공개 전환은 기존 homepage_subscription_publish(관리자 전용)를 그대로 쓴다.

create or replace function public.homepage_viewer_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(coalesce(auth.jwt()->>'email','')),'')
$$;

create or replace function public.homepage_my_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_email text := public.homepage_viewer_email(); v_admin boolean := public.homepage_subscription_is_admin();
begin
  if v_email is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  return jsonb_build_object('ok',true,'email',v_email,'is_admin',v_admin,'requests',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id,r.created_at,r.mode,r.audience,r.plan,r.contract,r.monthly_estimate,r.display_name,r.status,r.site_slug,
             s.published,s.headline,s.intro,s.phone,s.address,s.hours,s.links,s.updated_at
      from public.homepage_subscription_requests r
      left join public.homepage_sites s on s.request_id=r.id
      where lower(r.email)=v_email
      order by r.created_at desc limit 50
    ) x),'[]'::jsonb));
end
$$;

create or replace function public.homepage_site_owner_update(p_slug text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_email text := public.homepage_viewer_email();
  v_owner text;
  v_headline text := nullif(left(trim(coalesce(p->>'headline','')),120),'');
  v_intro text := nullif(left(trim(coalesce(p->>'intro','')),1200),'');
  v_phone text := nullif(left(trim(coalesce(p->>'phone','')),20),'');
  v_address text := nullif(left(trim(coalesce(p->>'address','')),200),'');
  v_hours text := nullif(left(trim(coalesce(p->>'hours','')),200),'');
  v_links jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if v_email is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  select lower(r.email) into v_owner from public.homepage_sites s join public.homepage_subscription_requests r on r.id=s.request_id where s.slug=v_slug;
  if v_owner is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_owner <> v_email and not public.homepage_subscription_is_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if v_phone is not null and v_phone !~ '^[0-9+\-\s()]{8,20}$' then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;
  if jsonb_typeof(p->'links')='array' then
    for v_item in select value from jsonb_array_elements(p->'links') limit 8 loop
      if coalesce(v_item->>'url','') ~ '^https://[^\s<>"]+$' and char_length(v_item->>'url') <= 300 and char_length(trim(coalesce(v_item->>'label',''))) between 1 and 40 then
        v_links := v_links || jsonb_build_array(jsonb_build_object('label',trim(v_item->>'label'),'url',v_item->>'url'));
      end if;
    end loop;
  end if;
  update public.homepage_sites set headline=v_headline, intro=v_intro, phone=v_phone, address=v_address, hours=v_hours, links=v_links, updated_at=now()
  where slug=v_slug;
  return jsonb_build_object('ok',true,'slug',v_slug,'updated_at',now());
end
$$;

revoke all on function public.homepage_viewer_email() from public;
revoke all on function public.homepage_my_requests() from public;
revoke all on function public.homepage_site_owner_update(text, jsonb) from public;
grant execute on function public.homepage_viewer_email() to authenticated;
grant execute on function public.homepage_my_requests() to authenticated;
grant execute on function public.homepage_site_owner_update(text, jsonb) to authenticated;
