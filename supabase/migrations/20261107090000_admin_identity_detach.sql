-- Owner decision 2026-11-07: a verified-Google platform administrator may detach one
-- login from a member's EKODI account (site administrators only view). The same rules as
-- the owner's own detach apply: never the primary login, never the last login, never when
-- payment/subscription/point records would be split. A written reason is mandatory and the
-- action is audited on both Persons. Authority (platform admin + recent sign-in) is checked
-- by access-api before this runs; the function itself is service_role only.
create or replace function public.person_identity_admin_detach(p_identity uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  li public.login_identities;
  v_active int;
  v_preview jsonb;
  v_new uuid;
  v_detach uuid;
  v_name text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into li from public.login_identities where id = p_identity for update;
  if not found or li.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'identity_not_found');
  end if;
  if li.is_primary then
    return jsonb_build_object('ok', false, 'error', 'detach_primary_login');
  end if;
  select count(*) into v_active from public.login_identities
   where person_id = li.person_id and status = 'active';
  if v_active < 2 then
    return jsonb_build_object('ok', false, 'error', 'detach_last_login');
  end if;
  v_preview := public.person_identity_detach_preview(p_identity);
  if coalesce((v_preview ->> 'financialTables')::int, 0) > 0 then
    return jsonb_build_object('ok', false, 'error', 'detach_financial_records', 'preview', v_preview);
  end if;

  select display_name into v_name from public.people where id = li.person_id;
  insert into public.people(display_name) values (v_name) returning id into v_new;
  insert into public.person_identity_detachments(person_id, identity_id, new_person_id, actor_auth_user_id, policy_version, preview)
    values (li.person_id, li.id, v_new, p_actor, 'admin-detach-v1', v_preview) returning id into v_detach;

  perform set_config('ekodi.person_identity_detach', v_detach::text, true);
  update public.login_identities set person_id = v_new, is_primary = true where id = li.id;
  perform set_config('ekodi.person_identity_detach', '', true);

  update public.person_identity_detachments set status = 'executed', executed_at = now() where id = v_detach;
  insert into public.identity_audit_logs(person_id, auth_user_id, action, provider, identity_id, metadata) values
    (li.person_id, p_actor, 'admin.identity_detached', li.provider, li.id,
      jsonb_build_object('detachmentId', v_detach, 'newPersonId', v_new, 'reason', left(v_reason, 500), 'rows', v_preview -> 'rows')),
    (v_new, p_actor, 'admin.identity_detached_from', li.provider, li.id,
      jsonb_build_object('detachmentId', v_detach, 'fromPersonId', li.person_id, 'reason', left(v_reason, 500)));

  return jsonb_build_object('ok', true, 'detachmentId', v_detach, 'newPersonId', v_new);
end;
$$;

revoke all on function public.person_identity_admin_detach(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.person_identity_admin_detach(uuid, uuid, text) to service_role;
