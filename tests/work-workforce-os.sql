\set ON_ERROR_STOP on

\ir ../supabase/work-workforce-os.sql

-- New SECURITY DEFINER functions and private columns must stay closed to anonymous users.
do $$
begin
  if has_function_privilege('anon','public.work_my_relationships()','execute') then
    raise exception 'anon can execute work_my_relationships';
  end if;
  if has_column_privilege('anon','public.work_network_requests','requester_user_id','select') then
    raise exception 'anon can read network requester UUID';
  end if;
  if has_column_privilege('authenticated','public.work_quick_hire_requests','created_by','select') then
    raise exception 'authenticated users can read quick hire creator UUID';
  end if;
  if has_column_privilege('authenticated','public.work_relationships','worker_user_id','select') then
    raise exception 'authenticated users can read relationship worker UUID';
  end if;
end $$;

-- Applicant owns a private Work Passport and can submit a network pilot request.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
insert into public.work_passports(user_id,availability_text,preferred_types,mobility_text,experience_summary,alerts_opt_in)
values('22222222-2222-2222-2222-222222222222','평일 18시 이후',array['단기','프로젝트'],'목포·무안','매장 보조 경험',true);
insert into public.work_network_requests(requester_user_id,organization_name,network_type,region,note,status)
values('22222222-2222-2222-2222-222222222222','테스트 기관','institution','전남 목포시','지역 연결 파일럿 검토','submitted');
do $$
declare n integer;
begin
  select count(*) into n from public.work_passports;
  if n <> 1 then raise exception 'owner cannot read own Work Passport'; end if;
  select count(*) into n from public.work_network_requests;
  if n <> 1 then raise exception 'requester cannot read own network request'; end if;
end $$;
reset role;

-- An unrelated user cannot discover private Passport or request rows.
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$
declare n integer;
begin
  select count(*) into n from public.work_passports;
  if n <> 0 then raise exception 'Work Passport leaked to unrelated user'; end if;
  select count(*) into n from public.work_network_requests;
  if n <> 0 then raise exception 'network request leaked to unrelated user'; end if;
  select count(*) into n from public.work_quick_hire_requests;
  if n <> 0 then raise exception 'quick hire request leaked to unrelated user'; end if;
end $$;
reset role;

-- Employer can create one-off Quick Hire requests only for their own organization.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select id as org_id from public.work_get_my_organization() \gset
insert into public.work_quick_hire_requests(organization_id,created_by,brief,urgency,target_date,status)
values(:'org_id','11111111-1111-1111-1111-111111111111','이번 토요일 저녁 매장 보조 1명이 필요합니다.','this_week',current_date + 3,'submitted');
do $$
declare n integer;
begin
  select count(*) into n from public.work_quick_hire_requests;
  if n <> 1 then raise exception 'employer cannot read own Quick Hire request'; end if;
end $$;

-- Accepting an application creates the first durable Work Graph relationship.
select * from public.work_update_application_status('cccccccc-cccc-cccc-cccc-cccccccccccc','accepted');
do $$
declare n integer; s text;
begin
  select count(*),max(status) into n,s from public.work_relationships;
  if n <> 1 or s <> 'accepted' then
    raise exception 'accepted relationship not captured: count %, status %',n,s;
  end if;
end $$;
reset role;

-- The worker sees only a safe relationship projection, not employer/worker UUID internals.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare n integer; title text;
begin
  select count(*),max(job_title) into n,title from public.work_my_relationships();
  if n <> 1 or title <> '주말 매장 팀원' then
    raise exception 'Work relationship projection failed: count %, title %',n,title;
  end if;
end $$;
reset role;

-- Public network discovery remains safe and empty until an operator explicitly publishes a pilot/active network.
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$
declare n integer;
begin
  select count(*) into n from public.work_networks;
  if n <> 0 then raise exception 'unexpected public network seed found'; end if;
end $$;
reset role;

select 'EKODI Work Workforce OS integration passed' as result;
