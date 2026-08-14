begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users(id, email)
values ('11111111-1111-4111-8111-111111111111', 'owner@example.com');

insert into public.people(id, display_name)
values ('22222222-2222-4222-8222-222222222222', '점주');

insert into public.login_identities(
  person_id, auth_user_id, provider, provider_subject, email, is_primary
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'google', 'google-owner-1', 'owner@example.com', true
);

insert into public.tenants(id, slug, name, kind, settings)
values (
  '33333333-3333-4333-8333-333333333333',
  'cgma', '청계면상인회', 'association',
  '{"marketing_ai":{"member_benefit":true,"member_plan":"basic"}}'::jsonb
);

-- The older/first store deliberately does not belong to this person.
insert into public.stores(id, tenant_id, slug, name, created_at)
values
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'first-shop', '다른 점포', '2026-01-01T00:00:00Z'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'my-shop', '내 점포', '2026-02-01T00:00:00Z');

insert into public.store_members(store_id, user_id, role)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'store_owner');

insert into public.site_access_registry(email, site_key, tenant_id, role, status, plan)
values ('owner@example.com', 'cgma', '33333333-3333-4333-8333-333333333333', 'member', 'active', 'standard');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@example.com","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::integer
     from jsonb_array_elements(public.current_site_workspaces('cgma')) item
    where item->>'workspace_key' = 'store:55555555-5555-4555-8555-555555555555'),
  1,
  'CGMA resolves the store actually linked to the current person'
);

select is(
  (select count(*)::integer
     from jsonb_array_elements(public.current_site_workspaces('cgma')) item
    where item->>'store_id' = '44444444-4444-4444-8444-444444444444'),
  0,
  'CGMA does not guess the tenant first store'
);

select is(
  (select item->>'plan'
     from jsonb_array_elements(public.current_site_workspaces('marketing')) item
    where item->>'workspace_key' = 'store:55555555-5555-4555-8555-555555555555'
    limit 1),
  'basic',
  'approved association store member receives Marketing Basic'
);

select is(
  (select item->>'source'
     from jsonb_array_elements(public.current_site_workspaces('marketing')) item
    where item->>'workspace_key' = 'store:55555555-5555-4555-8555-555555555555'
    limit 1),
  'association:cgma',
  'association-funded Marketing entitlement records its source'
);

select is(
  (select item->>'requires_handoff'
     from jsonb_array_elements(public.current_site_workspaces('marketing')) item
    where item->>'workspace_key' = 'store:55555555-5555-4555-8555-555555555555'
    limit 1),
  'true',
  'association Marketing workspace uses verified handoff'
);

select is(
  (select count(*)::integer
     from jsonb_array_elements(public.current_site_workspaces('marketing')) item
    where item->>'source' = 'synthetic' and item->>'plan' = 'free'),
  1,
  'personal FREE workspace remains available alongside store Basic'
);

select is(
  (select item->>'workspace_name'
     from jsonb_array_elements(public.current_site_workspaces('marketing')) item
    where item->>'workspace_key' = 'store:55555555-5555-4555-8555-555555555555'
    limit 1),
  '내 점포',
  'store workspace uses the confirmed store name'
);

select * from finish();
rollback;
