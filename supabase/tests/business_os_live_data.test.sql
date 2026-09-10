begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users(id,email) values
  ('11111111-1111-4111-8111-111111111111','owner@example.com'),
  ('99999999-9999-4999-8999-999999999999','outsider@example.com');

insert into public.tenants(id,slug,name,kind)
values ('22222222-2222-4222-8222-222222222222','ekodibiz','EKODIBIZ','business');

insert into public.stores(id,tenant_id,slug,name,operating_space_slug) values
  ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','jadam-mokpo-univ','자담치킨 목포대점','jadam'),
  ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','pizzamaru-mokpo-univ','피자마루 목포대점','pizzamaru');

insert into public.tenant_members(tenant_id,user_id,role,status)
values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','tenant_admin','active');

insert into public.store_members(store_id,user_id,role) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','store_owner'),
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','store_owner');

insert into public.orders(tenant_id,store_id,order_no,customer_name,customer_phone,total,status,source,created_at) values
  ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','J-001','고객A','010-1111-2222',30000,'completed','store',now()),
  ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','J-000','고객A','010-1111-2222',20000,'completed','store',now()-interval '10 days'),
  ('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','P-001','고객B','010-3333-4444',20000,'completed','store',now()),
  ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','J-X','취소고객','010-5555-6666',99000,'cancelled','store',now());

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@example.com","role":"authenticated"}',true);
set local role authenticated;

select is(
  (public.business_os_snapshot('jadam')#>>'{metrics,sales}')::numeric,
  30000::numeric,
  'Jadam snapshot reads only completed sales for the Jadam store'
);

select is(
  (public.business_os_snapshot('jadam')#>>'{metrics,customers}')::integer,
  1,
  'Jadam snapshot returns aggregate customer count without returning customer rows'
);

select is(
  (public.business_os_snapshot('jadam')#>>'{metrics,repeatRate}')::numeric,
  100.0::numeric,
  'Jadam repeat rate is derived from aggregate completed-order history'
);

select is(
  (public.business_os_snapshot('ekodibiz')#>>'{metrics,sales}')::numeric,
  50000::numeric,
  'EKODIBIZ tenant snapshot aggregates completed sales across its stores'
);

select is(
  public.business_os_snapshot('jadam')#>>'{sources,containsCustomerPii}',
  'false',
  'Business OS snapshot explicitly declares no customer PII in its output'
);

select is(
  public.business_os_propose_action('jadam','draft_campaign','저녁 캠페인 초안')#>>'{status}',
  'draft',
  'bounded draft actions remain drafts'
);

select is(
  public.business_os_propose_action('jadam','send_customer_message','휴면고객 메시지 검토')#>>'{status}',
  'pending_approval',
  'external customer messaging is routed to human approval'
);

select throws_ok(
  $$select public.business_os_propose_action('jadam','transfer_money','자동 이체')$$,
  '42501',
  'high_impact_human_only',
  'high-impact financial actions are rejected at the data layer'
);

select is(
  (
    with target as (
      select id from public.business_os_actions where action_type='send_customer_message' order by created_at desc limit 1
    )
    select public.business_os_decide_action(id,'approved')#>>'{executed}' from target
  ),
  'false',
  'human approval records a decision but never executes the external effect'
);

reset role;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
select set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","email":"outsider@example.com","role":"authenticated"}',true);
set local role authenticated;

select throws_ok(
  $$select public.business_os_snapshot('jadam')$$,
  '42501',
  'workspace_access_required',
  'unrelated authenticated users cannot read the Jadam Business OS snapshot'
);

select * from finish();
rollback;