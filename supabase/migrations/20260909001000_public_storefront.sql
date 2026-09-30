-- Public customer storefront projection for canonical store pages.
-- Exposes only customer-safe fields; private operational state remains behind authenticated APIs.

create or replace function public.store_public_storefront(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store record;
begin
  select s.* into v_store
  from public.stores s
  where s.operating_space_slug is not null
    and (
      lower(s.operating_space_slug)=v_slug
      or exists (select 1 from public.store_user_sites us where us.store_id=s.id and v_slug=any(coalesce(us.alias_slugs,'{}'::text[])))
    )
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'slug', v_store.operating_space_slug,
    'name', v_store.name,
    'category', v_store.category,
    'address', v_store.public_address,
    'phone', v_store.public_phone,
    'business_hours', v_store.business_hours,
    'description', v_store.public_description,
    'order_enabled', v_store.order_enabled,
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', scp.provider,
        'display_name', scp.display_name,
        'platform_store_name', scp.platform_store_name,
        'direct_url', case when scp.connection_status in ('active','ready') then scp.source_url else null end
      ) order by case scp.provider when 'baemin' then 1 when 'coupang_eats' then 2 when 'yogiyo' then 3 else 9 end)
      from public.store_channel_profiles scp
      where scp.store_id=v_store.id
    ), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', mi.canonical_name,
        'category', mi.category,
        'description', mi.description,
        'price', mi.base_price,
        'image_url', mi.image_url
      ) order by coalesce(mi.category,''), mi.canonical_name)
      from public.store_menu_items mi
      where mi.store_id=v_store.id
        and mi.availability <> 'hidden'
        and mi.source_basis <> 'pending'
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function public.store_public_storefront(text) from public;
grant execute on function public.store_public_storefront(text) to anon, authenticated;

update public.stores
set is_published=true,
    public_description='국립목포대학교 후문에서 만나는 요거트퍼플 목포대점',
    updated_at=now()
where operating_space_slug='yogurt';
update public.store_user_sites us
set page_kicker='YOGURT PURPLE · MOKPO UNIVERSITY',
    page_lead='국립목포대학교 후문, 요거트퍼플 목포대점에서 상큼한 디저트를 만나보세요.',
    page_description='요거트퍼플 목포대점 메뉴·매장안내·배달주문',
    updated_at=now()
from public.stores s
where us.store_id=s.id and s.operating_space_slug='yogurt';