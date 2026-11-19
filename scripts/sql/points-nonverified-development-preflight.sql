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
    where name like '%_ekodi_points_%'
       or name like '%_ekodi_site_activity_points_%'
       or name like 'ekodi_points_%'
       or name like 'ekodi_site_activity_points_%') as previous_20_recorded,
  (select count(*) = 0 from supabase_migrations.schema_migrations
    where version = '20261108224500'
       or name like '%ekodi_points_nonverified_reward_guard%') as guard_not_recorded,
  (select count(*) = 0 from pg_constraint c
    where c.conname in ('ekodi_points_no_unverified_active_credit',
                        'ekodi_points_no_devotion_self_report_credit')) as no_partial_guard,
  (select count(*) = 0 from public.ekodi_point_rules
    where rule_id = 'active' and enabled) as active_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_evidence_adapters
    where adapter = 'devotion_self_report' and enabled) as devotional_credit_disabled,
  (select count(*) = 0 from public.ekodi_point_ledger) as ledger_empty,
  (select coalesce(sum(balance),0) = 0 from public.ekodi_point_wallets) as wallets_zero,
  (select count(*) = 0 from public.ekodi_point_sites
    where site_id like 'e2e-%') as no_e2e_sites;
