-- EKODIBIZ 홈페이지 구독: 신청 접수와 사이트 자동 개설.
-- 바로 구독 신청 → 요청 기록 + https://ekodi.kr/hp-xxxxxxxx 사이트를 자동 생성(비공개 준비 상태).
-- 공개(published)는 첫 결제 확인 또는 플랫폼 관리자 승인으로만 전환한다. 익명 신청이 곧바로 공개 페이지가
-- 되지 않도록 하여 ekodi.kr 이름을 빌린 사칭·피싱 페이지를 막는다.
-- 기존 stores / store_user_sites / storefront 함수는 변경하지 않는다.

create table if not exists public.homepage_subscription_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('consult','subscribe')),
  audience text not null check (audience in ('personal','business','institution','community','organization','event')),
  plan text not null check (plan in ('S1','S2','S3','S4')),
  contract text not null default 'monthly' check (contract in ('monthly','annual')),
  monthly_estimate integer check (monthly_estimate is null or monthly_estimate between 0 and 10000000),
  display_name text not null check (char_length(display_name) between 1 and 80),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+\-\s()]{8,20}$'),
  contact_name text check (contact_name is null or char_length(contact_name) <= 40),
  options jsonb not null default '{}'::jsonb,
  message text check (message is null or char_length(message) <= 3000),
  status text not null default 'received' check (status in ('received','provisioned','published','cancelled')),
  site_slug text unique
);
create index if not exists homepage_subscription_requests_email_idx on public.homepage_subscription_requests(lower(email), created_at desc);
create index if not exists homepage_subscription_requests_created_idx on public.homepage_subscription_requests(created_at desc);

