-- Harden the compatible Education LMS 10000 + private role wrapper 11500.
-- Additive: preserves existing dev/prod rows; protects immutable identities on
-- admin updates and restricts student progress mutation to own fixed course.
create or replace function education_private.education_protect_enrollment_identity()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.course_key is distinct from old.course_key
    or new.batch_id is distinct from old.batch_id
    or new.created_at is distinct from old.created_at then
   raise exception 'education_enrollment_identity_immutable';
 end if;
 new.reviewed_at=case when new.state is distinct from old.state then now() else old.reviewed_at end;
 return new;
end $function$;
drop trigger if exists education_enrollment_identity_guard on public.education_enrollments;
create trigger education_enrollment_identity_guard
before update on public.education_enrollments
for each row execute function education_private.education_protect_enrollment_identity();

create or replace function education_private.education_protect_progress_identity()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
 if new.user_id is distinct from old.user_id
    or new.course_key is distinct from old.course_key
    or new.lesson_id is distinct from old.lesson_id then
   raise exception 'education_progress_identity_immutable';
 end if;
 new.updated_at=now();
 return new;
end $function$;
drop trigger if exists education_progress_identity_guard on public.education_learning_progress;
create trigger education_progress_identity_guard
before update on public.education_learning_progress
for each row execute function education_private.education_protect_progress_identity();

-- Trigger functions cannot be called directly by an API client.
revoke all on function education_private.education_protect_enrollment_identity(),
  education_private.education_protect_progress_identity() from public,anon,authenticated;
revoke delete on public.education_learning_progress from authenticated;
drop policy if exists education_progress_self_delete on public.education_learning_progress;
-- Published posts are always explicitly approved by an administrator,
-- whereas instructors can only insert/update unapproved drafts.
drop policy if exists education_posts_operator_create on public.education_course_posts;
create policy education_posts_operator_create on public.education_course_posts
for insert to authenticated with check(
 public.education_actor_role()='admin' or
 (public.education_actor_role()='instructor' and status='draft' and published_at is null)
);
drop policy if exists education_posts_operator_update on public.education_course_posts;
create policy education_posts_operator_update on public.education_course_posts
for update to authenticated
using(public.education_actor_role()='admin' or
 (public.education_actor_role()='instructor' and status='draft'))
with check(public.education_actor_role()='admin' or
 (public.education_actor_role()='instructor' and status='draft' and published_at is null));
