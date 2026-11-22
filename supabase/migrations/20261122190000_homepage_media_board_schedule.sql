-- 홈페이지 구독: 사진(대표 이미지·갤러리)·게시판(소식)·일정표를 '내 홈페이지' 탭에서 직접 올린다.
-- 요금제별 한도: S1 대표1·갤러리6 / S2 대표1·갤러리20·게시판·일정 / S3 갤러리50 / S4 갤러리100.
-- 권한: 신청 이메일로 로그인한 본인 또는 플랫폼 관리자(homepage_can_manage). 공개 화면은 공개 승인된 사이트만.
-- 이미지 파일은 Storage 버킷 homepage-media/{slug}/... (공개 읽기, 5MB, jpeg·png·webp).

create or replace function public.homepage_plan_limits(p_plan text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case p_plan
    when 'S1' then '{"hero":true,"gallery":6,"board":false,"schedule":false}'::jsonb
    when 'S2' then '{"hero":true,"gallery":20,"board":true,"schedule":true}'::jsonb
    when 'S3' then '{"hero":true,"gallery":50,"board":true,"schedule":true}'::jsonb
    when 'S4' then '{"hero":true,"gallery":100,"board":true,"schedule":true}'::jsonb
    else '{"hero":false,"gallery":0,"board":false,"schedule":false}'::jsonb end
$$;

create table if not exists public.homepage_site_media (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.homepage_sites(slug) on delete cascade,
  kind text not null check (kind in ('hero','gallery')),
  path text not null unique check (path ~ '^hp-[a-z0-9]{8}/[A-Za-z0-9._-]{1,120}$'),
  caption text check (caption is null or char_length(caption) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists homepage_site_media_slug_idx on public.homepage_site_media(slug, kind, created_at);

create table if not exists public.homepage_site_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.homepage_sites(slug) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists homepage_site_posts_slug_idx on public.homepage_site_posts(slug, created_at desc);

create table if not exists public.homepage_site_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.homepage_sites(slug) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_date date not null,
  event_time text check (event_time is null or char_length(event_time) <= 40),
  place text check (place is null or char_length(place) <= 120),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists homepage_site_events_slug_idx on public.homepage_site_events(slug, event_date);

alter table public.homepage_site_media enable row level security;
alter table public.homepage_site_posts enable row level security;
alter table public.homepage_site_events enable row level security;
revoke all on table public.homepage_site_media from public, anon, authenticated, service_role;
revoke all on table public.homepage_site_posts from public, anon, authenticated, service_role;
revoke all on table public.homepage_site_events from public, anon, authenticated, service_role;

create or replace function public.homepage_can_manage(p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_email text := public.homepage_viewer_email(); v_owner text;
begin
  if v_email is null then return false; end if;
  select lower(r.email) into v_owner from public.homepage_sites s join public.homepage_subscription_requests r on r.id=s.request_id where s.slug=lower(coalesce(p_slug,''));
  if v_owner is null then return false; end if;
  return v_owner = v_email or public.homepage_subscription_is_admin();
end
$$;

create or replace function public.homepage_site_manage(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_slug text := lower(trim(coalesce(p_slug,''))); v_plan text;
begin
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  select plan into v_plan from public.homepage_sites where slug=v_slug;
  return jsonb_build_object('ok',true,'slug',v_slug,'plan',v_plan,'limits',public.homepage_plan_limits(v_plan),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'path',m.path,'caption',m.caption) order by m.kind, m.created_at) from public.homepage_site_media m where m.slug=v_slug),'[]'::jsonb),
    'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'body',p.body,'created_at',p.created_at) order by p.created_at desc) from public.homepage_site_posts p where p.slug=v_slug),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'event_date',e.event_date,'event_time',e.event_time,'place',e.place,'note',e.note) order by e.event_date, e.created_at) from public.homepage_site_events e where e.slug=v_slug),'[]'::jsonb));
end
$$;

create or replace function public.homepage_media_add(p_slug text, p_kind text, p_path text, p_caption text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text := lower(trim(coalesce(p_slug,''))); v_limits jsonb; v_count integer; v_old text; v_id uuid;
begin
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_kind not in ('hero','gallery') then return jsonb_build_object('ok',false,'error','invalid_kind'); end if;
  if coalesce(p_path,'') !~ ('^' || v_slug || '/[A-Za-z0-9._-]{1,120}$') then return jsonb_build_object('ok',false,'error','invalid_path'); end if;
  select public.homepage_plan_limits(plan) into v_limits from public.homepage_sites where slug=v_slug;
  if p_kind='hero' then
    if not coalesce((v_limits->>'hero')::boolean,false) then return jsonb_build_object('ok',false,'error','plan_limit'); end if;
    delete from public.homepage_site_media where slug=v_slug and kind='hero' returning path into v_old;
  else
    select count(*) into v_count from public.homepage_site_media where slug=v_slug and kind='gallery';
    if v_count >= coalesce((v_limits->>'gallery')::integer,0) then return jsonb_build_object('ok',false,'error','plan_limit'); end if;
  end if;
  insert into public.homepage_site_media(slug,kind,path,caption) values (v_slug,p_kind,p_path,nullif(left(trim(coalesce(p_caption,'')),120),'')) returning id into v_id;
  update public.homepage_sites set updated_at=now() where slug=v_slug;
  return jsonb_build_object('ok',true,'id',v_id,'replaced_path',v_old);
end
$$;

create or replace function public.homepage_media_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text; v_path text;
begin
  select slug,path into v_slug,v_path from public.homepage_site_media where id=p_id;
  if v_slug is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  delete from public.homepage_site_media where id=p_id;
  return jsonb_build_object('ok',true,'path',v_path);
end
$$;

create or replace function public.homepage_post_save(p_slug text, p_id uuid, p_title text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text := lower(trim(coalesce(p_slug,''))); v_title text := left(trim(coalesce(p_title,'')),120); v_id uuid;
begin
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if not coalesce((select (public.homepage_plan_limits(plan)->>'board')::boolean from public.homepage_sites where slug=v_slug),false) then return jsonb_build_object('ok',false,'error','plan_limit'); end if;
  if char_length(v_title) < 1 then return jsonb_build_object('ok',false,'error','title_required'); end if;
  if p_id is null then
    if (select count(*) from public.homepage_site_posts where slug=v_slug) >= 200 then return jsonb_build_object('ok',false,'error','too_many'); end if;
    insert into public.homepage_site_posts(slug,title,body) values (v_slug,v_title,nullif(left(coalesce(p_body,''),5000),'')) returning id into v_id;
  else
    update public.homepage_site_posts set title=v_title, body=nullif(left(coalesce(p_body,''),5000),''), updated_at=now() where id=p_id and slug=v_slug returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end
$$;

create or replace function public.homepage_post_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text;
begin
  select slug into v_slug from public.homepage_site_posts where id=p_id;
  if v_slug is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  delete from public.homepage_site_posts where id=p_id;
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.homepage_event_save(p_slug text, p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text := lower(trim(coalesce(p_slug,''))); v_title text := left(trim(coalesce(p->>'title','')),120); v_date date; v_id uuid;
begin
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if not coalesce((select (public.homepage_plan_limits(plan)->>'schedule')::boolean from public.homepage_sites where slug=v_slug),false) then return jsonb_build_object('ok',false,'error','plan_limit'); end if;
  if char_length(v_title) < 1 then return jsonb_build_object('ok',false,'error','title_required'); end if;
  begin v_date := (p->>'event_date')::date; exception when others then v_date := null; end;
  if v_date is null then return jsonb_build_object('ok',false,'error','invalid_date'); end if;
  if p_id is null then
    if (select count(*) from public.homepage_site_events where slug=v_slug) >= 200 then return jsonb_build_object('ok',false,'error','too_many'); end if;
    insert into public.homepage_site_events(slug,title,event_date,event_time,place,note)
    values (v_slug,v_title,v_date,nullif(left(trim(coalesce(p->>'event_time','')),40),''),nullif(left(trim(coalesce(p->>'place','')),120),''),nullif(left(trim(coalesce(p->>'note','')),500),''))
    returning id into v_id;
  else
    update public.homepage_site_events set title=v_title, event_date=v_date, event_time=nullif(left(trim(coalesce(p->>'event_time','')),40),''),
      place=nullif(left(trim(coalesce(p->>'place','')),120),''), note=nullif(left(trim(coalesce(p->>'note','')),500),'')
    where id=p_id and slug=v_slug returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end
$$;

create or replace function public.homepage_event_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_slug text;
begin
  select slug into v_slug from public.homepage_site_events where id=p_id;
  if v_slug is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not public.homepage_can_manage(v_slug) then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  delete from public.homepage_site_events where id=p_id;
  return jsonb_build_object('ok',true);
end
$$;

-- 공개 화면 데이터: 공개된 사이트만, 요금제가 허용하는 항목만.
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
  v_limits jsonb;
begin
  if v_slug !~ '^hp-[a-z0-9]{8}$' then return null; end if;
  select * into s from public.homepage_sites where slug=v_slug;
  if not found then return null; end if;
  if not s.published then
    return jsonb_build_object('slug',s.slug,'published',false);
  end if;
  v_limits := public.homepage_plan_limits(s.plan);
  return jsonb_build_object('slug',s.slug,'published',true,'audience',s.audience,'plan',s.plan,
    'display_name',s.display_name,'headline',s.headline,'intro',s.intro,'phone',s.phone,
    'address',s.address,'hours',s.hours,'links',s.links,'published_at',s.published_at,'updated_at',s.updated_at,
    'hero',(select m.path from public.homepage_site_media m where m.slug=s.slug and m.kind='hero' order by m.created_at desc limit 1),
    'gallery',coalesce((select jsonb_agg(jsonb_build_object('path',g.path,'caption',g.caption) order by g.created_at)
      from (select * from public.homepage_site_media m where m.slug=s.slug and m.kind='gallery' order by m.created_at limit greatest(0,coalesce((v_limits->>'gallery')::integer,0))) g),'[]'::jsonb),
    'posts',case when coalesce((v_limits->>'board')::boolean,false) then coalesce((select jsonb_agg(jsonb_build_object('title',x.title,'body',x.body,'created_at',x.created_at) order by x.created_at desc)
      from (select * from public.homepage_site_posts p where p.slug=s.slug order by p.created_at desc limit 20) x),'[]'::jsonb) else '[]'::jsonb end,
    'events',case when coalesce((v_limits->>'schedule')::boolean,false) then coalesce((select jsonb_agg(jsonb_build_object('title',x.title,'event_date',x.event_date,'event_time',x.event_time,'place',x.place,'note',x.note) order by x.event_date)
      from (select * from public.homepage_site_events e where e.slug=s.slug and e.event_date >= (now() at time zone 'Asia/Seoul')::date order by e.event_date limit 30) x),'[]'::jsonb) else '[]'::jsonb end);
end
$$;

-- Storage: homepage-media 버킷과 업로드·삭제 정책(본인 또는 관리자만, 자기 slug 폴더만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-media','homepage-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists homepage_media_insert on storage.objects;
create policy homepage_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'homepage-media' and public.homepage_can_manage((storage.foldername(name))[1]));
drop policy if exists homepage_media_delete on storage.objects;
create policy homepage_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'homepage-media' and public.homepage_can_manage((storage.foldername(name))[1]));

revoke all on function public.homepage_plan_limits(text) from public;
revoke all on function public.homepage_can_manage(text) from public;
revoke all on function public.homepage_site_manage(text) from public;
revoke all on function public.homepage_media_add(text, text, text, text) from public;
revoke all on function public.homepage_media_delete(uuid) from public;
revoke all on function public.homepage_post_save(text, uuid, text, text) from public;
revoke all on function public.homepage_post_delete(uuid) from public;
revoke all on function public.homepage_event_save(text, uuid, jsonb) from public;
revoke all on function public.homepage_event_delete(uuid) from public;
revoke all on function public.homepage_site_public(text) from public;
grant execute on function public.homepage_plan_limits(text) to anon, authenticated;
grant execute on function public.homepage_can_manage(text) to authenticated;
grant execute on function public.homepage_site_manage(text) to authenticated;
grant execute on function public.homepage_media_add(text, text, text, text) to authenticated;
grant execute on function public.homepage_media_delete(uuid) to authenticated;
grant execute on function public.homepage_post_save(text, uuid, text, text) to authenticated;
grant execute on function public.homepage_post_delete(uuid) to authenticated;
grant execute on function public.homepage_event_save(text, uuid, jsonb) to authenticated;
grant execute on function public.homepage_event_delete(uuid) to authenticated;
grant execute on function public.homepage_site_public(text) to anon, authenticated;
