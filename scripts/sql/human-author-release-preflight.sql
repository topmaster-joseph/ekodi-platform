-- Read-only production preflight. Do not modify real author data.
select
  to_regclass('public.author_projects') is not null as author_projects,
  to_regclass('public.author_chapters') is not null as author_chapters,
  to_regclass('public.author_memberships') is not null as existing_author_memberships,
  (
    to_regclass('public.human_author_subscriptions') is null
    and to_regclass('public.human_author_enrollments') is null
    and to_regclass('public.human_author_interview_turns') is null
    and to_regprocedure('public.human_author_reserve_project(uuid,text,text)') is null
  ) as fresh,
  (
    to_regclass('public.human_author_subscriptions') is not null
    and to_regclass('public.human_author_enrollments') is not null
    and to_regclass('public.human_author_interview_turns') is not null
    and to_regprocedure('public.human_author_reserve_project(uuid,text,text)') is not null
  ) as already_installed;
