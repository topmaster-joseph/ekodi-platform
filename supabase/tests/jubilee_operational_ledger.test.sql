begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'jubilee_policy_events', 'Jubilee policy audit table exists');
select has_table('public', 'jubilee_support_events', 'Jubilee support event table exists');
select has_table('public', 'jubilee_pool_entries', 'Jubilee Pool ledger table exists');
select has_view('public', 'jubilee_pool_balance_v1', 'Jubilee Pool aggregate balance view exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.jubilee_policy_events'::regclass),
  true,
  'Jubilee policy events enforce RLS'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.jubilee_support_events'::regclass),
  true,
  'Jubilee support events enforce RLS'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.jubilee_pool_entries'::regclass),
  true,
  'Jubilee Pool entries enforce RLS'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('jubilee_policy_events','jubilee_support_events','jubilee_pool_entries')
      and column_name in ('user_id','person_id','beneficiary_id','subject_id','profile_id')
  ),
  'Jubilee operational tables do not store direct beneficiary identity columns'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('jubilee_policy_events','jubilee_support_events','jubilee_pool_entries')
      and (
        column_name like '%vulnerab%'
        or column_name like '%sensitive_trait%'
        or column_name like '%need_signal%'
      )
  ),
  'Jubilee operational tables do not persist vulnerability labels, sensitive traits, or need signals'
);

insert into public.jubilee_pool_entries
  (entry_type, purpose, amount_minor, currency, policy_version, support_ref)
values
  ('platform_allocation', 'access_support', 10000, 'KRW', '1.0.0', null),
  ('voluntary_contribution', 'access_support', 5000, 'KRW', '1.0.0', null),
  ('support_commitment', 'access_support', 3000, 'KRW', '1.0.0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('support_release', 'access_support', 1000, 'KRW', '1.0.0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

select is(
  (select balance_minor from public.jubilee_pool_balance_v1 where currency = 'KRW'),
  13000::bigint,
  'Jubilee Pool balance aggregates inflows, commitments, and releases without beneficiary data'
);

select is(
  has_table_privilege('anon', 'public.jubilee_policy_events', 'SELECT'),
  false,
  'Anonymous browser role cannot read Jubilee policy events directly'
);

select is(
  has_table_privilege('authenticated', 'public.jubilee_support_events', 'SELECT'),
  false,
  'Authenticated browser role cannot read Jubilee support events directly'
);

select is(
  has_table_privilege('authenticated', 'public.jubilee_pool_entries', 'SELECT'),
  false,
  'Authenticated browser role cannot read Jubilee Pool entries directly'
);

select * from finish();
rollback;
