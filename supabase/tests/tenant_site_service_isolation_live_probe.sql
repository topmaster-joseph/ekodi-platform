-- SITE-SERVICE-ISOLATION-001. ephemeral CI or DEV rollback verification ONLY.
-- This script runs entirely inside a rollback transaction and never reads or changes
-- an actual customer, tenant preference, or site access record.
-- Synthetic reserved UUIDs and .invalid identities MUST NOT be replaced with real IDs.
begin;
insert into public.tenants(id,slug,name,settings)
values
  ('fae52c63-663d-4b52-9652-95b99ca86a01','synthetic-service-a-20261102','Synthetic Service A','{"operating_model":"customer-site"}'),
  ('fae52c63-663d-4b52-9652-95b99ca86a02','synthetic-service-b-20261102','Synthetic Service B','{"operating_model":"customer-site"}');
insert into public.site_access_registry(email,site_key,tenant_id,role,status)
values
  ('synthetic-admin-a-20261102@example.invalid','synthetic-service-a-20261102','fae52c63-663d-4b52-9652-95b99ca86a01','tenant_admin','active'),
  ('synthetic-staff-a-20261102@example.invalid','synthetic-service-a-20261102','fae52c63-663d-4b52-9652-95b99ca86a01','store_staff','active'),
  ('synthetic-admin-b-20261102@example.invalid','synthetic-service-b-20261102','fae52c63-663d-4b52-9652-95b99ca86a02','tenant_admin','active');
set local role authenticated;
do $probe$
declare
  a uuid := 'fae52c63-663d-4b52-9652-95b99ca86a01';
  b uuid := 'fae52c63-663d-4b52-9652-95b99ca86a02';
  admin_a uuid := '2a8bec64-54ed-4dc5-a52c-d10494dba901';
  staff_a uuid := '2a8bec64-54ed-4dc5-a52c-d10494dba902';
  data jsonb;
  forbidden boolean;
  audit_count integer;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',admin_a,'email','synthetic-admin-a-20261102@example.invalid','role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',admin_a::text,true);
  if auth.uid() is distinct from admin_a then raise exception 'synthetic jwt auth.uid mismatch'; end if;
  data := public.tenant_site_service_catalog_snapshot(a);
  if jsonb_array_length(data->'items')<>32 then raise exception 'catalog count mismatch'; end if;
  forbidden:=false;
  begin
    perform public.tenant_site_service_catalog_snapshot(b);
  exception when insufficient_privilege then forbidden:=true;
  end;
  if not forbidden then raise exception 'cross-tenant read was allowed'; end if;
  data := public.tenant_site_service_preference_set(a,'channels',false);
  if (select count(*) from jsonb_array_elements(data->'items') item
    where item->>'key'='channels' and item->>'menuVisible'='false')<>1
  then raise exception 'tenant A preference was not disabled'; end if;
  data := public.tenant_site_service_preference_set(a,'channels',true);
  if (select count(*) from jsonb_array_elements(data->'items') item
    where item->>'key'='channels' and item->>'menuVisible'='true')<>1
  then raise exception 'menu restore failed'; end if;
  forbidden:=false;
  begin
    perform public.tenant_site_service_preference_set(a,'live',true);
  exception when invalid_parameter_value then forbidden:=true;
  end;
  if not forbidden then raise exception 'not-ready service was enabled'; end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',staff_a,'email','synthetic-staff-a-20261102@example.invalid','role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',staff_a::text,true);
  data:=public.tenant_site_service_catalog_snapshot(a);
  if jsonb_array_length(data->'items')<>32 then raise exception 'staff local read failed'; end if;
  forbidden:=false;
  begin
    perform public.tenant_site_service_preference_set(a,'channels',false);
  exception when insufficient_privilege then forbidden:=true;
  end;
  if not forbidden then raise exception 'store_staff illicitly changed menu visibility'; end if;
  perform set_config('request.jwt.claims','{"sub":"2a8bec64-54ed-4dc5-a52c-d10494dba903","email":"unknown-user-20261102@example.invalid","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','2a8bec64-54ed-4dc5-a52c-d10494dba903',true);
  forbidden:=false;
  begin
    perform public.tenant_site_service_catalog_snapshot(a);
  exception when insufficient_privilege then forbidden:=true;
  end;
  if not forbidden then raise exception 'non-member obtained tenant catalog'; end if;
  raise notice 'SITE-SERVICE-ISOLATION-001: 32 entries, deny cross-tenant read, change/restore, two audit writes, no non-ready enable, staff read-only, stranger denied';
end;
$probe$;
reset role;
do $audit$
declare audit_count integer;
begin
  select count(*) into audit_count from public.tenant_site_service_audit
  where tenant_id='fae52c63-663d-4b52-9652-95b99ca86a01' and service_key='channels';
  if audit_count<>2 then raise exception 'expected exactly 2 audit entries, got %',audit_count; end if;
  if exists(select 1 from public.tenant_site_service_preferences where tenant_id='fae52c63-663d-4b52-9652-95b99ca86a02') then
    raise exception 'cross tenant B was mutated';
  end if;
end;
$audit$;
rollback;
