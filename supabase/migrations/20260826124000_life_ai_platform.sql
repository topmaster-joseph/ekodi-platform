create table if not exists public.life_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (topic in ('relationship','money','work','family','heart','future','faith','meaning')),
  question_text text not null check (char_length(question_text) between 1 and 4000),
  root_question text not null default '',
  scriptures text[] not null default '{}',
  next_question text not null default '',
  action_text text not null default '',
  source text not null default 'life.ekodi.kr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.life_reflections enable row level security;
create index if not exists life_reflections_user_created_idx on public.life_reflections(user_id,created_at desc);

drop policy if exists life_reflections_select_own on public.life_reflections;
create policy life_reflections_select_own on public.life_reflections for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists life_reflections_insert_own on public.life_reflections;
create policy life_reflections_insert_own on public.life_reflections for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists life_reflections_update_own on public.life_reflections;
create policy life_reflections_update_own on public.life_reflections for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists life_reflections_delete_own on public.life_reflections;
create policy life_reflections_delete_own on public.life_reflections for delete to authenticated using ((select auth.uid())=user_id);

create table if not exists public.life_tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  host text not null unique check (host=lower(host) and position('.' in host)>0),
  owner_tenant_id uuid null references public.tenants(id) on delete set null,
  brand_name text not null default '오늘의 질문',
  platform_name text not null default '인생AI',
  tagline text not null default '당신의 삶을 함께 생각합니다',
  community_label text not null default '사람과 함께 나누기',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.life_tenant_profiles enable row level security;
drop policy if exists life_tenant_profiles_public_read on public.life_tenant_profiles;
create policy life_tenant_profiles_public_read on public.life_tenant_profiles for select to anon,authenticated using (active=true);

insert into public.life_tenant_profiles(host,brand_name,platform_name,tagline,community_label,active)
values ('life.ekodi.kr','오늘의 질문','인생AI','당신의 삶을 함께 생각합니다','사람과 함께 나누기',true)
on conflict (host) do update set brand_name=excluded.brand_name,platform_name=excluded.platform_name,tagline=excluded.tagline,community_label=excluded.community_label,active=true,updated_at=now();

comment on table public.life_reflections is 'User-explicit saved reflections from EKODI Life AI. Conversation bodies are not auto-persisted.';
comment on table public.life_tenant_profiles is 'Public-safe white-label profile for EKODI Life AI hosts; writes remain server/admin controlled.';
