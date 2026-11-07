-- BBQ Cheonggye is a customer-owned store workspace, not an EKODI-owned service.
-- Production execution belongs to the guarded migration/release pipeline only.
-- No training-system credentials, private course content, operator roles or invented store facts.
do $bbq$
begin
  if exists (
    select 1 from public.tenants
    where slug = 'bbqcheonggye'
      and (name <> 'BBQ 무안청계점' or kind <> 'business')
  ) then
    raise exception 'bbqcheonggye tenant identity conflict: manual review required';
  end if;
  if exists (
    select 1 from public.stores
    where operating_space_slug = 'bbqcheonggye'
      and (name <> 'BBQ 무안청계점' or slug <> 'bbq-muan-cheonggye')
  ) then
    raise exception 'bbqcheonggye operating slug already belongs to another store';
  end if;
end
$bbq$;

insert into public.tenants (slug, name, status, kind, settings)
values (
  'bbqcheonggye',
  'BBQ 무안청계점',
  'active',
  'business',
  jsonb_build_object(
    'operating_model','customer-site',
    'ownership','customer',
    'site_key','bbqcheonggye',
    'domain','https://ekodi.kr/bbqcheonggye',
    'data_owner','bbq-muan-cheonggye'
  )
)
on conflict (slug) do nothing;

insert into public.stores (
  tenant_id, slug, name, category, operating_space_slug,
  public_description, is_published, order_enabled
)
select
  t.id, 'bbq-muan-cheonggye', 'BBQ 무안청계점', '치킨',
  'bbqcheonggye', '매장 안내를 준비하고 있습니다.',
  false, false
from public.tenants t
where t.slug = 'bbqcheonggye'
on conflict (tenant_id, slug) do nothing;

-- Reuse the existing store_user_sites automatic provisioning trigger.
-- Preserve any existing operator-edited records; initialize only untouched defaults.
insert into public.store_user_sites(store_id)
select s.id from public.stores s
join public.tenants t on t.id=s.tenant_id
where t.slug='bbqcheonggye' and s.operating_space_slug='bbqcheonggye'
on conflict(store_id) do nothing;

update public.store_user_sites us
set page_kicker='BBQ MUAN CHEONGGYE',
    page_lead='BBQ 무안청계점 이용 안내 · 공식 메뉴와 주문 연결',
    page_theme='bbqcheonggye',
    page_description='BBQ 무안청계점 매장 안내',
    updated_at=now()
from public.stores s
join public.tenants t on t.id=s.tenant_id
where us.store_id=s.id
  and t.slug='bbqcheonggye'
  and s.operating_space_slug='bbqcheonggye'
  and us.page_theme='default'
  and us.page_kicker is null
  and us.page_lead is null
  and us.page_description is null;

-- No automatic store_owner, tenant_admin, platform_admin or email-grant assignments.
-- Ownership must be connected through the existing authorized membership workflow.
