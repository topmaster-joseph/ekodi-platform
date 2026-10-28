-- EKODI Human Author: DEV-ONLY transactional RLS acceptance.
-- Requires SQL editor/DB client admin in the DEVELOPMENT project.
-- NEVER run this script on production: it creates synthetic auth users,
-- owned projects and one temporary artificial "verified" paid subscription.
-- Everything is rolled back; NO real payment, order, or customer is involved.
begin;
insert into auth.users(id,email,instance_id,aud,role,created_at,updated_at) values
 ('ffffeeee-0000-4000-8000-000000000101','ekodi-human-rls-a@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now()),
 ('ffffeeee-0000-4000-8000-000000000102','ekodi-human-rls-b@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now());
insert into public.author_projects(id,owner_user_id,title,creator_mode,status) values
 ('ffffeeee-0000-4000-8000-000000000201','ffffeeee-0000-4000-8000-000000000101','DEV FREE A FIRST','writer','idea'),
 ('ffffeeee-0000-4000-8000-000000000202','ffffeeee-0000-4000-8000-000000000101','DEV FREE A SECOND','writer','idea'),
 ('ffffeeee-0000-4000-8000-000000000203','ffffeeee-0000-4000-8000-000000000102','DEV PAID B FIRST','writer','idea'),
 ('ffffeeee-0000-4000-8000-000000000204','ffffeeee-0000-4000-8000-000000000102','DEV PAID B SECOND','writer','idea'),
 ('ffffeeee-0000-4000-8000-000000000205','ffffeeee-0000-4000-8000-000000000102','DEV PAID B THIRD','writer','idea'),
 ('ffffeeee-0000-4000-8000-000000000206','ffffeeee-0000-4000-8000-000000000102','DEV PAID B FOURTH','writer','idea');
insert into public.human_author_subscriptions(owner_user_id,plan_id,status,verified_payment_at,paid_until) values
 ('ffffeeee-0000-4000-8000-000000000101','writer1','pending',null,null),
 ('ffffeeee-0000-4000-8000-000000000102','writer3','active',now(),now()+interval '1 month');

-- Authentication is simulated only for PostgreSQL test assertions.
set local role authenticated;
select set_config('request.jwt.claim.sub','ffffeeee-0000-4000-8000-000000000101',true);
select set_config('request.jwt.claims','{"sub":"ffffeeee-0000-4000-8000-000000000101","role":"authenticated"}',true);
do $test$
declare v jsonb; first_free uuid;
begin
 if auth.uid()<>'ffffeeee-0000-4000-8000-000000000101'::uuid then raise exception 'owner A context failed'; end if;
 v:=public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000201','free-A-test-key-01','simple');
 if v->>'plan_id'<>'free' or v->>'idempotent'<>'false' then raise exception 'free quota first project broken'; end if;
 first_free:=(v->>'enrollment_id')::uuid;
 v:=public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000201','free-A-test-key-01','simple');
 if v->>'idempotent'<>'true' then raise exception 'idempotent replay failed'; end if;
 begin
   perform public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000202','free-A-test-key-02','simple');
   raise exception 'free-quota-bypass';
 exception when others then if sqlerrm<>'monthly_human_author_project_limit_reached' then raise; end if; end;
 begin
   perform public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000202','human-A-test-key-01','human');
   raise exception 'unverified-payment-bypass';
 exception when others then if sqlerrm<>'verified_paid_human_subscription_required' then raise; end if; end;
 begin
   perform public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000203','foreign-project-key','simple');
   raise exception 'foreign-project-bypass';
 exception when others then if sqlerrm<>'owned_writer_project_required' then raise; end if; end;
 begin
   insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
   values (first_free,'ffffeeee-0000-4000-8000-000000000101','intent','synthetic question','should be denied for free simple');
   raise exception 'simple-interview-bypass';
 exception when sqlstate '42501' then null; end;
 if has_table_privilege('authenticated','public.human_author_subscriptions','INSERT')
    or has_table_privilege('authenticated','public.human_author_enrollments','INSERT')
    or has_table_privilege('authenticated','public.human_author_interview_turns','UPDATE')
 then raise exception 'private writer ACL privilege leak'; end if;
end $test$;

select set_config('request.jwt.claim.sub','ffffeeee-0000-4000-8000-000000000102',true);
select set_config('request.jwt.claims','{"sub":"ffffeeee-0000-4000-8000-000000000102","role":"authenticated"}',true);
do $test$
declare v jsonb; e uuid; i integer;
begin
 if auth.uid()<>'ffffeeee-0000-4000-8000-000000000102'::uuid then raise exception 'owner B context failed'; end if;
 for i in 203..205 loop
   v:=public.human_author_reserve_project(('ffffeeee-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'human-B-test-key-'||i,'human');
   if v->>'plan_id'<>'writer3' then raise exception 'writer3 verified entitlement not recognized'; end if;
   if i=203 then e:=(v->>'enrollment_id')::uuid; end if;
 end loop;
 begin
   perform public.human_author_reserve_project('ffffeeee-0000-4000-8000-000000000206','human-B-test-key-206','human');
   raise exception 'writer3-fourth-project-bypass';
 exception when others then if sqlerrm<>'monthly_human_author_project_limit_reached' then raise; end if; end;
 if (select count(*) from public.human_author_enrollments where owner_user_id='ffffeeee-0000-4000-8000-000000000102' and writing_mode='human')<>3 then raise exception 'writer3 allocation mode mismatch'; end if;
 insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
 values(e,'ffffeeee-0000-4000-8000-000000000102','intent','test question','private synthetic answer');
 if (select count(*) from public.human_author_interview_turns where enrollment_id=e)<>1
 then raise exception 'owner interview append/read failed'; end if;
 perform set_config('ekodi.test.human_enrollment_id',e::text,true);
end $test$;

select set_config('request.jwt.claim.sub','ffffeeee-0000-4000-8000-000000000101',true);
select set_config('request.jwt.claims','{"sub":"ffffeeee-0000-4000-8000-000000000101","role":"authenticated"}',true);
do $test$
begin
 if exists(select 1 from public.human_author_interview_turns where owner_user_id='ffffeeee-0000-4000-8000-000000000102')
  or exists(select 1 from public.human_author_enrollments where owner_user_id='ffffeeee-0000-4000-8000-000000000102')
  or exists(select 1 from public.human_author_subscriptions where owner_user_id='ffffeeee-0000-4000-8000-000000000102')
 then raise exception 'foreign owner data visible'; end if;
 begin
   insert into public.human_author_interview_turns(enrollment_id,owner_user_id,stage,question,author_answer)
   values(current_setting('ekodi.test.human_enrollment_id')::uuid,'ffffeeee-0000-4000-8000-000000000101','intent','foreign question','must fail');
   raise exception 'cross-account-interview-insert-bypass';
 exception when sqlstate '42501' then null; end;
end $test$;
reset role;
rollback;

-- If any assertion above failed, execution stops without this pass record.
select 'DEV_ROLLBACK_HUMAN_AUTHOR_RLS_E2E_PASSED' as status,
 not exists(select 1 from auth.users where id in ('ffffeeee-0000-4000-8000-000000000101','ffffeeee-0000-4000-8000-000000000102')) as synthetic_users_removed,
 not exists(select 1 from public.author_projects where id='ffffeeee-0000-4000-8000-000000000201') as projects_removed,
 not exists(select 1 from public.human_author_enrollments where owner_user_id in ('ffffeeee-0000-4000-8000-000000000101','ffffeeee-0000-4000-8000-000000000102')) as enrollments_removed,
 not exists(select 1 from public.human_author_interview_turns where owner_user_id in ('ffffeeee-0000-4000-8000-000000000101','ffffeeee-0000-4000-8000-000000000102')) as answers_removed,
 not exists(select 1 from public.human_author_subscriptions where owner_user_id in ('ffffeeee-0000-4000-8000-000000000101','ffffeeee-0000-4000-8000-000000000102')) as subscriptions_removed;
