-- Clients may read their orchestration records but cannot impersonate Chief AI, Books or system actors.

drop policy if exists "author_events_owner_insert" on public.author_events;
create policy "author_events_owner_insert"
on public.author_events for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and actor in ('author','author-ai','research-ai','editor-ai')
);

drop policy if exists "author_jobs_owner_insert" on public.author_agent_jobs;
drop policy if exists "author_jobs_owner_update" on public.author_agent_jobs;
drop policy if exists "author_jobs_owner_delete" on public.author_agent_jobs;

comment on table public.author_agent_jobs is 'Read-only orchestration queue for authors. Agent jobs are written by trusted triggers or Edge Functions, not directly by browser clients.';
