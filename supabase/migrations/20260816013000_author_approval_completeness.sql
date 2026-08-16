-- The author's final approval is meaningful only when every chapter has a non-empty reviewed manuscript.

create or replace function public.author_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
  v_empty integer := 0;
  v_unreviewed integer := 0;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'author_approved' then
    if old.status <> 'review' then
      raise exception 'AUTHOR_APPROVAL_REQUIRES_REVIEW';
    end if;
    select count(*),
           count(*) filter (where length(trim(coalesce(draft_text,''))) = 0),
           count(*) filter (where status not in ('reviewed','approved'))
      into v_count, v_empty, v_unreviewed
      from public.author_chapters
     where project_id = new.id
       and owner_user_id = new.owner_user_id;
    if v_count < 1 or v_empty > 0 or v_unreviewed > 0 then
      raise exception 'AUTHOR_APPROVAL_REQUIRES_COMPLETE_REVIEWED_MANUSCRIPT';
    end if;
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

revoke all on function public.author_status_guard() from public, anon, authenticated;
comment on function public.author_status_guard() is 'Internal Author AI transition gate. Final author approval requires a complete reviewed manuscript; RPC execution revoked.';
