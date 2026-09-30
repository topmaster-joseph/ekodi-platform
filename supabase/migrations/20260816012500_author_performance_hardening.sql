-- Author AI scale hardening: initialize auth.uid() once per statement and cover foreign keys.

create index if not exists idx_author_chapters_owner on public.author_chapters(owner_user_id);
create index if not exists idx_author_events_owner on public.author_events(owner_user_id);
create index if not exists idx_author_jobs_project on public.author_agent_jobs(project_id);
create index if not exists idx_author_jobs_chapter on public.author_agent_jobs(chapter_id);
create index if not exists idx_author_packages_owner on public.author_publication_packages(owner_user_id);

-- Projects
drop policy if exists "author_projects_owner_select" on public.author_projects;
drop policy if exists "author_projects_owner_insert" on public.author_projects;
drop policy if exists "author_projects_owner_update" on public.author_projects;
drop policy if exists "author_projects_owner_delete" on public.author_projects;
create policy "author_projects_owner_select" on public.author_projects for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "author_projects_owner_insert" on public.author_projects for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy "author_projects_owner_update" on public.author_projects for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy "author_projects_owner_delete" on public.author_projects for delete to authenticated using (owner_user_id = (select auth.uid()));

-- Chapters
drop policy if exists "author_chapters_owner_select" on public.author_chapters;
drop policy if exists "author_chapters_owner_insert" on public.author_chapters;
drop policy if exists "author_chapters_owner_update" on public.author_chapters;
drop policy if exists "author_chapters_owner_delete" on public.author_chapters;
create policy "author_chapters_owner_select" on public.author_chapters for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "author_chapters_owner_insert" on public.author_chapters for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy "author_chapters_owner_update" on public.author_chapters for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy "author_chapters_owner_delete" on public.author_chapters for delete to authenticated using (owner_user_id = (select auth.uid()));

-- Events: browser clients may only write non-privileged author-side actors.
drop policy if exists "author_events_owner_select" on public.author_events;
drop policy if exists "author_events_owner_insert" on public.author_events;
create policy "author_events_owner_select" on public.author_events for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "author_events_owner_insert" on public.author_events for insert to authenticated with check (
  owner_user_id = (select auth.uid())
  and actor in ('author','author-ai','research-ai','editor-ai')
);

-- Agent jobs are read-only to browser clients.
drop policy if exists "author_jobs_owner_select" on public.author_agent_jobs;
create policy "author_jobs_owner_select" on public.author_agent_jobs for select to authenticated using (owner_user_id = (select auth.uid()));

-- Immutable publication packages are read-only to their owner.
drop policy if exists "author_packages_owner_select" on public.author_publication_packages;
create policy "author_packages_owner_select" on public.author_publication_packages for select to authenticated using (owner_user_id = (select auth.uid()));
