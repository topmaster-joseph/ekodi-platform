-- READ ONLY. All flags must be true; no implied permission to
-- activate rewards, promote schema to production or issue financial credits.
select
  exists(select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.ekodi_point_rules')
      and c.conname = 'ekodi_points_no_unverified_active_credit'
      and c.contype = 'c' and c.convalidated
      and pg_get_expr(c.conbin,c.conrelid) =
        '((rule_id <> ''active''::text) OR (enabled = false))')
    as unverified_active_credit_denied,
  exists(select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.ekodi_point_evidence_adapters')
      and c.conname = 'ekodi_points_no_devotion_self_report_credit'
      and c.contype = 'c' and c.convalidated
      and pg_get_expr(c.conbin,c.conrelid) =
        '((adapter <> ''devotion_self_report''::text) OR (enabled = false))')
    as devotion_self_report_credit_denied,
  (select count(*) = 1 from supabase_migrations.schema_migrations
    where version = '20261108224500'
      and name = 'ekodi_points_nonverified_reward_guard') as migration_recorded,
  (select count(*) = 0 from public.ekodi_point_rules
    where rule_id = 'active' and enabled) as active_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_evidence_adapters
    where adapter = 'devotion_self_report' and enabled) as devotional_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_ledger) as ledger_empty,
  (select coalesce(sum(balance),0) = 0 from public.ekodi_point_wallets) as wallets_zero;
