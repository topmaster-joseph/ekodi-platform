-- Prevent configurations that can fail at ledger insertion.
-- Foundation permits zero-point rules, but the ledger rejects amount=0.
-- Reject invalid policy rows before activating any site.
alter table public.ekodi_point_rules
  add constraint ekodi_point_rules_positive_awards check (points > 0);
-- Transfer credit must fit the signed integer ledger amount column.
-- Keep rate multiplication in bigint; existing transfer function checks
-- v_credit bounds but must never overflow when cast to integer.
create or replace function ekodi_points_private.validate_transfer_rate()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.numerator <= 0 or new.denominator <= 0
     or new.numerator::bigint * 100000 > 2147483647::bigint * new.denominator::bigint then
    raise exception 'INVALID_TRANSFER_POLICY_RATE';
  end if;
  return new;
end;
$$;
drop trigger if exists ekodi_point_transfer_rate_guard on public.ekodi_point_transfer_policies;
create trigger ekodi_point_transfer_rate_guard
before insert or update on public.ekodi_point_transfer_policies
for each row execute function ekodi_points_private.validate_transfer_rate();
revoke all on function ekodi_points_private.validate_transfer_rate()
  from public,anon,authenticated;
