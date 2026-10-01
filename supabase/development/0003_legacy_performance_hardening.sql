-- Development-only legacy performance hardening.
-- Keeps the legacy DEV project efficient while it is drained into the canonical platform.

begin;

create index if not exists church_care_tasks_member_id_idx
  on public.church_care_tasks(member_id);
create index if not exists community_posts_author_id_idx
  on public.community_posts(author_id);
create index if not exists prayer_requests_author_id_idx
  on public.prayer_requests(author_id);
create index if not exists profiles_approved_by_idx
  on public.profiles(approved_by);

alter policy "profile self or admin read"
  on public.profiles
  using ((id = (select auth.uid())) or is_admin());

alter policy "posts visible by level"
  on public.community_posts
  using (
    (author_id = (select auth.uid()))
    or is_admin()
    or ((status = 'published'::text) and (visibility = 'public'::text))
    or ((status = 'published'::text) and (visibility = 'members'::text) and is_approved_member())
  );

alter policy "approved members create posts"
  on public.community_posts
  with check ((author_id = (select auth.uid())) and is_approved_member());

alter policy "author or admin update posts"
  on public.community_posts
  using ((author_id = (select auth.uid())) or is_admin())
  with check ((author_id = (select auth.uid())) or is_admin());

alter policy "author or admin delete posts"
  on public.community_posts
  using ((author_id = (select auth.uid())) or is_admin());

alter policy "prayers visible by level"
  on public.prayer_requests
  using (
    (author_id = (select auth.uid()))
    or is_admin()
    or ((status = 'approved'::text) and (visibility = 'public'::text))
    or ((status = 'approved'::text) and (visibility = 'members'::text) and is_approved_member())
  );

alter policy "members create prayers"
  on public.prayer_requests
  with check (author_id = (select auth.uid()));

alter policy "author or admin update prayers"
  on public.prayer_requests
  using ((author_id = (select auth.uid())) or is_admin())
  with check ((author_id = (select auth.uid())) or is_admin());

alter policy "author or admin delete prayers"
  on public.prayer_requests
  using ((author_id = (select auth.uid())) or is_admin());

-- The PUBLIC policy already grants the same SELECT access to anon/authenticated.
drop policy if exists "site_latest_content_public_read"
  on public.site_latest_content;

commit;
