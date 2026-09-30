begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'author_plan_catalog', 'Author plan catalog exists');
select has_table('public', 'author_memberships', 'Author memberships exist');
select has_table('public', 'author_ai_usage', 'Author AI usage ledger exists');
select has_table('public', 'author_ai_quota_cycles', 'Author AI quota cycles exist');

select has_function('public', 'ensure_author_free_membership', array['uuid'], 'free membership bootstrap exists');
select has_function('public', 'author_reserve_ai_units', array['uuid','text','integer'], 'atomic paid AI reservation gate exists');
select has_function('public', 'author_release_ai_units', array['uuid','integer'], 'failed provider calls can release quota');

select ok(
  exists(select 1 from public.author_plan_catalog where plan_code='free' and is_paid=false and monthly_ai_units=0),
  'FREE has exactly zero AI units and is not paid'
);

select ok(
  pg_get_functiondef('public.author_reserve_ai_units(uuid,text,integer)'::regprocedure) like '%v_plan.is_paid is not true%',
  'provider gate requires a paid plan'
);
select ok(
  pg_get_functiondef('public.author_reserve_ai_units(uuid,text,integer)'::regprocedure) like '%billable_ai_enabled is not true%',
  'provider gate requires server-managed billable AI enablement'
);
select ok(
  pg_get_functiondef('public.author_reserve_ai_units(uuid,text,integer)'::regprocedure) like '%paid_until <= now()%',
  'provider gate blocks expired payment access'
);

select ok(
  not has_table_privilege('authenticated', 'public.author_memberships', 'UPDATE'),
  'authenticated clients cannot grant themselves paid membership'
);
select ok(
  not has_table_privilege('authenticated', 'public.author_ai_usage', 'INSERT'),
  'authenticated clients cannot forge AI usage records'
);
select ok(
  not has_function_privilege('authenticated', 'public.author_reserve_ai_units(uuid,text,integer)', 'EXECUTE'),
  'authenticated clients cannot bypass the Edge Function and reserve paid AI directly'
);
select ok(
  has_function_privilege('service_role', 'public.author_reserve_ai_units(uuid,text,integer)', 'EXECUTE'),
  'trusted service role can enforce the AI gate'
);

select * from finish();
rollback;
