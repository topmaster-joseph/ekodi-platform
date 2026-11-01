-- Read-only production/dev acceptance: privacy and VERIFIED active write grant.
-- Returns ONLY boolean metadata; never reads or returns any author content.
select
 (select count(*) = 1
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'human_author_interview_turns'
    and p.policyname = 'human_author_interview_owner_append'
    and p.cmd = 'INSERT'
    and p.with_check like '%human_author_subscriptions s%'
    and p.with_check like '%s.plan_id = e.plan_id%'
    and p.with_check like '%e.status = ''active''%'
    and p.with_check like '%s.status = ''active''%'
    and p.with_check like '%s.verified_payment_at IS NOT NULL%'
    and p.with_check like '%s.paid_until > now()%'
    and p.with_check like '%e.owner_user_id =%'
 ) as revocation_guard,
 (select count(*) = 1
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'human_author_interview_turns'
    and p.policyname = 'human_author_interview_owner_read'
    and p.cmd = 'SELECT'
    and p.qual like '%owner_user_id%'
    and p.qual like '%auth.uid()%'
 ) as owner_history_readable,
 not has_table_privilege('authenticated','public.human_author_interview_turns','UPDATE') as append_only,
 not has_table_privilege('authenticated','public.human_author_subscriptions','INSERT') as no_self_entitlement;
