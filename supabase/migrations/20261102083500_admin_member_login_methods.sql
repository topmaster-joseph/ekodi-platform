-- Step-up proof is stored server-side and is never an authorization claim from the browser.
create table if not exists public.identity_admin_step_ups(
  auth_user_id uuid primary key,
  verified_person_id uuid not null references public.people(id),
  session_hash text not null,
  verified_at timestamptz not null default now()
);
alter table public.identity_admin_step_ups enable row level security;
revoke all on table public.identity_admin_step_ups from public,anon,authenticated;
grant select,insert,update,delete on table public.identity_admin_step_ups to service_role;

-- Non-destructive, service-role-only administrative identity actions.
-- API must verify the current actor's Person-bound Google administrator grant and fresh step-up.
create or replace function public.admin_disconnect_person_identity(p_identity uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  li public.login_identities;
  v_count integer;
  v_name text;
  v_new uuid;
  v_detach uuid;
begin
  if length(btrim(coalesce(p_reason,''))) not between 5 and 500 then
    return jsonb_build_object('ok',false,'error','reason_required');
  end if;
  select * into li from public.login_identities where id=p_identity and status='active';
  if not found then return jsonb_build_object('ok',false,'error','identity_not_found'); end if;
  -- Serialize every detach for the same Person before rechecking primary/last.
  select display_name into v_name from public.people where id=li.person_id for update;
  select * into li from public.login_identities where id=p_identity and status='active' for update;
  if not found then return jsonb_build_object('ok',false,'error','identity_not_found'); end if;
  select count(*) into v_count from public.login_identities where person_id=li.person_id and status='active';
  if v_count<=1 then return jsonb_build_object('ok',false,'error','last_identity_cannot_disconnect'); end if;
  if li.is_primary then return jsonb_build_object('ok',false,'error','primary_identity_cannot_disconnect'); end if;

  -- Reuse the approved detachment guard. Only this identity's Person foreign key
  -- moves; billing, subscriptions, points, profiles and memberships remain intact.
  insert into public.people(display_name) values(v_name) returning id into v_new;
  insert into public.person_identity_detachments
    (person_id,identity_id,new_person_id,actor_auth_user_id,policy_version,preview)
    values(li.person_id,li.id,v_new,p_actor,'admin-login-method-v1',
      jsonb_build_object('financeMoved',false,'identityOnly',true,'reason',btrim(p_reason)))
    returning id into v_detach;
  perform set_config('ekodi.person_identity_detach',v_detach::text,true);
  update public.login_identities set person_id=v_new,is_primary=true where id=li.id;
  perform set_config('ekodi.person_identity_detach','',true);
  update public.person_identity_detachments set status='executed',executed_at=now() where id=v_detach;

  insert into public.identity_audit_logs(person_id,auth_user_id,action,provider,identity_id,metadata)
  values
    (li.person_id,p_actor,'identity.admin_disconnected',li.provider,li.id,
      jsonb_build_object('reason',btrim(p_reason),'targetPersonId',li.person_id,
        'targetIdentityId',li.id,'newPersonId',v_new,'detachmentId',v_detach,'actorAuthUserId',p_actor)),
    (v_new,p_actor,'identity.admin_disconnected_from',li.provider,li.id,
      jsonb_build_object('reason',btrim(p_reason),'fromPersonId',li.person_id,
        'targetIdentityId',li.id,'detachmentId',v_detach,'actorAuthUserId',p_actor));
  return jsonb_build_object('ok',true,'personId',li.person_id,'identityId',li.id,
    'newPersonId',v_new,'detachmentId',v_detach);
end $$;
revoke all on function public.admin_disconnect_person_identity(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_disconnect_person_identity(uuid,uuid,text) to service_role;

-- Single transaction: the existing history-preserving revert plus mandatory reason.
-- Neither procedure touches payment, subscription or point tables.
create or replace function public.admin_person_merge_revert(p_request uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare r public.person_merge_requests; v_result jsonb;
begin
  if length(btrim(coalesce(p_reason,''))) not between 5 and 500 then
    return jsonb_build_object('ok',false,'error','reason_required');
  end if;
  select * into r from public.person_merge_requests where id=p_request for update;
  if not found then return jsonb_build_object('ok',false,'error','merge_request_not_found'); end if;
  if r.status <> 'executed' then return jsonb_build_object('ok',false,'error','merge_not_executed'); end if;
  v_result:=public.person_merge_revert(p_request,p_actor);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  insert into public.identity_audit_logs(person_id,auth_user_id,action,metadata)
    values(r.survivor_person_id,p_actor,'identity.admin_merge_reverted',
       jsonb_build_object('reason',btrim(p_reason),'mergeRequestId',p_request,
         'targetPersonId',r.survivor_person_id,'absorbedPersonId',r.absorbed_person_id,
         'identityIds',(select coalesce(jsonb_agg(item ->> 'id'),'[]'::jsonb)
                         from jsonb_array_elements(coalesce(r.undo -> 'identities','[]'::jsonb)) item),
         'actorAuthUserId',p_actor));
  return v_result;
end $$;
revoke all on function public.admin_person_merge_revert(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_person_merge_revert(uuid,uuid,text) to service_role;
