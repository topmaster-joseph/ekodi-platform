-- Strict, read-only RLS/ACL contract; no user records are returned.
select
  (
    select count(*) = 3 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('human_author_subscriptions','human_author_enrollments','human_author_interview_turns')
      and c.relrowsecurity
  ) as all_rls,
  (
    select count(*) = 4 from pg_policies where schemaname='public'
      and tablename in ('human_author_subscriptions','human_author_enrollments','human_author_interview_turns')
  ) as owner_policies,
  not has_table_privilege('authenticated','public.human_author_subscriptions','INSERT') as subscriptions_write_denied,
  not has_table_privilege('authenticated','public.human_author_enrollments','INSERT') as enrollments_write_denied,
  not has_table_privilege('authenticated','public.human_author_subscriptions','UPDATE') as subscription_update_denied,
  not has_table_privilege('anon','public.human_author_interview_turns','SELECT') as anon_read_denied,
  has_table_privilege('authenticated','public.human_author_interview_turns','INSERT') as author_append_allowed,
  not has_function_privilege('anon','public.human_author_reserve_project(uuid,text,text)','EXECUTE') as anon_rpc_denied,
  has_function_privilege('authenticated','public.human_author_reserve_project(uuid,text,text)','EXECUTE') as author_rpc_allowed,
  position('verified_paid_human_subscription_required' in
    pg_get_functiondef('public.human_author_reserve_project(uuid,text,text)'::regprocedure)) > 0 as paid_proof_required,
  position('owner_user_id = v_user' in
    pg_get_functiondef('public.human_author_reserve_project(uuid,text,text)'::regprocedure)) > 0 as user_owner_enforced;
