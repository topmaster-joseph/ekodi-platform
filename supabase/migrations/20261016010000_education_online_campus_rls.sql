-- EKODI Education · role-gated online campus.
-- Educational progress is not official attendance, grading, certification or payment.
-- No instructor or administrator authority can be granted by client metadata/UI.
-- This migration must be applied and verified BEFORE enabling EDUCATION_LMS_ENABLED.

create or replace function public.education_actor_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when auth.uid() is null then 'learner'
    when exists (
      select 1 from public.site_access_registry r
       where r.status='active'
         and r.site_key='admin'
         and r.role::text='platform_admin'
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    ) then 'admin'
    when exists (
      select 1 from public.site_access_registry r
       where r.status='active'
         and r.site_key='edu'
         and r.role::text in ('tenant_admin','store_owner','store_staff')
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    ) then 'instructor'
    else 'learner'
  end
$$;
revoke all on function public.education_actor_role() from public, anon;
grant execute on function public.education_actor_role() to authenticated;

create table if not exists public.education_course_posts (
  id uuid primary key default gen_random_uuid(),
  course_key text not null default 'ai-bootcamp'
    check (course_key='ai-bootcamp'),
  kind text not null check (kind in ('notice','resource','lesson','exercise')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  body text not null check (char_length(btrim(body)) between 2 and 6000),
  url text check (url is null or
    (char_length(url)<=700 and url ~ '^https://[^[:space:]]+$')),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists education_course_posts_public_idx
  on public.education_course_posts (course_key,status,published_at desc);
alter table public.education_course_posts enable row level security;
revoke all on public.education_course_posts from anon, authenticated;
grant select on public.education_course_posts to anon,authenticated;
grant insert, update, delete on public.education_course_posts to authenticated;
drop policy if exists education_posts_public_read on public.education_course_posts;
create policy education_posts_public_read on public.education_course_posts
  for select to anon, authenticated
  using (status='published' or
    (auth.uid() is not null and public.education_actor_role() in ('admin','instructor')));
drop policy if exists education_posts_operator_create on public.education_course_posts;
create policy education_posts_operator_create on public.education_course_posts
  for insert to authenticated
  with check (
    public.education_actor_role()='admin'
    or (public.education_actor_role()='instructor' and status='draft')
  );
drop policy if exists education_posts_operator_update on public.education_course_posts;
create policy education_posts_operator_update on public.education_course_posts
  for update to authenticated
  using (public.education_actor_role()='admin' or
    (public.education_actor_role()='instructor' and status='draft'))
  with check (public.education_actor_role()='admin' or
    (public.education_actor_role()='instructor' and status='draft'));
drop policy if exists education_posts_admin_delete on public.education_course_posts;
create policy education_posts_admin_delete on public.education_course_posts
  for delete to authenticated using (public.education_actor_role()='admin');

create table if not exists public.education_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_key text not null default 'ai-bootcamp'
    check (course_key='ai-bootcamp'),
  batch_id text not null check (batch_id in ('A','B','C','D','E','F')),
  state text not null default 'requested' check (state in ('requested','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id,course_key)
);
create index if not exists education_enrollments_course_state_idx
  on public.education_enrollments (course_key,state,created_at desc);
alter table public.education_enrollments enable row level security;
revoke all on public.education_enrollments from public, anon, authenticated;
grant select, insert, update on public.education_enrollments to authenticated;
drop policy if exists education_enrollments_own_or_admin_read on public.education_enrollments;
create policy education_enrollments_own_or_admin_read
  on public.education_enrollments for select to authenticated
  using (auth.uid()=user_id or public.education_actor_role()='admin');
drop policy if exists education_enrollments_self_request on public.education_enrollments;
create policy education_enrollments_self_request
  on public.education_enrollments for insert to authenticated
  with check (auth.uid()=user_id and state='requested');
drop policy if exists education_enrollments_admin_update on public.education_enrollments;
create policy education_enrollments_admin_update
  on public.education_enrollments for update to authenticated
  using (public.education_actor_role()='admin')
  with check (public.education_actor_role()='admin');
-- A student may choose a cohort only at initial request. No client-side
-- account state, admin approvals or identity is trusted outside RLS.

create table if not exists public.education_learning_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_key text not null default 'ai-bootcamp'
    check (course_key='ai-bootcamp'),
  lesson_id integer not null check (lesson_id between 1 and 4),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id,course_key,lesson_id)
);
alter table public.education_learning_progress enable row level security;
revoke all on public.education_learning_progress from public, anon, authenticated;
grant select, insert, update, delete on public.education_learning_progress to authenticated;
drop policy if exists education_progress_self_read on public.education_learning_progress;
create policy education_progress_self_read
  on public.education_learning_progress for select to authenticated
  using (auth.uid()=user_id);
drop policy if exists education_progress_self_create on public.education_learning_progress;
create policy education_progress_self_create
  on public.education_learning_progress for insert to authenticated
  with check (auth.uid()=user_id);
drop policy if exists education_progress_self_update on public.education_learning_progress;
create policy education_progress_self_update
  on public.education_learning_progress for update to authenticated
  using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists education_progress_self_delete on public.education_learning_progress;
create policy education_progress_self_delete
  on public.education_learning_progress for delete to authenticated
  using (auth.uid()=user_id);
-- No education progress policy gives operators access to individual progress.
