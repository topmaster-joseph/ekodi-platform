-- Ledger is append-only: corrections must be compensating entries.
-- Blocks UPDATE/DELETE, including accidental privileged application writes.
create or replace function ekodi_points_private.reject_ledger_mutation()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'POINT_LEDGER_APPEND_ONLY' using errcode='23514';
end;
$$;
drop trigger if exists ekodi_points_ledger_append_only on public.ekodi_point_ledger;
create trigger ekodi_points_ledger_append_only
before update or delete on public.ekodi_point_ledger
for each row execute function ekodi_points_private.reject_ledger_mutation();
revoke all on function ekodi_points_private.reject_ledger_mutation()
  from public,anon,authenticated;
-- Function remains invocable by the trigger, not exposed as browser RPC.
