-- READ ONLY. Only the fixed EKODI Development project may be inspected.
-- Any incomplete schema, existing award, partial constraint or migration
-- mismatch must block this owner-approved forward-only release.
select
  to_regclass('public.ekodi_point_sites') is not null
    and to_regclass('public.ekodi_point_rules') is not null
    and to_regclass('public.ekodi_point_evidence_adapters') is not null
    and to_regclass('public.ekodi_point_ledger') is not null
    and to_regclass('public.ekodi_point_wallets') is not null as required_tables,
  (select count(*) = 20 from supabase_migrations.schema_migrations
    where (name like '%_ekodi_points_%'
       or name like '%_ekodi_site_activity_points_%'
       or name like 'ekodi_points_%'
       or name like 'ekodi_site_activity_points_%')
      and version <> '20261108224500'
      and name not like '%ekodi_points_nonverified_reward_guard%') as previous_20_recorded,
  (select count(*) = 0 from supabase_migrations.schema_migrations
    where version = '20261108224500'
       or name like '%ekodi_points_nonverified_reward_guard%') as guard_not_recorded,
  (select count(*) = 1 from supabase_migrations.schema_migrations
    where version = '20261108224500'
      and name = 'ekodi_points_nonverified_reward_guard') as guard_recorded,
  (select count(*) = 0 from pg_constraint c
    where c.conname in ('ekodi_points_no_unverified_active_credit',
                        'ekodi_points_no_devotion_self_report_credit')) as no_partial_guard,
  -- Recognize existing installation only if both exact canonical CHECKs are
  -- validated. Missing, partially applied or weakened guards fail closed.
  (exists(select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.ekodi_point_rules')
      and c.conname = 'ekodi_points_no_unverified_active_credit'
      and c.contype = 'c' and c.convalidated
      and pg_get_expr(c.conbin,c.conrelid) =
        '((rule_id <> ''active''::text) OR (enabled = false))')
   and exists(select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.ekodi_point_evidence_adapters')
      and c.conname = 'ekodi_points_no_devotion_self_report_credit'
      and c.contype = 'c' and c.convalidated
      and pg_get_expr(c.conbin,c.conrelid) =
        '((adapter <> ''devotion_self_report''::text) OR (enabled = false))'))
    as guards_verified,
  (select count(*) = 0 from public.ekodi_point_rules
    where rule_id = 'active' and enabled) as active_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_evidence_adapters
    where adapter = 'devotion_self_report' and enabled) as devotional_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_ledger) as ledger_empty,
  (select coalesce(sum(balance),0) = 0 from public.ekodi_point_wallets) as wallets_zero,
  (select count(*) = 0 from public.ekodi_point_sites
    where site_id like 'e2e-%') as no_e2e_sites;
