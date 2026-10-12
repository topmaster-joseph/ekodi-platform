-- EKODI Mission isolated behavioral proof: operator moderation vs anonymous retries.
-- pgTAP executes only in Supabase Local CI against disposable, synthetic fixtures.
-- BEGIN/ROLLBACK prohibit persistence; do not target DEV/PROD or copy real user data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.tenants(id,slug,name,kind,settings)
values ('cacacaca-1111-4111-8111-000000000001','ekodi-synthetic-moderation','EKODI Synthetic Moderation','association',
 '{"operating_model":"customer-site"}'::jsonb);

insert into public.activities(id,workspace_tenant_id,activity_key,title,ends_at,status,visibility)
values ('cacacaca-2222-4222-8222-000000000002','cacacaca-1111-4111-8111-000000000001',
 'completed-synthetic-event','Synthetic Completed Activity',now()-interval '1 day','closed','public');

-- A role-mapped fictitious identity, never a live/production user.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at)
values ('cacacaca-9999-4999-8999-000000000009','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','moderator@ekodi-test.invalid','',now());

insert into public.site_access_registry(email,site_key,tenant_id,role,status,source)
values ('moderator@ekodi-test.invalid','mission-fixture','cacacaca-1111-4111-8111-000000000001',
 'tenant_admin','active','synthetic-e2e');

insert into public.activity_media_links(
 id,activity_id,media_type,title,url,canonical_url,visibility,hidden_at,
 upload_state,storage_provider,content_sha256,upload_token
) values
 ('cacacaca-3333-4333-8333-000000000003','cacacaca-2222-4222-8222-000000000002',
  'video','Synthetic link','https://media.invalid/synthetic-video','https://media.invalid/synthetic-video',
  'public',null,'ready','external_link',null,null),
 ('cacacaca-4444-4444-8444-000000000004','cacacaca-2222-4222-8222-000000000002',
  'photo','Synthetic ready photo','https://media.invalid/synthetic-photo','https://media.invalid/synthetic-photo',
  'public',null,'ready','google_workspace_shared_drive',repeat('a',64),null),
 ('cacacaca-5555-4555-8555-000000000005','cacacaca-2222-4222-8222-000000000002',
  'photo','Synthetic pending photo','https://media.invalid/synthetic-pending','https://media.invalid/synthetic-pending',
  'private',null,'uploading','google_workspace_shared_drive',repeat('b',64),'synthetic-one-time-upload-token');

set local role authenticated;
select set_config('request.jwt.claim.sub','cacacaca-9999-4999-8999-000000000009',true);
select set_config('request.jwt.claims',
 '{"sub":"cacacaca-9999-4999-8999-000000000009","email":"moderator@ekodi-test.invalid","role":"authenticated"}',true);

select ok(has_function_privilege('authenticated',
 'public.activity_admin_hide_media_link(text,text,uuid,boolean)','EXECUTE'),
 'synthetic authenticated moderator may invoke protected tenant-local hide RPC');
select is(public.activity_admin_hide_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event',
 'cacacaca-3333-4333-8333-000000000003',true)->>'hidden','true','operator hides public link');
select is(public.activity_admin_hide_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event',
 'cacacaca-4444-4444-8444-000000000004',true)->>'hidden','true','operator hides ready photo');
select is(public.activity_admin_hide_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event',
 'cacacaca-5555-4555-8555-000000000005',true)->>'hidden','true','operator hides pending upload');

reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;

select is(public.activity_public_submit_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event','video','Forged replacement',
 'https://media.invalid/synthetic-video','https://media.invalid/synthetic-video','manual','Anonymous')->>'error',
 'media_moderated','anonymous duplicate canonical link cannot reverse operator hide');
select is(public.activity_public_reserve_media_upload(
 'ekodi-synthetic-moderation','completed-synthetic-event',repeat('a',64),
 'Forged re-upload','synthetic-photo.jpg','image/jpeg',1024,'Anonymous','')->>'error',
 'media_moderated','anonymous duplicate SHA-256 cannot reserve hidden ready photo');
select is(public.activity_public_finalize_media_upload(
 'ekodi-synthetic-moderation','completed-synthetic-event',
 'cacacaca-5555-4555-8555-000000000005','synthetic-one-time-upload-token','syntheticFile12345')->>'error',
 'upload_finalize_forbidden','anonymous cannot finalize moderated pending upload');
select is((public.activity_public_archive_snapshot(
 'ekodi-synthetic-moderation','completed-synthetic-event')->'media')::text,'[]',
 'public archive does not disclose hidden media');
select ok(not has_function_privilege('anon',
 'public.activity_admin_hide_media_link(text,text,uuid,boolean)','EXECUTE'),
 'anonymous role cannot execute operator moderation RPC');
reset role;

select ok((select hidden_at is not null from public.activity_media_links where id='cacacaca-3333-4333-8333-000000000003'),
 'duplicate attack leaves link hidden');
select is((select title from public.activity_media_links where id='cacacaca-3333-4333-8333-000000000003'),
 'Synthetic link','duplicate attack does not overwrite hidden title');
select ok((select hidden_at is not null from public.activity_media_links where id='cacacaca-4444-4444-8444-000000000004'),
 'hidden photo remains moderated');
select is((select visibility from public.activity_media_links where id='cacacaca-5555-4555-8555-000000000005'),
 'private','hidden pending upload remains private');
select is((select upload_token from public.activity_media_links where id='cacacaca-5555-4555-8555-000000000005'),
 'synthetic-one-time-upload-token','hidden pending upload token cannot be rotated by anonymous retry');

-- An operator may intentionally unhide; anonymous actors still may not.
set local role authenticated;
select set_config('request.jwt.claim.sub','cacacaca-9999-4999-8999-000000000009',true);
select set_config('request.jwt.claims',
 '{"sub":"cacacaca-9999-4999-8999-000000000009","email":"moderator@ekodi-test.invalid","role":"authenticated"}',true);
select is(public.activity_admin_hide_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event',
 'cacacaca-3333-4333-8333-000000000003',false)->>'hidden','false',
 'authorized moderator can intentionally restore link');
reset role;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is(public.activity_public_submit_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event','video','Harmless link repeat',
 'https://media.invalid/synthetic-video','https://media.invalid/synthetic-video','manual','Anonymous')->>'ok',
 'true','ordinary duplicate submission works after intentional moderator unhide');
select is(public.activity_public_submit_media_link(
 'ekodi-synthetic-moderation','completed-synthetic-event','video','Another public link',
 'https://media.invalid/synthetic-new','https://media.invalid/synthetic-new','manual','Anonymous')->>'ok',
 'true','ordinary new unmoderated submission still works');
reset role;
select is((select count(*)::integer from public.activity_media_links
 where canonical_url='https://media.invalid/synthetic-video'),1,
 'ordinary duplicate remains de-duplicated');
select ok((select hidden_at is null from public.activity_media_links
 where id='cacacaca-3333-4333-8333-000000000003'),
 'successful moderator unhide is reflected in durable media state');
select ok(not has_table_privilege('anon','public.activity_media_links','SELECT'),
 'anonymous role cannot read private media table directly');

select * from finish();
rollback;
