\set ON_ERROR_STOP on

create schema auth;
create table auth.users(id uuid primary key);
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;

insert into auth.users(id) values
('11111111-1111-1111-1111-111111111111'),
('22222222-2222-2222-2222-222222222222'),
('33333333-3333-3333-3333-333333333333');

\ir ../supabase/work-schema.sql

-- Supabase can add explicit anon EXECUTE grants on exposed functions. Simulate it, then verify the hardening migration removes them.
grant execute on function public.work_owns_organization(uuid) to anon;
grant execute on function public.work_owns_job(uuid) to anon;
grant execute on function public.work_get_my_organization() to anon;
grant execute on function public.work_employer_applications() to anon;
grant execute on function public.work_update_application_status(uuid,text) to anon;
\ir ../supabase/work-anon-hardening.sql
\ir ../supabase/work-performance.sql

-- Column and RPC privacy must hold even when public reads are allowed.
do $$
begin
  if has_column_privilege('anon','public.work_organizations','owner_user_id','select') then
    raise exception 'anon can read organization owner UUID';
  end if;
  if has_column_privilege('authenticated','public.work_organizations','owner_user_id','select') then
    raise exception 'authenticated users can read organization owner UUID';
  end if;
  if has_column_privilege('anon','public.work_jobs','created_by','select') then
    raise exception 'anon can read job creator UUID';
  end if;
  if has_function_privilege('anon','public.work_owns_organization(uuid)','execute')
     or has_function_privilege('anon','public.work_owns_job(uuid)','execute')
     or has_function_privilege('anon','public.work_get_my_organization()','execute')
     or has_function_privilege('anon','public.work_employer_applications()','execute')
     or has_function_privilege('anon','public.work_update_application_status(uuid,text)','execute') then
    raise exception 'anon can execute a Work SECURITY DEFINER function';
  end if;
end $$;

-- Employer creates one organization exactly as the browser does: database-generated UUID.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.work_organizations(owner_user_id,name,region)
values('11111111-1111-1111-1111-111111111111','EKODI Test Store','전남 무안군')
returning id as org_id \gset
insert into public.work_jobs(id,organization_id,created_by,title,summary,employment_type,region,wage_type,wage_amount,status,published_at)
values
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',:'org_id','11111111-1111-1111-1111-111111111111','주말 매장 팀원','토요일 저녁 함께 일할 팀원을 찾습니다.','아르바이트','전남 무안군','hourly',12000,'published',now()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',:'org_id','11111111-1111-1111-1111-111111111111','비공개 초안','아직 공개하지 않은 공고입니다.','아르바이트','전남 무안군','negotiable',null,'draft',null);
reset role;

-- Public users see only the published job and only safe organization fields.
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$
declare n integer;
begin
  select count(*) into n from public.work_jobs;
  if n <> 1 then raise exception 'anon published job count expected 1, got %',n; end if;
  perform id,name,region,verified from public.work_organizations;
end $$;
reset role;

-- Applicant creates a private profile and applies.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
insert into public.work_profiles(user_id,display_name,role,region,skills,languages,visa_status,discoverable)
values('22222222-2222-2222-2222-222222222222','지원자 A','seeker','전남 목포시',array['고객응대'],array['한국어'],'',true);
insert into public.work_applications(id,job_id,applicant_user_id,message,status)
values('cccccccc-cccc-cccc-cccc-cccccccccccc','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','22222222-2222-2222-2222-222222222222','토요일 근무 가능합니다.','submitted');
do $$
declare n integer;
begin
  select count(*) into n from public.work_profiles;
  if n <> 1 then raise exception 'applicant cannot read own profile'; end if;
  select count(*) into n from public.work_applications;
  if n <> 1 then raise exception 'applicant cannot read own application'; end if;
end $$;
reset role;

-- A stranger cannot discover the applicant profile or application.
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$
declare n integer;
begin
  select count(*) into n from public.work_profiles;
  if n <> 0 then raise exception 'private Work Profile leaked to unrelated user'; end if;
  select count(*) into n from public.work_applications;
  if n <> 0 then raise exception 'application leaked to unrelated user'; end if;
end $$;
do $$
begin
  begin
    perform public.work_update_application_status('cccccccc-cccc-cccc-cccc-cccccccccccc','accepted');
    raise exception 'unauthorized status update unexpectedly succeeded';
  exception when others then
    if sqlerrm='unauthorized status update unexpectedly succeeded' then raise; end if;
  end;
end $$;
reset role;

-- Employer sees no raw application row, but can use the safe projection and status RPC.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare n integer; applicant_name text;
begin
  select count(*) into n from public.work_applications;
  if n <> 0 then raise exception 'employer can read raw application rows'; end if;
  select count(*),max(applicant_display_name) into n,applicant_name from public.work_employer_applications();
  if n <> 1 or applicant_name <> '지원자 A' then
    raise exception 'employer applicant projection failed: count %, name %',n,applicant_name;
  end if;
end $$;
select * from public.work_update_application_status('cccccccc-cccc-cccc-cccc-cccccccccccc','interview');
reset role;

-- Applicant sees the employer's status change.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
declare s text;
begin
  select status into s from public.work_applications where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  if s <> 'interview' then raise exception 'application status expected interview, got %',s; end if;
end $$;
reset role;

-- RLS must reject ownership forgery.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$
begin
  begin
    insert into public.work_organizations(owner_user_id,name,region)
    values('11111111-1111-1111-1111-111111111111','Forged Org','서울');
    raise exception 'forged organization ownership unexpectedly succeeded';
  exception when others then
    if sqlerrm='forged organization ownership unexpectedly succeeded' then raise; end if;
  end;
end $$;
reset role;

select 'EKODI Work DB integration passed' as result;
