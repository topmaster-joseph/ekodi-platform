-- Disposable Supabase Local CI test only. All synthetic participants are in .invalid
-- identities; BEGIN/ROLLBACK ensure zero live user or transaction mutation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public','singles_contact_share_receipts','dedicated contact consent evidence exists');
select has_function('public','singles_contact_share_record',
 array['uuid','uuid','text','text'],'atomic contact+receipt RPC exists');
select ok((select relrowsecurity from pg_class where oid='public.singles_contact_share_receipts'::regclass),
 'consent receipt RLS enabled');
select ok(not has_table_privilege('anon','public.singles_contact_share_receipts','SELECT'),
 'anonymous cannot read receipts');
select ok(not has_table_privilege('authenticated','public.singles_contact_share_receipts','SELECT'),
 'ordinary members cannot bypass per-thread projection');
select ok(not has_function_privilege('authenticated',
 'public.singles_contact_share_record(uuid,uuid,text,text)','EXECUTE'),
 'client JWT cannot directly execute the privileged RPC');
select ok(has_function_privilege('service_role',
 'public.singles_contact_share_record(uuid,uuid,text,text)','EXECUTE'),
 'API service role can execute the transactional writer');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','singles-a@ekodi-test.invalid','',now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','singles-b@ekodi-test.invalid','',now());

insert into public.people(id,ekodi_id,display_name,status)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EKD-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa','Singles A (synthetic)','active'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','EKD-bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb','Singles B (synthetic)','active');

insert into public.singles_memberships
(user_id,person_id,status,age_19_confirmed,adult_verified_at,base_consent,religion_consent,consented_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'active',true,now(),true,true,now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'active',true,now(),true,true,now());

insert into public.singles_interests(id,from_user_id,to_user_id,status)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accepted');

insert into public.singles_paid_requests
(id,requester_id,responder_id,kind,status,billing_mode,
 requester_fee_krw,responder_fee_krw,interest_id,decided_at)
values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'contact','connected','postpaid',75000,75000,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',now());

insert into public.singles_contact_unlocks(user_low,user_high,request_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd');

insert into public.singles_request_invoices
(request_id,user_id,role,amount_krw,status,paid_at)
values
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'requester',75000,'paid',now()),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'responder',75000,'paid',now());

select lives_ok(
 $$select public.singles_contact_share_record(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '010-1234-5678','singles-contact-v1-20261103')$$,
 'both settled invoices create a contact message and independent receipt atomically');
select is((select count(*)::int from public.singles_contact_share_receipts
 where interest_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),1,
 'one immutable audit receipt persisted');
select is((select count(*)::int from public.singles_messages m
 join public.singles_contact_share_receipts r on r.message_id=m.id
 where r.interest_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
 and m.body='[내 연락처] 010-1234-5678'),1,
 'audit receipt refers to exact transmitted message');
select is((select consent_version from public.singles_contact_share_receipts
 where request_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 'singles-contact-v1-20261103','purpose-limited version recorded without copying the phone');

update public.singles_request_invoices set status='refund_due'
where request_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role='responder';
select throws_ok(
 $$select public.singles_contact_share_record(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '010-9999-9999','singles-contact-v1-20261103')$$,
 '42501','contact_exchange_not_completed','pending refund denies second disclosure');
select is((select count(*)::int from public.singles_messages
 where interest_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),1,
 'rejected transaction writes no new contact message');

update public.singles_request_invoices set status='paid',refund_due_at=null
where request_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and role='responder';
insert into public.singles_blocks(blocker_id,blocked_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok(
 $$select public.singles_contact_share_record(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '010-9999-9999','singles-contact-v1-20261103')$$,
 '42501','blocked','blocked partner never receives a second contact');
delete from public.singles_blocks
where blocker_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 and blocked_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select throws_ok(
 $$select public.singles_contact_share_record(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '010-9999-9999','wrong-version')$$,
 '22023','contact_share_consent_required','outdated consent version is rejected');

select * from finish();
rollback;
