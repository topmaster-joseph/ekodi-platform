-- Owner-decided Person merge, phase 1: request + read-only inventory.
--
-- When one person proves two logins that already belong to two independent EKODI
-- Persons, identity-api records a merge request instead of only refusing. Both
-- proofs are verified server-side before the row exists. Nothing is moved here:
-- execution (owner approval) and super-admin revert are a later, separate release,
-- and block_unreviewed_person_reparent stays in force until then.
--
-- Model after execution (documented now so the inventory matches it): one EKODI
-- Person owns rights, roles and balances; every login, access and activity record
-- keeps its originating login identity so per-login history stays visible and an
-- exact revert remains possible.

create table if not exists public.person_merge_requests (
  id uuid primary key default gen_random_uuid(),
  survivor_person_id uuid not null references public.people(id),
  absorbed_person_id uuid not null references public.people(id),
  initiator_user_id uuid not null,
  proven_user_id uuid not null,
  proven_provider text not null check (proven_provider ~ '^[a-z0-9_-]{2,40}$'),
  status text not null default 'pending'
    check (status in ('pending','approved','executed','cancelled','expired','reverted')),
  inventory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  decided_at timestamptz,
  executed_at timestamptz,
  reverted_at timestamptz,
  reverted_by uuid,
  undo jsonb,
  constraint person_merge_distinct check (survivor_person_id <> absorbed_person_id)
);

create unique index if not exists person_merge_requests_one_open
  on public.person_merge_requests(survivor_person_id, absorbed_person_id)
  where status in ('pending','approved');
create index if not exists person_merge_requests_initiator
  on public.person_merge_requests(initiator_user_id, created_at desc);

alter table public.person_merge_requests enable row level security;
revoke all on public.person_merge_requests from public, anon, authenticated;
grant select, insert, update on public.person_merge_requests to service_role;

comment on table public.person_merge_requests is
  'Owner-decided EKODI Person merge requests. Created only after both logins are proven; executed only by the owner; revertible by a platform administrator.';

-- Read-only inventory of everything each Person owns, discovered from the schema
-- so new services are covered automatically. Rows keyed by user ids are matched
-- through every auth user linked to that Person.
create or replace function public.person_merge_inventory(p_survivor uuid, p_absorbed uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_col record;
  v_survivor_users uuid[];
  v_absorbed_users uuid[];
  v_s bigint;
  v_a bigint;
  v_financial boolean;
  v_by_table jsonb := '{}'::jsonb;
  v_items jsonb;
  v_absorbed_rows bigint;
  v_financial_tables int;
begin
  if p_survivor is null or p_absorbed is null or p_survivor = p_absorbed then
    raise exception 'invalid_merge_pair' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(auth_user_id), '{}') into v_survivor_users
    from public.login_identities where person_id = p_survivor;
  select coalesce(array_agg(auth_user_id), '{}') into v_absorbed_users
    from public.login_identities where person_id = p_absorbed;

  for v_col in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.column_name in ('person_id','user_id','auth_user_id')
       and c.data_type = 'uuid'
       and c.table_name not in ('person_merge_requests')
     order by c.table_name, c.column_name
  loop
    if v_col.column_name = 'person_id' then
      execute format('select count(*) from public.%I where %I = $1', v_col.table_name, v_col.column_name)
        into v_s using p_survivor;
      execute format('select count(*) from public.%I where %I = $1', v_col.table_name, v_col.column_name)
        into v_a using p_absorbed;
    else
      execute format('select count(*) from public.%I where %I = any($1)', v_col.table_name, v_col.column_name)
        into v_s using v_survivor_users;
      execute format('select count(*) from public.%I where %I = any($1)', v_col.table_name, v_col.column_name)
        into v_a using v_absorbed_users;
    end if;
    -- A table keyed by both person_id and a user id is reported once, by its larger count.
    if v_a > 0 and coalesce((v_by_table -> v_col.table_name ->> 'absorbedRows')::bigint, -1) < v_a then
      v_financial := v_col.table_name ~ '(order|invoice|payment|refund|credit|billing|subscription|entitlement|membership|wallet|ledger|pass_grant|bank|point|quota)';
      v_by_table := v_by_table || jsonb_build_object(v_col.table_name, jsonb_build_object(
        'table', v_col.table_name, 'column', v_col.column_name,
        'survivorRows', v_s, 'absorbedRows', v_a, 'financial', v_financial));
    end if;
  end loop;

  select coalesce(jsonb_agg(value order by key), '[]'::jsonb),
         coalesce(sum((value ->> 'absorbedRows')::bigint), 0),
         count(*) filter (where (value ->> 'financial')::boolean)
    into v_items, v_absorbed_rows, v_financial_tables
    from jsonb_each(v_by_table);

  return jsonb_build_object(
    'generatedAt', now(),
    'absorbedRows', v_absorbed_rows,
    'financialTables', v_financial_tables,
    'externalBillingChecked', false,
    'verdict', case when v_financial_tables = 0 then 'mergeable' else 'needs_resolution' end,
    'items', v_items);
end;
$$;

revoke all on function public.person_merge_inventory(uuid, uuid) from public, anon, authenticated;
grant execute on function public.person_merge_inventory(uuid, uuid) to service_role;
