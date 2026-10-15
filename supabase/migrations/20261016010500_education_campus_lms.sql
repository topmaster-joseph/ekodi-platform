-- EKODI EDUCATION LMS: optional, dedicated RLS-backed campus metadata.
-- Public lessons and instructor local studio remain unchanged, no real attendance,
-- no tuition/payment, no automatic certification and no sensitive files.
create table if not exists public.education_course_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'instructor' check(role='instructor'),
  created_at timestamptz not null default now()
);
create or replace function public.education_actor_role()
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_mail text;
begin
 if auth.uid() is null then return 'learner'; end if;
 v_mail:=lower(nullif(coalesce(auth.jwt()->>'email',''),'')); 
 if v_mail is not null and exists(
   select 1 from public.site_access_registry r
   where lower(r.email)=v_mail and r.status='active'
     and ((r.site_key='admin' and r.role='platform_admin'::public.app_role)
       or (r.site_key='edu' and r.role in ('platform_admin'::public.app_role,'tenant_admin'::public.app_role)))
 ) then return 'admin'; end if;
 if exists(select 1 from public.education_course_staff s
            where s.user_id=auth.uid() and s.role='instructor')
 then return 'instructor'; end if;
 return 'learner';
end $$;
revoke all on function public.education_actor_role() from public,anon;
grant execute on function public.education_actor_role() to authenticated;

create table if not exists public.education_course_posts(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('notice','resource','lesson','exercise')),
 title text not null check(char_length(title) between 2 and 160),
 body text not null check(char_length(body) between 2 and 6000),
 url text check(url is null or (char_length(url)<=700 and url ~ '^https://[^[:space:]<>"'']+$')),
 status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint education_published_at_consistency check(
   (status='draft' and published_at is null) or
   (status='published' and published_at is not null)
 )
);
create index if not exists education_course_posts_public_idx
 on public.education_course_posts(status,published_at desc) where status='published';
create index if not exists education_course_posts_owner_idx
 on public.education_course_posts(created_by,updated_at desc);

create table if not exists public.education_enrollments(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 course_key text not null default 'ai-bootcamp' check(course_key='ai-bootcamp'),
 batch_id text not null check(batch_id in ('A','B','C','D','E','F')),
 state text not null default 'requested' check(state in ('requested','approved','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,course_key)
);
create index if not exists education_enrollments_course_state_idx
 on public.education_enrollments(course_key,state,created_at desc);
create table if not exists public.education_learning_progress(
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 course_key text not null default 'ai-bootcamp' check(course_key='ai-bootcamp'),
 lesson_id integer not null check(lesson_id between 1 and 4),
 completed boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,course_key,lesson_id)
);
create or replace function public.education_set_update_time()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_table_name='education_enrollments' and
  (new.id is distinct from old.id or new.user_id is distinct from old.user_id or
   new.course_key is distinct from old.course_key or new.batch_id is distinct from old.batch_id or
   new.created_at is distinct from old.created_at) then
   raise exception 'education_enrollment_identity_immutable';
 end if;
 if tg_table_name='education_course_posts' and
  (new.id is distinct from old.id or new.created_by is distinct from old.created_by or
   new.created_at is distinct from old.created_at) then
   raise exception 'education_post_identity_immutable';
 end if;
 if tg_table_name='education_learning_progress' and
  (new.user_id is distinct from old.user_id or new.course_key is distinct from old.course_key or
   new.lesson_id is distinct from old.lesson_id) then
   raise exception 'education_progress_identity_immutable';
 end if;
 new.updated_at=now();
 return new;
end $$;
revoke all on function public.education_set_update_time() from public,anon,authenticated;
drop trigger if exists education_posts_stamp on public.education_course_posts;
create trigger education_posts_stamp before update on public.education_course_posts
for each row execute function public.education_set_update_time();
drop trigger if exists education_enrollments_stamp on public.education_enrollments;
create trigger education_enrollments_stamp before update on public.education_enrollments
for each row execute function public.education_set_update_time();
drop trigger if exists education_progress_stamp on public.education_learning_progress;
create trigger education_progress_stamp before update on public.education_learning_progress
for each row execute function public.education_set_update_time();

alter table public.education_course_staff enable row level security;
alter table public.education_course_posts enable row level security;
alter table public.education_enrollments enable row level security;
alter table public.education_learning_progress enable row level security;
revoke all on public.education_course_staff,public.education_course_posts,
 public.education_enrollments,public.education_learning_progress from public,anon,authenticated;
grant select on public.education_course_posts to anon,authenticated;
grant insert,update,delete on public.education_course_posts to authenticated;
grant select,insert,update on public.education_enrollments to authenticated;
grant select,insert,update on public.education_learning_progress to authenticated;
grant select,insert,update,delete on public.education_course_staff to authenticated;

drop policy if exists education_course_staff_read on public.education_course_staff;
create policy education_course_staff_read on public.education_course_staff for select to authenticated
using (user_id=auth.uid() or public.education_actor_role()='admin');
drop policy if exists education_course_staff_write on public.education_course_staff;
create policy education_course_staff_write on public.education_course_staff for all to authenticated
using(public.education_actor_role()='admin')
with check(public.education_actor_role()='admin');

drop policy if exists education_posts_public_read on public.education_course_posts;
create policy education_posts_public_read on public.education_course_posts for select to anon,authenticated
using(status='published');
drop policy if exists education_posts_staff_read on public.education_course_posts;
create policy education_posts_staff_read on public.education_course_posts for select to authenticated
using(public.education_actor_role()='admin' or
  (public.education_actor_role()='instructor' and created_by=auth.uid()));
drop policy if exists education_posts_insert on public.education_course_posts;
create policy education_posts_insert on public.education_course_posts for insert to authenticated
with check(
 created_by=auth.uid() and
 (public.education_actor_role()='admin' or
  (public.education_actor_role()='instructor' and status='draft' and published_at is null))
);
drop policy if exists education_posts_update on public.education_course_posts;
create policy education_posts_update on public.education_course_posts for update to authenticated
using(public.education_actor_role()='admin' or
 (public.education_actor_role()='instructor' and created_by=auth.uid() and status='draft'))
with check(public.education_actor_role()='admin' or
 (public.education_actor_role()='instructor' and created_by=auth.uid() and status='draft' and published_at is null));
drop policy if exists education_posts_delete on public.education_course_posts;
create policy education_posts_delete on public.education_course_posts for delete to authenticated
using(public.education_actor_role()='admin');

drop policy if exists education_enrollment_read on public.education_enrollments;
create policy education_enrollment_read on public.education_enrollments for select to authenticated
using(user_id=auth.uid() or public.education_actor_role()='admin');
drop policy if exists education_enrollment_request on public.education_enrollments;
create policy education_enrollment_request on public.education_enrollments for insert to authenticated
with check(user_id=auth.uid() and state='requested');
drop policy if exists education_enrollment_approve on public.education_enrollments;
create policy education_enrollment_approve on public.education_enrollments for update to authenticated
using(public.education_actor_role()='admin')
with check(public.education_actor_role()='admin');

drop policy if exists education_progress_read on public.education_learning_progress;
create policy education_progress_read on public.education_learning_progress for select to authenticated
using(user_id=auth.uid());
drop policy if exists education_progress_insert on public.education_learning_progress;
create policy education_progress_insert on public.education_learning_progress for insert to authenticated
with check(user_id=auth.uid());
drop policy if exists education_progress_update on public.education_learning_progress;
create policy education_progress_update on public.education_learning_progress for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());
-- No user-facing payments, scores or certificates, and no server-side document uploads.
