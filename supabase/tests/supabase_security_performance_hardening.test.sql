begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(to_regprocedure('public.ensure_marketing_free_access_for_auth_user()') is null or not has_function_privilege('anon',to_regprocedure('public.ensure_marketing_free_access_for_auth_user()'),'EXECUTE'),'marketing trigger helper is absent or locked from anon');
select ok(to_regprocedure('public.provision_store_user_site()') is null or not has_function_privilege('authenticated',to_regprocedure('public.provision_store_user_site()'),'EXECUTE'),'store provisioning helper is absent or locked from authenticated');
select ok(to_regprocedure('public.sync_store_public_profile_metadata()') is null or not has_function_privilege('anon',to_regprocedure('public.sync_store_public_profile_metadata()'),'EXECUTE'),'storefront trigger helper is absent or locked from anon');
select ok(has_function_privilege('anon','public.current_ekodi_mcp_identity()','EXECUTE'),'OAuth MCP anon exception remains explicitly callable');
select ok(not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='document_workspace_health' and pg_get_function_identity_arguments(p.oid)=''),'document health runs as security invoker');

select is((select count(*)::integer from pg_policies where schemaname='church' and tablename='staff' and cmd='SELECT' and roles @> array['authenticated'::name]),1,'church staff has one permissive authenticated SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='church' and tablename='services' and cmd='SELECT' and roles @> array['authenticated'::name]),1,'church services has one permissive authenticated SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='church' and tablename='events' and cmd='SELECT' and roles @> array['authenticated'::name]),1,'church events has one permissive authenticated SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='bible_groups' and cmd='SELECT' and roles @> array['authenticated'::name]),1,'Bible groups has one authenticated SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='bible_shared_journeys' and cmd='SELECT' and roles @> array['authenticated'::name]),1,'Bible shared journeys has one authenticated SELECT policy');
select ok(to_regclass('public.site_access_requests_tenant_fk_idx') is not null,'site access tenant FK has covering index');
select ok(to_regclass('church.church_staff_user_id_fk_idx') is not null,'church staff auth user FK has covering index');

select * from finish();
rollback;