-- DEV-ONLY. All identities and subscription states below are SYNTHETIC.
-- NEVER run on production. No real checkout or customer data.
begin;
insert into auth.users(id,email,instance_id,aud,role,created_at,updated_at)
values('ffffeeee-0000-4000-8000-000000000121','human-revocation@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now());
insert into public.author_projects(id,owner_user_id,title,creator_mode,status)
values('ffffeeee-0000-4000-8000-000000000221','ffffeeee-0000-4000-8000-000000000121','DEV REVOCATION TEST', 'writer','idea');
insert into public.human_author_subscriptions(owner_user_id,plan_id,status,verified_payment_at,paid_until)
values('ffffeeee-0000-4000-8000-000000000121','writer1','active',now(),now()+interval '2 hours');
set local role authenticated;
select set_config('request.jwt.claim.sub','ffffeeee-0000-4000-8000-000000000121',true);
select set_config('request.jwt.claims','{"sub":"ffffeeee-0000-4000-8000-000000000121","role":"authenticated"}',true);
do $test$
declare v jsonb; e uuid;
begin
 v:=public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000221','dev-revocation-key-1','human');
 e:=(v->>'enrollment_id')::uuid;
 perform set_config('ekodi.test.enrollment_id',e::text,true);
 insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
 values(e,'ffffeeee-0000-4000-8000-000000000121','intent','DEV synthetic','Original private draft');
 if (select count(*) from public.human_author_interview_turns where enrollment_id=e)<>1 then
  raise exception 'valid paid author could not save answer';
 end if;
end $test$;
reset role;
update public.human_author_subscriptions set status='cancelled'
 where owner_user_id='ffffeeee-0000-4000-8000-000000000121';
set local role authenticated;
do $test$
declare e uuid := current_setting('ekodi.test.enrollment_id')::uuid;
begin
 begin
  insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
  values(e,'ffffeeee-0000-4000-8000-000000000121','intent','DEV synthetic','UNAUTHORIZED CANCELLED ANSWER');
  raise exception 'cancelled_paid_append_bypass';
 exception when sqlstate '42501' then null; end;
 if (select count(*) from public.human_author_interview_turns where enrollment_id=e)<>1 then
  raise exception 'old draft lost after cancellation';
 end if;
end $test$;
reset role;
update public.human_author_subscriptions
 set status='active',paid_until=now()-interval '1 minute'
 where owner_user_id='ffffeeee-0000-4000-8000-000000000121';
set local role authenticated;
do $test$
declare e uuid := current_setting('ekodi.test.enrollment_id')::uuid;
begin
 begin
  insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
  values(e,'ffffeeee-0000-4000-8000-000000000121','intent','DEV synthetic','UNAUTHORIZED EXPIRED ANSWER');
  raise exception 'expired_paid_append_bypass';
 exception when sqlstate '42501' then null; end;
end $test$;
reset role;
update public.human_author_subscriptions
 set status='active',paid_until=now()+interval '2 hours'
 where owner_user_id='ffffeeee-0000-4000-8000-000000000121';
update public.human_author_enrollments set status='archived'
 where id=current_setting('ekodi.test.enrollment_id')::uuid;
set local role authenticated;
do $test$
declare e uuid := current_setting('ekodi.test.enrollment_id')::uuid;
begin
 begin
  insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
  values(e,'ffffeeee-0000-4000-8000-000000000121','intent','DEV synthetic','UNAUTHORIZED ARCHIVED ANSWER');
  raise exception 'archived_project_append_bypass';
 exception when sqlstate '42501' then null; end;
 if (select count(*) from public.human_author_interview_turns where enrollment_id=e)<>1 then
  raise exception 'old draft lost after archive';
 end if;
end $test$;
reset role;
update public.human_author_enrollments set status='active'
 where id=current_setting('ekodi.test.enrollment_id')::uuid;
set local role authenticated;
do $test$
declare e uuid := current_setting('ekodi.test.enrollment_id')::uuid;
begin
 insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
 values(e,'ffffeeee-0000-4000-8000-000000000121','revision','DEV synthetic','Valid renewed private draft');
 if (select count(*) from public.human_author_interview_turns where enrollment_id=e)<>2 then
  raise exception 'renewed paid author could not append';
 end if;
end $test$;
reset role;
rollback;
select 'DEV_HUMAN_AUTHOR_REVOKE_E2E_PASSED' as result,
 not exists(select 1 from auth.users where id='ffffeeee-0000-4000-8000-000000000121') as synthetic_user_removed,
 not exists(select 1 from public.author_projects where id='ffffeeee-0000-4000-8000-000000000221') as synthetic_project_removed,
 not exists(select 1 from public.human_author_subscriptions where owner_user_id='ffffeeee-0000-4000-8000-000000000121') as synthetic_subscription_removed,
 not exists(select 1 from public.human_author_enrollments where owner_user_id='ffffeeee-0000-4000-8000-000000000121') as synthetic_enrollment_removed,
 not exists(select 1 from public.human_author_interview_turns where owner_user_id='ffffeeee-0000-4000-8000-000000000121') as synthetic_answers_removed;
