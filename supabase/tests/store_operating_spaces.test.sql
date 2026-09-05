begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,email) values
  ('11111111-1111-4111-8111-111111111111','owner@invalid.test'),
  ('99999999-9999-4999-8999-999999999999','outsider@invalid.test');

insert into public.tenants(id,slug,name,kind)
values ('22222222-2222-4222-8222-222222222222','test-food-ops','Food Ops','business');
insert into public.stores(id,tenant_id,slug,name,operating_space_slug,public_address,public_phone) values
  ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','jadam-mokpo-univ','자담치킨 목포대점','jadam','테스트 주소 1','061-000-0001'),
  ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','pizzamaru-mokpo-univ','피자마루 목포대점','pizzamaru','테스트 주소 2','061-000-0002'),
  ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','yogurtpurple-mokpo-univ','요거트퍼플 목포대점','yogurt','테스트 주소 3','061-000-0003');

insert into public.store_members(store_id,user_id,role) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','store_owner'),
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','store_owner'),
  ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','store_owner');
insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind) values
  ('33333333-3333-4333-8333-333333333333','baemin','배달의민족','active','official_api'),
  ('33333333-3333-4333-8333-333333333333','coupang_eats','쿠팡이츠','partner_required','not_connected'),
  ('33333333-3333-4333-8333-333333333333','yogiyo','요기요','partner_required','not_connected');

insert into public.store_menu_items(id,store_id,canonical_name,category,base_price,availability,source_basis)
values ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','검증 메뉴','치킨',19000,'available','platform_verified');

insert into public.store_channel_menu_listings(store_id,menu_item_id,provider,external_item_ref,listing_name,listed_price,availability,source_kind)
values ('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','baemin','BAE-1','검증 메뉴',20000,'available','official_api');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.current_store_operating_spaces()),3,'owner sees three independent store operating spaces');
select is((select count(*)::integer from jsonb_array_elements(public.current_store_operating_spaces()) row where row->>'slug' in ('jadam','pizzamaru','yogurt')),3,'all three canonical root slugs are present');
select is(public.store_operating_space_snapshot('jadam')#>>'{name}','자담치킨 목포대점','Jadam resolves to Jadam only');
select is(public.store_operating_space_snapshot('pizzamaru')#>>'{name}','피자마루 목포대점','PizzaMaru resolves independently');
select is(public.store_operating_space_snapshot('yogurt')#>>'{name}','요거트퍼플 목포대점','YogurtPurple resolves independently');
select is((public.store_operating_space_snapshot('jadam')#>>'{summary,connected_channel_count}')::integer,1,'only verified connected channels count as connected');
select is((public.store_operating_space_snapshot('jadam')#>>'{menu,0,base_price}')::integer,19000,'canonical menu keeps the verified EKODI base price');
select is((public.store_operating_space_snapshot('jadam')#>>'{menu,0,listings,0,price}')::integer,20000,'channel listing preserves the platform price separately');
select is(public.business_os_snapshot('pizzamaru')#>>'{workspace,storeSlug}','pizzamaru-mokpo-univ','Business OS resolves PizzaMaru through the canonical store route');
select is(public.store_admin_route_profile('jadam')->>'name','자담치킨 목포대점','public-safe route profile exposes only the store display identity');
select is(public.store_admin_route_profile('not-a-store'),null::jsonb,'unregistered slug does not become a store admin route');

reset role;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
select set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.store_operating_space_snapshot('jadam')$$,'42501','workspace_access_required','unrelated users cannot read private store operating data');

select * from finish();
rollback;
