begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(to_regprocedure('public.church_pastor_count(text,text,uuid,boolean,text)') is not null,'pastor exact-count RPC exists');
select ok(not has_function_privilege('anon','public.church_pastor_count(text,text,uuid,boolean,text)','EXECUTE'),'anon cannot execute pastor count RPC');
select ok(not has_function_privilege('authenticated','public.church_pastor_count(text,text,uuid,boolean,text)','EXECUTE'),'authenticated cannot execute pastor count RPC directly');
select ok(has_function_privilege('service_role','public.church_pastor_count(text,text,uuid,boolean,text)','EXECUTE'),'service role can execute pastor count RPC');

insert into auth.users(id,email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pastor-rpc@invalid.test');
insert into public.tenants(id,slug,name,kind,status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','RPC Test Church','church','active');
insert into church.staff(tenant_id,church_slug,user_id,role,active)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','senior_pastor',true);
insert into church_private.members(tenant_id,church_slug,full_name,status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','Active Member','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','Inactive Member','inactive');
insert into church_private.care_tasks(tenant_id,church_slug,subject_name,status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','Open Care','open'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','Progress Care','in_progress'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','Done Care','done');
insert into church.services(tenant_id,church_slug,service_date,title,status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','2026-09-10','Later','draft'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rpc-test-church','2026-09-01','Earlier','draft');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"service_role"}',true);
set local role service_role;
select is(public.church_pastor_count('church_members','rpc-test-church','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'active'),1::bigint,'exact count supports equality status filter');
select is(public.church_pastor_count('church_care_tasks','rpc-test-church','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'in.(open,in_progress)'),2::bigint,'exact count supports PostgREST in status filter');
select is(public.church_pastor_list('church_services','rpc-test-church','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,null,null,'service_date.asc',1)->0->>'title','Earlier','list RPC honors ascending service date before limit');
reset role;

select * from finish();
rollback;