create table if not exists public.homepage_sites (
  slug text primary key check (slug ~ '^hp-[a-z0-9]{8}$'),
  request_id uuid not null references public.homepage_subscription_requests(id) on delete cascade,
  audience text not null,
  plan text not null check (plan in ('S1','S2','S3','S4')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline text check (headline is null or char_length(headline) <= 120),
  intro text check (intro is null or char_length(intro) <= 1200),
  phone text,
  address text check (address is null or char_length(address) <= 200),
  hours text check (hours is null or char_length(hours) <= 200),
  links jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_subscription_requests enable row level security;
alter table public.homepage_sites enable row level security;
revoke all on table public.homepage_subscription_requests from public, anon, authenticated, service_role;
revoke all on table public.homepage_sites from public, anon, authenticated, service_role;

create or replace function public.homepage_subscription_submit(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(nullif(trim(p->>'mode'),''),'consult');
  v_audience text := coalesce(nullif(trim(p->>'audience'),''),'personal');
  v_plan text := coalesce(nullif(trim(p->>'plan'),''),'S1');
  v_contract text := coalesce(nullif(trim(p->>'contract'),''),'monthly');
  v_name text := left(trim(coalesce(p->>'display_name','')),80);
  v_email text := lower(left(trim(coalesce(p->>'email','')),254));
  v_phone text := nullif(left(trim(coalesce(p->>'phone','')),20),'');
  v_contact text := nullif(left(trim(coalesce(p->>'contact_name','')),40),'');
  v_message text := nullif(left(coalesce(p->>'message',''),3000),'');
  v_estimate integer;
  v_id uuid;
  v_slug text;
  v_intro text;
begin
  if coalesce(p->>'website','') <> '' then
    return jsonb_build_object('ok',true,'mode',v_mode,'status','received');
  end if;
  if v_mode not in ('consult','subscribe') then return jsonb_build_object('ok',false,'error','invalid_mode'); end if;
  if v_audience not in ('personal','business','institution','community','organization','event') then return jsonb_build_object('ok',false,'error','invalid_audience'); end if;
  if v_plan not in ('S1','S2','S3','S4') then return jsonb_build_object('ok',false,'error','invalid_plan'); end if;
  if v_contract not in ('monthly','annual') then v_contract := 'monthly'; end if;
  if char_length(v_name) < 1 then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok',false,'error','invalid_email'); end if;
  if v_phone is not null and v_phone !~ '^[0-9+\-\s()]{8,20}$' then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;
  if v_mode = 'subscribe' and v_phone is null then return jsonb_build_object('ok',false,'error','phone_required'); end if;
  if coalesce((p->>'consent')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','consent_required'); end if;
  if v_mode = 'subscribe' and coalesce((p->>'terms')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','terms_required'); end if;
  begin v_estimate := nullif(p->>'monthly_estimate','')::integer; exception when others then v_estimate := null; end;
  if v_estimate is not null and (v_estimate < 0 or v_estimate > 10000000) then v_estimate := null; end if;

  -- 남용 방지: 같은 이메일 하루 3건, 전체 1시간 60건
  if (select count(*) from public.homepage_subscription_requests r where lower(r.email)=v_email and r.created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok',false,'error','rate_limited');
  end if;
  if (select count(*) from public.homepage_subscription_requests r where r.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok',false,'error','busy');
  end if;

  insert into public.homepage_subscription_requests(mode,audience,plan,contract,monthly_estimate,display_name,email,phone,contact_name,options,message)
  values (v_mode,v_audience,v_plan,v_contract,v_estimate,v_name,v_email,v_phone,v_contact,
    coalesce(case when jsonb_typeof(p->'options')='object' then p->'options' end,'{}'::jsonb),v_message)
  returning id into v_id;

  if v_mode = 'subscribe' then
    loop
      v_slug := 'hp-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
      exit when not exists (select 1 from public.homepage_sites s where s.slug=v_slug);
    end loop;
    v_intro := case v_audience
      when 'personal' then '활동과 작품, 연락처를 소개합니다.'
      when 'business' then '상품·서비스와 영업시간, 오시는 길을 안내합니다.'
      when 'institution' then '기관 소개와 사업·교육 안내, 담당 연락처를 안내합니다.'
      when 'community' then '단체의 사명과 모임·활동, 참여 방법을 안내합니다.'
      when 'organization' then '조직 소개와 주요 활동, 담당자 연락처를 안내합니다.'
      else '행사의 목적과 일정·장소, 참여 방법을 안내합니다.' end;
    insert into public.homepage_sites(slug,request_id,audience,plan,display_name,headline,intro,phone)
    values (v_slug,v_id,v_audience,v_plan,v_name,v_name,v_intro,v_phone);
    update public.homepage_subscription_requests set status='provisioned', site_slug=v_slug where id=v_id;
    return jsonb_build_object('ok',true,'mode',v_mode,'request_id',v_id,'status','provisioned',
      'site_slug',v_slug,'site_url','https://ekodi.kr/'||v_slug,'published',false);
  end if;

  return jsonb_build_object('ok',true,'mode',v_mode,'request_id',v_id,'status','received');
end
$$;

create or replace function public.homepage_site_public(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  s public.homepage_sites%rowtype;
begin
  if v_slug !~ '^hp-[a-z0-9]{8}$' then return null; end if;
  select * into s from public.homepage_sites where slug=v_slug;
  if not found then return null; end if;
  if not s.published then
    return jsonb_build_object('slug',s.slug,'published',false);
  end if;
  return jsonb_build_object('slug',s.slug,'published',true,'audience',s.audience,'plan',s.plan,
    'display_name',s.display_name,'headline',s.headline,'intro',s.intro,'phone',s.phone,
    'address',s.address,'hours',s.hours,'links',s.links,'published_at',s.published_at,'updated_at',s.updated_at);
end
$$;

create or replace function public.homepage_subscription_admin_list(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  return jsonb_build_object('ok',true,'requests',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id,r.created_at,r.mode,r.audience,r.plan,r.contract,r.monthly_estimate,r.display_name,r.email,r.phone,r.status,r.site_slug,s.published
      from public.homepage_subscription_requests r left join public.homepage_sites s on s.request_id=r.id
      order by r.created_at desc limit greatest(1,least(coalesce(p_limit,50),200))
    ) x),'[]'::jsonb));
end
$$;

create or replace function public.homepage_subscription_publish(p_slug text, p_published boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text := lower(trim(coalesce(p_slug,''))); v_request uuid;
begin
  if not public.is_platform_admin() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  update public.homepage_sites set published=coalesce(p_published,true),
    published_at=case when coalesce(p_published,true) then coalesce(published_at,now()) else published_at end,
    updated_at=now()
  where slug=v_slug returning request_id into v_request;
  if v_request is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  update public.homepage_subscription_requests set status=case when coalesce(p_published,true) then 'published' else 'provisioned' end where id=v_request;
  return jsonb_build_object('ok',true,'slug',v_slug,'published',coalesce(p_published,true),'site_url','https://ekodi.kr/'||v_slug);
end
$$;

revoke all on function public.homepage_subscription_submit(jsonb) from public;
revoke all on function public.homepage_site_public(text) from public;
revoke all on function public.homepage_subscription_admin_list(integer) from public;
revoke all on function public.homepage_subscription_publish(text, boolean) from public;
grant execute on function public.homepage_subscription_submit(jsonb) to anon, authenticated;
grant execute on function public.homepage_site_public(text) to anon, authenticated;
grant execute on function public.homepage_subscription_admin_list(integer) to authenticated;
grant execute on function public.homepage_subscription_publish(text, boolean) to authenticated;
