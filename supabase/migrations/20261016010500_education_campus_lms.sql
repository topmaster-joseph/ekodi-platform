-- EKODI Education integrated campus: production counterpart of development's
-- education_online_campus_rls and education_role_private_wrapper migrations.
-- Additive/compatible: never drop or overwrite existing enrollment/progress data.
-- No student grade, payment, certificate, or private document storage.
create schema if not exists education_private;
revoke all on schema education_private from public,anon;
grant usage on schema education_private to authenticated;

create table if not exists public.education_course_posts(
 id uuid primary key default gen_random_uuid(),
 course_key text not null default 'ai-bootcamp' check(course_key='ai-bootcamp'),
 kind text not null check(kind in ('notice','resource','lesson','exercise')),
 title text not null check(char_length(btrim(title)) between 2 and 160),
 body text not null check(char_length(btrim(body)) between 2 and 6000),
 url text check(url is null or (char_length(url)<=700 and url ~ '^https://[^[:space:]]+$')),
 status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.education_enrollments(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 course_key text not null default 'ai-bootcamp' check(course_key='ai-bootcamp'),
 batch_id text not null check(batch_id in ('A','B','C','D','E','F')),
 state text not null default 'requested' check(state in ('requested','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(user_id,course_key)
);
create table if not exists public.education_learning_progress(
 user_id uuid not null references auth.users(id) on delete cascade,
 course_key text not null default 'ai-bootcamp' check(course_key='ai-bootcamp'),
 lesson_id int not null check(lesson_id between 1 and 4),
 completed boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,course_key,lesson_id)
);
create index if not exists education_posts_published_idx on public.education_course_posts(status,kind,published_at desc);
create index if not exists education_enrollments_queue_idx on public.education_enrollments(state,created_at desc);

-- Privileged lookup is isolated in a non-exposed schema. The public function
-- is only a caller-rights wrapper with a server-authenticated uid prerequisite.
create or replace function education_private.actor_role()
returns text language sql stable security definer set search_path='public','auth','pg_temp'
as $func$
 select case
  when auth.uid() is null then 'learner'
  when exists(select 1 from public.site_access_registry r
       where r.status='active' and r.site_key='admin'
         and r.role::text='platform_admin'
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))) then 'admin'
  when exists(select 1 from public.site_access_registry r
       where r.status='active' and r.site_key='edu'
         and r.role::text in ('tenant_admin','store_owner','store_staff')
         and lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))) then 'instructor'
  else 'learner' end
$func$;
revoke all on function education_private.actor_role() from public,anon;
grant execute on function education_private.actor_role() to authenticated;
create or replace function public.education_actor_role()
returns text language sql stable set search_path='public','education_private','pg_temp'
as $func$
 select case when auth.uid() is null then 'learner'
             else education_private.actor_role() end
$func$;
revoke all on function public.education_actor_role() from public,anon;
grant execute on function public.education_actor_role() to authenticated;

-- Immutable student identity and course enrollment membership after creation.
create or replace function education_private.protect_enrollment_identity()
returns trigger language plpgsql set search_path=''
as $func$
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.course_key is distinct from old.course_key
    or new.batch_id is distinct from old.batch_id
    or new.created_at is distinct from old.created_at then
  raise exception 'education_enrollment_identity_immutable';
 end if;
 new.reviewed_at=case when new.state is distinct from old.state then now() else old.reviewed_at end;
 return new;
end $func$;
drop trigger if exists education_enrollment_identity_guard on public.education_enrollments;
create trigger education_enrollment_identity_guard before update on public.education_enrollments
for each row execute function education_private.protect_enrollment_identity();
create or replace function education_private.protect_progress_identity()
returns trigger language plpgsql set search_path=''
as $func$
begin
 if new.user_id is distinct from old.user_id or new.course_key is distinct from old.course_key
    or new.lesson_id is distinct from old.lesson_id then
  raise exception 'education_progress_identity_immutable';
 end if;
 new.updated_at=now();
 return new;
end $func$;
drop trigger if exists education_progress_identity_guard on public.education_learning_progress;
create trigger education_progress_identity_guard before update on public.education_learning_progress
for each row execute function education_private.protect_progress_identity();
revoke all on function education_private.protect_enrollment_identity(),education_private.protect_progress_identity()
 from public,anon,authenticated;

alter table public.education_course_posts enable row level security;
alter table public.education_enrollments enable row level security;
alter table public.education_learning_progress enable row level security;
revoke all on public.education_course_posts,public.education_enrollments,
  public.education_learning_progress from public,anon,authenticated;
grant select on public.education_course_posts to anon,authenticated;
grant insert,update,delete on public.education_course_posts to authenticated;
grant select,insert,update on public.education_enrollments to authenticated;
grant select,insert,update on public.education_learning_progress to authenticated;

-- Replace development pre-existing policies by name, then install strictly
-- row-scoped policies without depending on browser-visible UI roles.
drop policy if exists education_posts_public_read on public.education_course_posts;
drop policy if exists education_posts_operator_create on public.education_course_posts;
drop policy if exists education_posts_operator_update on public.education_course_posts;
drop policy if exists education_posts_admin_delete on public.education_course_posts;
drop policy if exists education_posts_public_select on public.education_course_posts;
create policy education_posts_public_read on public.education_course_posts for select to anon,authenticated
using(status='published' or
      (auth.uid() is not null and public.education_actor_role() in ('admin','instructor')));
create policy education_posts_operator_create on public.education_course_posts for insert to authenticated
with check(public.education_actor_role()='admin' or
      (public.education_actor_role()='instructor' and status='draft' and published_at is null));
create policy education_posts_operator_update on public.education_course_posts for update to authenticated
using(public.education_actor_role()='admin' or
      (public.education_actor_role()='instructor' and status='draft'))
with check(public.education_actor_role()='admin' or
      (public.education_actor_role()='instructor' and status='draft' and published_at is null));
create policy education_posts_admin_delete on public.education_course_posts for delete to authenticated
using(public.education_actor_role()='admin');

drop policy if exists education_enrollments_own_or_admin_read on public.education_enrollments;
drop policy if exists education_enrollments_self_request on public.education_enrollments;
drop policy if exists education_enrollments_admin_update on public.education_enrollments;
create policy education_enrollments_own_or_admin_read on public.education_enrollments for select to authenticated
using(user_id=auth.uid() or public.education_actor_role()='admin');
create policy education_enrollments_self_request on public.education_enrollments for insert to authenticated
with check(user_id=auth.uid() and state='requested');
create policy education_enrollments_admin_update on public.education_enrollments for update to authenticated
using(public.education_actor_role()='admin')
with check(public.education_actor_role()='admin');

drop policy if exists education_progress_self_read on public.education_learning_progress;
drop policy if exists education_progress_self_create on public.education_learning_progress;
drop policy if exists education_progress_self_update on public.education_learning_progress;
drop policy if exists education_progress_self_delete on public.education_learning_progress;
create policy education_progress_self_read on public.education_learning_progress for select to authenticated
using(user_id=auth.uid());
create policy education_progress_self_create on public.education_learning_progress for insert to authenticated
with check(user_id=auth.uid());
create policy education_progress_self_update on public.education_learning_progress for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Deliberately do not grant DELETE for learning progress or enrollment.
