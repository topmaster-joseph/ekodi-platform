-- Freeze the exact approved manuscript for EKODI BOOKS handoff.
-- Any manuscript change after approval revokes that approval and cancels prepared packages.

create table if not exists public.author_publication_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.author_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  manuscript jsonb not null default '[]'::jsonb,
  status text not null default 'prepared' check (status in ('prepared','consumed','cancelled')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique(project_id, version)
);

create index if not exists idx_author_publication_packages_project on public.author_publication_packages(project_id, version desc);
alter table public.author_publication_packages enable row level security;
create policy "author_packages_owner_select" on public.author_publication_packages for select to authenticated using (owner_user_id = auth.uid());

create or replace function public.author_prepare_publication_package()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_version integer;
  v_empty integer;
  v_unreviewed integer;
  v_package_id uuid;
  v_manuscript jsonb;
begin
  if new.status <> 'publish_ready' or old.status = new.status then return new; end if;

  select count(*) filter (where length(trim(coalesce(draft_text,''))) = 0),
         count(*) filter (where status not in ('reviewed','approved')),
         coalesce(jsonb_agg(jsonb_build_object(
           'chapter_id', id,
           'order', chapter_order,
           'title', title,
           'purpose', purpose,
           'text', draft_text,
           'version', version,
           'status', status
         ) order by chapter_order),'[]'::jsonb)
    into v_empty, v_unreviewed, v_manuscript
    from public.author_chapters
   where project_id = new.id and owner_user_id = new.owner_user_id;

  if jsonb_array_length(v_manuscript) < 1 or v_empty > 0 or v_unreviewed > 0 then
    raise exception 'PUBLICATION_PACKAGE_REQUIRES_COMPLETE_REVIEWED_MANUSCRIPT';
  end if;

  update public.author_publication_packages
     set status = 'cancelled'
   where project_id = new.id and status = 'prepared';

  select coalesce(max(version),0)+1 into v_version
    from public.author_publication_packages where project_id = new.id;

  insert into public.author_publication_packages(project_id,owner_user_id,version,title,metadata,manuscript,status)
  values(
    new.id,
    new.owner_user_id,
    v_version,
    coalesce(nullif(new.working_title,''),new.title),
    jsonb_build_object(
      'project_id',new.id,
      'title',new.title,
      'working_title',new.working_title,
      'field',new.field,
      'audience',new.audience,
      'book_format',new.book_format,
      'tone',new.tone,
      'narrative_mode',new.narrative_mode,
      'source_mode',new.source_mode,
      'target_words',new.target_words,
      'selected_plan',new.selected_plan,
      'approved_by_user',new.owner_user_id,
      'prepared_at',now()
    ),
    v_manuscript,
    'prepared'
  ) returning id into v_package_id;

  insert into public.author_events(project_id,owner_user_id,actor,event_type,payload)
  values(new.id,new.owner_user_id,'books','books.package.prepared',jsonb_build_object('package_id',v_package_id,'version',v_version,'status','prepared'));

  return new;
end
$$;

drop trigger if exists trg_author_prepare_publication_package on public.author_projects;
create trigger trg_author_prepare_publication_package
after update of status on public.author_projects
for each row execute function public.author_prepare_publication_package();

create or replace function public.author_revoke_approval_on_revision()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_status text;
begin
  if new.draft_text is not distinct from old.draft_text
     and new.title is not distinct from old.title
     and new.purpose is not distinct from old.purpose then return new; end if;

  select status into v_status from public.author_projects where id = new.project_id;
  if v_status in ('author_approved','publish_ready') then
    update public.author_publication_packages set status='cancelled' where project_id=new.project_id and status='prepared';
    update public.author_projects set status='review',updated_at=now() where id=new.project_id;
    insert into public.author_events(project_id,owner_user_id,actor,event_type,payload)
    values(new.project_id,new.owner_user_id,'system','approval.revoked.after_revision',jsonb_build_object('chapter_id',new.id,'chapter_order',new.chapter_order,'previous_project_status',v_status));
  end if;
  return new;
end
$$;

drop trigger if exists trg_author_revoke_approval_on_revision on public.author_chapters;
create trigger trg_author_revoke_approval_on_revision
after update of draft_text,title,purpose on public.author_chapters
for each row execute function public.author_revoke_approval_on_revision();

comment on table public.author_publication_packages is 'Immutable, owner-private publication snapshot prepared only after explicit author approval and complete chapter review.';
