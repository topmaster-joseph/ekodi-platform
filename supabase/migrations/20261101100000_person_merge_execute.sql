-- Owner-decided Person merge, phase 2: owner executes, platform admin reverts.
--
-- What a merge does: the absorbed Person's login identities move to the surviving
-- Person, and the absorbed Person is marked 'merged'. Everything keyed by an auth
-- user (profiles, memberships, activity) follows its login automatically, and each
-- record keeps the login it came from, so per-login history stays visible.
-- Audit logs are history and stay where they were written.
--
-- What it refuses: any payment/subscription/point records, or Person-keyed rows in
-- tables other than login_identities/identity_audit_logs. Those need manual
-- resolution first (verdict needs_resolution) and are never moved automatically.
--
-- The reparent guard is narrowed, not removed: a person_id change is allowed only
-- while this transaction carries a merge request id AND that request row (writable
-- only by service_role / these SECURITY DEFINER functions) authorises exactly that
-- direction — 'approved' for the forward move, 'executed' + listed identity for revert.

create or replace function public.block_unreviewed_person_reparent()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_request uuid;
  v_allowed boolean := false;
begin
  if old.person_id is not distinct from new.person_id then
    return new;
  end if;
  begin
    v_request := nullif(current_setting('ekodi.person_merge_request', true), '')::uuid;
  exception when others then
    v_request := null;
  end;
  if v_request is not null then
    select true into v_allowed
      from public.person_merge_requests r
     where r.id = v_request
       and (
         (r.status = 'approved'
           and r.absorbed_person_id = old.person_id
           and r.survivor_person_id = new.person_id)
         or
         (r.status = 'executed'
           and r.survivor_person_id = old.person_id
           and r.absorbed_person_id = new.person_id
           and exists (select 1 from jsonb_array_elements(coalesce(r.undo -> 'identities', '[]'::jsonb)) e
                        where (e ->> 'id')::uuid = old.id))
       );
  end if;
  if coalesce(v_allowed, false) then
    return new;
  end if;
  raise exception 'account_merge_review_required' using errcode = 'P0001';
end;
$function$;

revoke all on function public.block_unreviewed_person_reparent() from public, anon, authenticated;

-- Person-keyed rows of the absorbed Person outside the two tables a merge handles.
create or replace function public.person_merge_blocking_rows(p_absorbed uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_col record;
  v_n bigint;
  v_out jsonb := '[]'::jsonb;
begin
  for v_col in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.column_name = 'person_id' and c.data_type = 'uuid'
       and c.table_name not in ('login_identities','identity_audit_logs','person_merge_requests')
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where person_id = $1', v_col.table_name)
      into v_n using p_absorbed;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object('table', v_col.table_name, 'rows', v_n);
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.person_merge_blocking_rows(uuid) from public, anon, authenticated;
grant execute on function public.person_merge_blocking_rows(uuid) to service_role;

create or replace function public.person_merge_execute(p_request uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r public.person_merge_requests;
  v_inventory jsonb;
  v_blocking jsonb;
  v_moved jsonb;
  v_prior_status text;
  v_count int;
begin
  select * into r from public.person_merge_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'merge_request_not_found');
  end if;
  -- Only a login of the surviving Person (the owner who proved both accounts) decides.
  if not exists (select 1 from public.login_identities
                  where auth_user_id = p_actor and person_id = r.survivor_person_id and status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'merge_owner_required');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'merge_request_not_pending', 'status', r.status);
  end if;
  if r.expires_at < now() then
    update public.person_merge_requests set status = 'expired' where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'merge_request_expired');
  end if;

  -- Re-check at decision time; data may have changed since the report.
  v_inventory := public.person_merge_inventory(r.survivor_person_id, r.absorbed_person_id);
  v_blocking := public.person_merge_blocking_rows(r.absorbed_person_id);
  if coalesce((v_inventory ->> 'financialTables')::int, 0) > 0 or jsonb_array_length(v_blocking) > 0 then
    update public.person_merge_requests set inventory = v_inventory where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'merge_needs_resolution',
      'inventory', v_inventory, 'blocking', v_blocking);
  end if;

  select status into v_prior_status from public.people where id = r.absorbed_person_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'authUserId', auth_user_id,
           'provider', provider, 'isPrimary', is_primary, 'status', status) order by linked_at), '[]'::jsonb)
    into v_moved
    from public.login_identities where person_id = r.absorbed_person_id;

  update public.person_merge_requests
     set status = 'approved', decided_at = now(), inventory = v_inventory
   where id = r.id;
  perform set_config('ekodi.person_merge_request', r.id::text, true);
  update public.login_identities
     set person_id = r.survivor_person_id, is_primary = false
   where person_id = r.absorbed_person_id;
  get diagnostics v_count = row_count;
  perform set_config('ekodi.person_merge_request', '', true);

  update public.people set status = 'merged', updated_at = now() where id = r.absorbed_person_id;
  update public.person_merge_requests
     set status = 'executed', executed_at = now(),
         undo = jsonb_build_object('identities', v_moved, 'absorbedPriorStatus', v_prior_status)
   where id = r.id;

  insert into public.identity_audit_logs(person_id, auth_user_id, action, metadata) values
    (r.survivor_person_id, p_actor, 'identity.merge_executed',
      jsonb_build_object('mergeRequestId', r.id, 'absorbedPersonId', r.absorbed_person_id, 'identities', v_count)),
    (r.absorbed_person_id, p_actor, 'identity.merged_into',
      jsonb_build_object('mergeRequestId', r.id, 'survivorPersonId', r.survivor_person_id));

  return jsonb_build_object('ok', true, 'moved', v_count);
