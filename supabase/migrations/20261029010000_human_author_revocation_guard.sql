-- EKODI Human Author: only an active, VERIFIED paid term can append new
-- interview answers. Owner may still read preexisting private answers after
-- cancellation, expiration, chargeback or archive. Do not erase user work.
-- No payment enrollment is created; existing plan ownership is not upgraded.
begin;
alter policy human_author_interview_owner_append
  on public.human_author_interview_turns
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1
      from public.human_author_enrollments e
      join public.human_author_subscriptions s
        on s.owner_user_id = e.owner_user_id
       and s.plan_id = e.plan_id
      where e.id = enrollment_id
        and e.owner_user_id = (select auth.uid())
        and e.writing_mode = 'human'
        and e.status = 'active'
        and s.status = 'active'
        and s.verified_payment_at is not null
        and s.paid_until > now()
    )
  );
commit;
