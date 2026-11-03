-- Owner self-service detach of one login from a unified EKODI Person (merge policy v1).
--
-- Policy (owner decision 2026-11-02): a merge is not undone by moving money or points.
--  * The detached login starts a NEW, separate EKODI Person. The unified Person keeps
--    its EKODI ID, every other login, and everything keyed to the Person.
--  * Rows keyed to the detached login itself (its own profile, memberships, activity)
--    travel with that login, exactly as they arrived with it at merge time.
--  * A login that carries payment / subscription / point records is NOT detachable by
--    the owner: money is never split or refunded by a detach. Those stay with the
--    unified ID; a platform admin handles exceptions.
--  * The owner cannot detach the login they are signed in with, the primary login,
--    or the last active login.
-- The reparent guard is narrowed once more: a person_id change is also allowed while
-- the transaction names an 'approved' detachment row for exactly that identity/direction.

create table if not exists public.person_identity_detachments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  identity_id uuid not null references public.login_identities(id),
  new_person_id uuid not null references public.people(id),
  actor_auth_user_id uuid not null,
  policy_version text not null,
  status text not null default 'approved' check (status in ('approved','executed')),
  preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);
alter table public.person_identity_detachments enable row level security;
revoke all on table public.person_identity_detachments from public, anon, authenticated, service_role;
grant select, insert, update on table public.person_identity_detachments to service_role;

create or replace function public.block_unreviewed_person_reparent()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_request uuid;
  v_detach uuid;
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
  if not coalesce(v_allowed, false) then
    begin
      v_detach := nullif(current_setting('ekodi.person_identity_detach', true), '')::uuid;
    exception when others then
      v_detach := null;
    end;
    if v_detach is not null then
      select true into v_allowed
        from public.person_identity_detachments d
       where d.id = v_detach and d.status = 'approved'
         and d.identity_id = old.id
         and d.person_id = old.person_id
         and d.new_person_id = new.person_id;
    end if;
  end if;
  if coalesce(v_allowed, false) then
    return new;
  end if;
  raise exception 'account_merge_review_required' using errcode = 'P0001';
end;
$function$;

revoke all on function public.block_unreviewed_person_reparent() from public, anon, authenticated;

-- What leaves with a login if it is detached. Read-only; shown to the owner first.
create or replace function public.person_identity_detach_preview(p_identity uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_auth uuid;
  v_col record;
  v_n bigint;
  v_by_table jsonb := '{}'::jsonb;
  v_items jsonb;
  v_rows bigint;
  v_financial int;
begin
  select auth_user_id into v_auth from public.login_identities where id = p_identity;
  if v_auth is null then
    return jsonb_build_object('ok', false, 'error', 'identity_not_found');
  end if;
  for v_col in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.column_name in ('user_id','auth_user_id') and c.data_type = 'uuid'
       and c.table_name not in ('login_identities','identity_audit_logs','person_merge_requests','person_identity_detachments')
     order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I = $1', v_col.table_name, v_col.column_name)
      into v_n using v_auth;
    if v_n > 0 and coalesce((v_by_table -> v_col.table_name ->> 'rows')::bigint, -1) < v_n then
      v_by_table := v_by_table || jsonb_build_object(v_col.table_name, jsonb_build_object(
        'table', v_col.table_name, 'rows', v_n,
        'financial', v_col.table_name ~ '(order|invoice|payment|refund|credit|billing|subscription|entitlement|membership|wallet|ledger|pass_grant|bank|point|quota)'));
    end if;
  end loop;
  select coalesce(jsonb_agg(value order by key), '[]'::jsonb),
         coalesce(sum((value ->> 'rows')::bigint), 0),
         count(*) filter (where (value ->> 'financial')::boolean)
    into v_items, v_rows, v_financial
    from jsonb_each(v_by_table);
  return jsonb_build_object('ok', true, 'rows', v_rows, 'financialTables', v_financial,
    'verdict', case when v_financial = 0 then 'detachable' else 'financial_records_stay' end,
    'items', v_items);
end;
$$;

revoke all on function public.person_identity_detach_preview(uuid) from public, anon, authenticated;
grant execute on function public.person_identity_detach_preview(uuid) to service_role;

create or replace function public.person_identity_detach(p_identity uuid, p_actor uuid, p_policy text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  li public.login_identities;
  v_actor_person uuid;
  v_active int;
  v_preview jsonb;
  v_new uuid;
  v_detach uuid;
  v_name text;
begin
  if p_policy is distinct from 'merge-policy-v1' then
    return jsonb_build_object('ok', false, 'error', 'policy_acknowledgement_required');
  end if;
  select * into li from public.login_identities where id = p_identity for update;
  if not found or li.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'identity_not_found');
  end if;
  select person_id into v_actor_person from public.login_identities
   where auth_user_id = p_actor and status = 'active' limit 1;
  if v_actor_person is distinct from li.person_id then
    return jsonb_build_object('ok', false, 'error', 'detach_owner_required');
  end if;
  if li.auth_user_id = p_actor then
    return jsonb_build_object('ok', false, 'error', 'detach_current_login');
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
    values (li.person_id, li.id, v_new, p_actor, p_policy, v_preview) returning id into v_detach;

  perform set_config('ekodi.person_identity_detach', v_detach::text, true);
  update public.login_identities set person_id = v_new, is_primary = true where id = li.id;
  perform set_config('ekodi.person_identity_detach', '', true);

  update public.person_identity_detachments set status = 'executed', executed_at = now() where id = v_detach;
  insert into public.identity_audit_logs(person_id, auth_user_id, action, provider, identity_id, metadata) values
    (li.person_id, p_actor, 'identity.detached', li.provider, li.id,
      jsonb_build_object('detachmentId', v_detach, 'newPersonId', v_new, 'policy', p_policy, 'rows', v_preview -> 'rows')),
    (v_new, p_actor, 'identity.detached_from', li.provider, li.id,
      jsonb_build_object('detachmentId', v_detach, 'fromPersonId', li.person_id));

  return jsonb_build_object('ok', true, 'detachmentId', v_detach, 'newPersonId', v_new);
end;
$$;

revoke all on function public.person_identity_detach(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.person_identity_detach(uuid, uuid, text) to service_role;
