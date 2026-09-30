begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,email) values
  ('71111111-1111-4111-8111-111111111111','site-owner@invalid.test'),
  ('79999999-9999-4999-8999-999999999999','site-outsider@invalid.test');

insert into public.tenants(id,slug,name,kind)
values ('72222222-2222-4222-8222-222222222222','site-provision-test','Site Provision Test','business');

insert into public.stores(id,tenant_id,slug,name,operating_space_slug) values
  ('73333333-3333-4333-8333-333333333333','72222222-2222-4222-8222-222222222222','future-store-test','미래 점포 테스트','future-store');

select is(
  (select count(*)::integer from public.store_user_sites where store_id='73333333-3333-4333-8333-333333333333'),
  1,
  'canonical store slug automatically provisions one virtual user site'
);

select is(public.store_user_site_public_profile('future-store')#>>'{canonical_slug}','future-store','canonical public profile resolves from the shared site registry');

insert into public.store_members(store_id,user_id,role)
values ('73333333-3333-4333-8333-333333333333','71111111-1111-4111-8111-111111111111','store_owner');

select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;

select is(public.store_user_site_admin_snapshot('future-store')#>>'{generation_model}','shared_shell_workspace_automatic','store owner sees the structural generation model');
select is(public.store_user_site_admin_snapshot('future-store')#>>'{provisioning_mode}','workspace_automatic','store user site provisioning mode is automatic');

select is(
  public.update_store_user_site_settings(
    'future-store','paused','FUTURE STORE USER PAGE','미래 점포 사용자페이지','default','미래 점포 테스트 사용자 운영페이지',array['future-shop']::text[]
  )#>>'{status}',
  'paused',
  'store owner can pause and update the user site settings'
);

reset role;
select is(public.store_user_site_public_profile('future-shop')#>>'{canonical_slug}','future-store','admin alias resolves to the canonical workspace slug');
select is(public.store_user_site_public_profile('future-store')#>>'{status}','paused','public profile exposes paused lifecycle state without private workspace data');

select set_config('request.jwt.claim.sub','79999999-9999-4999-8999-999999999999',true);
select set_config('request.jwt.claims','{"sub":"79999999-9999-4999-8999-999999999999","role":"authenticated"}',true);
set local role authenticated;
select throws_ok(
  $$select public.store_user_site_admin_snapshot('future-store')$$,
  '42501','workspace_admin_required',
  'unrelated users cannot manage a store user site'
);

select * from finish();
rollback;