end;
$$;

revoke all on function public.person_merge_execute(uuid, uuid) from public, anon, authenticated;
grant execute on function public.person_merge_execute(uuid, uuid) to service_role;

-- Platform-admin revert. The caller's authority (verified-Google platform admin) is
-- checked by access-api before this runs; the function itself is service_role only.
create or replace function public.person_merge_revert(p_request uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r public.person_merge_requests;
  v_item jsonb;
  v_count int := 0;
  v_n int;
begin
  select * into r from public.person_merge_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'merge_request_not_found');
  end if;
  if r.status <> 'executed' then
    return jsonb_build_object('ok', false, 'error', 'merge_not_executed', 'status', r.status);
  end if;

  perform set_config('ekodi.person_merge_request', r.id::text, true);
  for v_item in select * from jsonb_array_elements(coalesce(r.undo -> 'identities', '[]'::jsonb)) loop
    update public.login_identities
       set person_id = r.absorbed_person_id, is_primary = coalesce((v_item ->> 'isPrimary')::boolean, false)
     where id = (v_item ->> 'id')::uuid and person_id = r.survivor_person_id;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;
  perform set_config('ekodi.person_merge_request', '', true);

  update public.people
     set status = coalesce(r.undo ->> 'absorbedPriorStatus', 'active'), updated_at = now()
   where id = r.absorbed_person_id;
  update public.person_merge_requests
     set status = 'reverted', reverted_at = now(), reverted_by = p_actor
   where id = r.id;

  insert into public.identity_audit_logs(person_id, auth_user_id, action, metadata) values
    (r.survivor_person_id, p_actor, 'identity.merge_reverted',
      jsonb_build_object('mergeRequestId', r.id, 'absorbedPersonId', r.absorbed_person_id, 'identities', v_count)),
    (r.absorbed_person_id, p_actor, 'identity.merge_reverted',
      jsonb_build_object('mergeRequestId', r.id, 'survivorPersonId', r.survivor_person_id));

  return jsonb_build_object('ok', true, 'restored', v_count);
end;
$$;

revoke all on function public.person_merge_revert(uuid, uuid) from public, anon, authenticated;
grant execute on function public.person_merge_revert(uuid, uuid) to service_role;
