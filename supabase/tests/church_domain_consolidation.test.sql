begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select has_schema('church','church schema exists');
select has_schema('church_private','church_private schema exists');
select has_table('church','staff','church staff table exists');
select has_table('church','services','church services table exists');
select has_table('church_private','members','private church members table exists');
select has_table('church_private','care_tasks','private church care table exists');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='church_private' and c.relname='members'),'member PII has RLS enabled');
select ok(not has_table_privilege('anon','church_private.members','SELECT'),'anon cannot read member PII');

insert into auth.users(id,email) values
  ('11111111-1111-4111-8111-111111111111','church-admin@invalid.test'),
  ('22222222-2222-4222-8222-222222222222','church-member@invalid.test'),
  ('99999999-9999-4999-8999-999999999999','church-outsider@invalid.test');

insert into public.tenants(id,slug,name,kind)
values ('33333333-3333-4333-8333-333333333333','test-ekodi-church','Test EKODI Church','church');
insert into public.tenant_members(tenant_id,user_id,role,status) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','tenant_admin','active'),
  ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','member','active');

insert into church.events(tenant_id,church_slug,title,event_date)
values ('33333333-3333-4333-8333-333333333333','test-ekodi-church','Visible ministry event',current_date);
insert into church_private.members(tenant_id,church_slug,full_name,phone)
values ('33333333-3333-4333-8333-333333333333','test-ekodi-church','Private Member','000-0000-0000');

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from church.events),1,'tenant member can read non-PII church operations');
select is((select count(*)::integer from church_private.members),0,'non-admin tenant member cannot read member PII');
select throws_ok($$insert into church_private.members(tenant_id,church_slug,full_name) values ('33333333-3333-4333-8333-333333333333','test-ekodi-church','Denied Member')$$,'42501',null,'non-admin tenant member cannot create member PII');
reset role;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from church_private.members),1,'tenant admin can read member PII');
select lives_ok($$insert into church_private.members(tenant_id,church_slug,full_name) values ('33333333-3333-4333-8333-333333333333','test-ekodi-church','Allowed Member')$$,'tenant admin can manage member PII');
reset role;

select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
select set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from church.events),0,'outsider cannot read church operations');
reset role;

select * from finish();
rollback;
