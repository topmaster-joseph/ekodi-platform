-- AUTH-BILLING-IDENTITY-002: DB-level fail-closed protection for independent
-- EKODI Persons. OAuth link source checks alone have a race: another login
-- might attach the target between its lookup and the service-role RPC.
--
-- Do not transfer Person ownership in a backend transaction until the
-- billing/points/workspace reconciliation protocol has been audited.
-- A reviewed transfer requires an explicit subsequent release, not a
-- client-supplied bypass flag or untrusted PostgreSQL setting.
create or replace function public.block_unreviewed_person_reparent()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if old.person_id is distinct from new.person_id then
    raise exception 'account_merge_review_required'
      using errcode='P0001';
  end if;
  return new;
end;
$function$;

revoke all on function public.block_unreviewed_person_reparent()
  from public, anon, authenticated;

drop trigger if exists block_unreviewed_person_reparent on public.login_identities;
create trigger block_unreviewed_person_reparent
  before update of person_id on public.login_identities
  for each row execute function public.block_unreviewed_person_reparent();

comment on function public.block_unreviewed_person_reparent() is
  'Hard stop for independently registered Person merges; must review external D1 recurring billing, payments, and workspace rights first.';
