-- Private reconciliation report: detects wallet/ledger drift without altering balances.
-- Service role only. A discrepancy blocks launch until investigated.
create or replace function ekodi_points_private.wallet_reconciliation()
returns table (
  site_id text,
  user_id uuid,
  wallet_balance bigint,
  ledger_balance bigint,
  difference bigint
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select w.site_id, w.user_id, w.balance,
         coalesce(l.total,0)::bigint as ledger_balance,
         (w.balance - coalesce(l.total,0))::bigint as difference
  from public.ekodi_point_wallets w
  left join lateral (
    select sum(e.amount::bigint) as total
    from public.ekodi_point_ledger e
    where e.site_id=w.site_id and e.user_id=w.user_id
  ) l on true
  where w.balance <> coalesce(l.total,0)
$$;
revoke all on function ekodi_points_private.wallet_reconciliation()
  from public,anon,authenticated;
grant execute on function ekodi_points_private.wallet_reconciliation()
  to service_role;
-- Operations: run this report before any production activation and after backfills.
-- No auto-fix: discrepancies require audit review of source events.
