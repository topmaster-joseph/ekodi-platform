-- Business OS approval center v1.
-- Keep high-impact actions behind an explicit tenant-local human decision.
-- The approval center exposes only sanitized proposal metadata and never executes
-- an external side effect by itself.

alter table public.business_os_actions
  drop constraint if exists business_os_actions_status_check;

alter table public.business_os_actions
  add constraint business_os_actions_status_check
  check (status in (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'revision_requested',
    'completed',
    'cancelled',
    'blocked'
  ));

create or replace function public.business_os_has_approval_authority(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_person_id uuid;
  v_allowed boolean := false;
begin
  if v_user_id is null or v_email = '' or p_tenant_id is null then
    return false;
  end if;

  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = v_user_id
     and status = 'active'
   limit 1;

  with identity_scope as (
    select lower(li.email) as email
      from public.login_identities li
     where v_person_id is not null
       and li.person_id = v_person_id
       and li.status = 'active'
    union
    select v_email
  )
  select exists (
    select 1
      from public.site_access_registry r
      join identity_scope i on lower(r.email) = i.email
     where r.tenant_id = p_tenant_id
       and r.status = 'active'
       and r.role in ('tenant_admin'::public.app_role, 'store_owner'::public.app_role)
  ) into v_allowed;

  return coalesce(v_allowed, false);
end
$$;

revoke all on function public.business_os_has_approval_authority(uuid) from public, anon, authenticated;

create or replace function public.business_os_pending_approvals(p_workspace_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_scope record;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_scope
    from public.business_os_resolve_scope(p_workspace_key)
   limit 1;

  if v_scope.tenant_id is null then
    raise exception 'workspace_not_found' using errcode = '22023';
  end if;

  if v_scope.store_id is null then
    if not public.has_tenant_access(v_scope.tenant_id) then
      raise exception 'workspace_access_required' using errcode = '42501';
    end if;
  elsif not public.has_store_private_access(v_scope.store_id) then
    raise exception 'workspace_access_required' using errcode = '42501';
  end if;

  if not public.business_os_has_approval_authority(v_scope.tenant_id) then
    raise exception 'approval_authority_required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'actionType', a.action_type,
        'title', a.title,
        'summary', a.summary,
        'priority', a.priority,
        'status', a.status,
        'requestedAt', a.created_at
      ) order by a.created_at desc
    ),
    '[]'::jsonb
  )
    into v_items
    from public.business_os_actions a
   where a.tenant_id = v_scope.tenant_id
     and (v_scope.store_id is null or a.store_id = v_scope.store_id)
     and a.status = 'pending_approval'
     and a.requires_approval = true;

  return jsonb_build_object(
    'workspace', v_scope.workspace_key,
    'count', jsonb_array_length(v_items),
    'items', v_items
  );
end
$$;

revoke all on function public.business_os_pending_approvals(text) from public, anon;
grant execute on function public.business_os_pending_approvals(text) to authenticated;

create or replace function public.business_os_decide_action(p_action_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action public.business_os_actions%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if v_decision not in ('approved','rejected','revision_requested') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into v_action
    from public.business_os_actions
   where id = p_action_id;

  if v_action.id is null then
    raise exception 'action_not_found' using errcode = '22023';
  end if;

  if v_action.store_id is null then
    if not public.has_tenant_access(v_action.tenant_id) then
      raise exception 'workspace_access_required' using errcode = '42501';
    end if;
  elsif not public.has_store_private_access(v_action.store_id) then
    raise exception 'workspace_access_required' using errcode = '42501';
  end if;

  if not public.business_os_has_approval_authority(v_action.tenant_id) then
    raise exception 'approval_authority_required' using errcode = '42501';
  end if;

  if v_action.status <> 'pending_approval' then
    raise exception 'action_not_pending' using errcode = '22023';
  end if;

  update public.business_os_actions
     set status = v_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         updated_at = now()
   where id = p_action_id;

  return jsonb_build_object(
    'id', p_action_id,
    'status', v_decision,
    'executed', false
  );
end
$$;

revoke all on function public.business_os_decide_action(uuid,text) from public, anon;
grant execute on function public.business_os_decide_action(uuid,text) to authenticated;

comment on function public.business_os_pending_approvals(text) is
  'Returns sanitized pending Business OS approval metadata only to tenant-local approvers.';
comment on function public.business_os_decide_action(uuid,text) is
  'Records an explicit tenant-local approval, rejection or revision request. It never executes the external side effect itself.';
