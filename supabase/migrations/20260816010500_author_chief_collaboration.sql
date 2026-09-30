-- Author AI ↔ Chief AI milestone collaboration.
-- The database records structured readiness only. Manuscript body is not copied into Chief AI events.

create or replace function public.author_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'author_approved' and old.status <> 'review' then
    raise exception 'AUTHOR_APPROVAL_REQUIRES_REVIEW';
  end if;
  if new.status = 'publish_ready' and old.status <> 'author_approved' then
    raise exception 'PUBLISH_READY_REQUIRES_AUTHOR_APPROVAL';
  end if;
  if new.status = 'published' and old.status <> 'publish_ready' then
    raise exception 'PUBLISHED_REQUIRES_PUBLISH_READY';
  end if;
  return new;
end
$$;

drop trigger if exists trg_author_status_guard on public.author_projects;
create trigger trg_author_status_guard
before update of status on public.author_projects
for each row execute function public.author_status_guard();

create or replace function public.author_chief_milestone()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer := 0;
  v_reviewed integer := 0;
  v_empty integer := 0;
  v_chars bigint := 0;
  v_readiness text := 'writing';
  v_job_status text := 'completed';
  v_issues jsonb := '[]'::jsonb;
begin
  if new.status = old.status then return new; end if;

  select count(*),
         count(*) filter (where status in ('reviewed','approved')),
         count(*) filter (where length(trim(coalesce(draft_text,''))) = 0),
         coalesce(sum(length(coalesce(draft_text,''))),0)
    into v_count, v_reviewed, v_empty, v_chars
    from public.author_chapters
   where project_id = new.id
     and owner_user_id = new.owner_user_id;

  if v_count < 3 then v_issues := v_issues || jsonb_build_array('목차가 너무 짧거나 아직 구성되지 않았습니다.'); end if;
  if v_empty > 0 then v_issues := v_issues || jsonb_build_array(v_empty || '개 장에 초고가 없습니다.'); end if;
  if v_reviewed < v_count then v_issues := v_issues || jsonb_build_array((v_count-v_reviewed) || '개 장이 검토 완료되지 않았습니다.'); end if;

  if new.status = 'review' then
    v_readiness := case when jsonb_array_length(v_issues)=0 then 'ready_for_author_approval' else 'revision_required' end;
  elsif new.status = 'author_approved' then
    v_readiness := case when jsonb_array_length(v_issues)=0 then 'ready_for_publish_request' else 'approved_with_gaps' end;
  elsif new.status = 'publish_ready' then
    v_readiness := case when jsonb_array_length(v_issues)=0 then 'books_handoff_ready' else 'publish_blocked' end;
  else
    v_readiness := new.status;
  end if;
  if jsonb_array_length(v_issues)>0 then v_job_status := 'review_required'; end if;

  insert into public.author_events(project_id,owner_user_id,actor,event_type,payload)
  values(new.id,new.owner_user_id,'chief-ai','chief.milestone.reviewed',jsonb_build_object(
    'status',new.status,
    'readiness',v_readiness,
    'chapter_count',v_count,
    'reviewed_chapters',v_reviewed,
    'empty_chapters',v_empty,
    'estimated_words',round(v_chars / 2.3),
    'target_words',new.target_words,
    'issues',v_issues,
    'share_level',new.chief_share_level
  ));

  insert into public.author_agent_jobs(project_id,owner_user_id,agent_role,task_type,instructions,context_scope,status,result_summary)
  values(new.id,new.owner_user_id,'chief-ai','milestone_review','Evaluate workflow readiness from structured metadata only. Do not copy manuscript body into the coordination log.','metadata',v_job_status,v_readiness);

  if new.status = 'publish_ready' then
    insert into public.author_agent_jobs(project_id,owner_user_id,agent_role,task_type,instructions,context_scope,status,result_summary)
    values(new.id,new.owner_user_id,'books','publication_handoff','Prepare an EKODI BOOKS handoff only after the author approval gate.','metadata',case when jsonb_array_length(v_issues)=0 then 'queued' else 'review_required' end,v_readiness);
  end if;
  return new;
end
$$;

drop trigger if exists trg_author_chief_milestone on public.author_projects;
create trigger trg_author_chief_milestone
after update of status on public.author_projects
for each row execute function public.author_chief_milestone();

comment on function public.author_chief_milestone() is 'Chief AI collaboration gate. Stores only structured project readiness and counts, not manuscript body.';
