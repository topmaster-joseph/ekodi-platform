-- Postgres-level regression: public collaboration must never override moderation.
-- All fixtures are confined to a rollback transaction in Supabase Local CI.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants(id,slug,name,kind)
values ('dededede-1111-4111-8111-000000000001','moderation-guard-fixture','Moderation Guard Fixture','business');
insert into public.activities(id,workspace_tenant_id,activity_key,title,ends_at,status,visibility)
values ('dededede-2222-4222-8222-000000000002','dededede-1111-4111-8111-000000000001',
  'test-past-activity','Moderation Test',now()-interval '1 day','closed','public');

insert into public.activity_media_links(
  id,activity_id,media_type,title,url,canonical_url,visibility,hidden_at,upload_state,
  storage_provider,content_sha256
) values
  ('dededede-3333-4333-8333-000000000003','dededede-2222-4222-8222-000000000002',
   'video','Moderator Hidden Link','https://media.invalid/hide','https://media.invalid/hide',
   'public',now(),'ready','external_link',null),
  ('dededede-4444-4444-8444-000000000004','dededede-2222-4222-8222-000000000002',
   'photo','Moderator Hidden Photo','https://media.invalid/hidden-photo','https://media.invalid/hidden-photo',
   'private',now(),'ready','google_workspace_shared_drive',repeat('a',64)),
  ('dededede-5555-4555-8555-000000000005','dededede-2222-4222-8222-000000000002',
   'photo','Hidden Pending Upload','https://media.invalid/pending','https://media.invalid/pending',
   'private',now(),'uploading','google_workspace_shared_drive',repeat('b',64));
update public.activity_media_links
  set upload_token='single-use-test-token'
  where id='dededede-5555-4555-8555-000000000005';

set local role anon;
select is(
  public.activity_public_submit_media_link(
    'moderation-guard-fixture','test-past-activity','video','Forged Re-Submission',
    'https://media.invalid/hide','https://media.invalid/hide','manual','Anonymous') ->> 'error',
  'media_moderated','anonymous duplicate link is rejected');
reset role;
select ok((select hidden_at is not null from public.activity_media_links
  where id='dededede-3333-4333-8333-000000000003'),'link remains hidden');
select is((select title from public.activity_media_links
  where id='dededede-3333-4333-8333-000000000003'),'Moderator Hidden Link','hidden title cannot be overwritten');

set local role anon;
select is(
  public.activity_public_submit_media_link(
    'moderation-guard-fixture','test-past-activity','video','Safe new link',
    'https://media.invalid/allowed','https://media.invalid/allowed','manual','Anonymous') ->> 'ok',
  'true','unmoderated public submissions still work');
select is(
  public.activity_public_submit_media_link(
    'moderation-guard-fixture','test-past-activity','video','Safe new link repeat',
    'https://media.invalid/allowed','https://media.invalid/allowed','manual','Anonymous') ->> 'ok',
  'true','unmoderated duplicate links still work');
reset role;
select is((select count(*)::integer from public.activity_media_links
  where canonical_url='https://media.invalid/allowed'),1,'safe duplicates remain deduplicated');

set local role anon;
select is(
  public.activity_public_reserve_media_upload(
    'moderation-guard-fixture','test-past-activity',repeat('a',64),
    'Retry hidden photo','hidden.jpg','image/jpeg',12345,'Anonymous','') ->> 'error',
  'media_moderated','hidden photo content hash cannot be reserved again');
reset role;
select ok((select hidden_at is not null from public.activity_media_links
  where id='dededede-4444-4444-8444-000000000004'),'hidden photo remains hidden');
select is((select upload_token from public.activity_media_links
  where id='dededede-4444-4444-8444-000000000004'),null::text,'hidden photo did not receive a new upload token');

set local role anon;
select is(
  public.activity_public_finalize_media_upload(
    'moderation-guard-fixture','test-past-activity',
    'dededede-5555-4555-8555-000000000005','single-use-test-token','someStorageFile12345') ->> 'error',
  'upload_finalize_forbidden','moderated uploading photo cannot be finalized');
reset role;
select is((select visibility from public.activity_media_links
  where id='dededede-5555-4555-8555-000000000005'),'private','moderated uploading photo stays private');
select is((select storage_file_id from public.activity_media_links
  where id='dededede-5555-4555-8555-000000000005'),null::text,'moderated uploading photo remains unbound');

select ok(has_function_privilege('anon',
  'public.activity_public_submit_media_link(text,text,text,text,text,text,text,text)','EXECUTE'),
  'intentional public RPC remains executable');
select ok(not has_table_privilege('anon','public.activity_media_links','SELECT'),
  'anonymous callers still have no direct media table read');
select ok(has_function_privilege('authenticated',
  'public.activity_admin_hide_media_link(text,text,uuid,boolean)','EXECUTE'),
  'authenticated operator moderation entrypoint remains present');

select * from finish();
rollback;
