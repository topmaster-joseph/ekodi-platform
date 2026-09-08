-- Storefront order channels v3: add Daangn Order and Naver Order as verified public links.
alter table public.store_channel_profiles
  drop constraint if exists store_channel_profiles_provider_check;
alter table public.store_channel_profiles
  add constraint store_channel_profiles_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order','store'));

alter table public.store_channel_menu_listings
  drop constraint if exists store_channel_menu_listings_provider_check;
alter table public.store_channel_menu_listings
  add constraint store_channel_menu_listings_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order','store'));

insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind)
select s.id,p.provider,p.display_name,'partner_required','not_connected'
from public.stores s
cross join (values
  ('daangn_order'::text,'당근 주문'::text),
  ('naver_order'::text,'네이버 주문'::text)
) as p(provider,display_name)
where s.operating_space_slug in ('jadam','pizzamaru','yogurt')
on conflict(store_id,provider) do nothing;

create or replace function public.store_user_site_admin_snapshot_v3(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$declare
  v_base jsonb;
  v_store_id uuid;
begin
  v_base := public.store_user_site_admin_snapshot_v2(p_slug);
  v_store_id := nullif(v_base->>'store_id','')::uuid;
  return v_base || jsonb_build_object(
    'delivery_channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',c.provider,'display_name',c.display_name,
        'public_order_url',c.public_order_url,'connection_status',c.connection_status,
        'source_kind',c.source_kind,'verified_at',c.verified_at
      ) order by case c.provider
        when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3
        when 'mukkebi' then 4 when 'daangn_order' then 5 when 'naver_order' then 6
        when 'coupang_eats' then 7 when 'store' then 8 else 9 end)
      from public.store_channel_profiles c
      where c.store_id=v_store_id
        and c.provider in ('ddangyo','baemin','yogiyo','mukkebi','daangn_order','naver_order','coupang_eats','store')
    ),'[]'::jsonb)
  );
end
$$;
revoke all on function public.store_user_site_admin_snapshot_v3(text) from public, anon;
grant execute on function public.store_user_site_admin_snapshot_v3(text) to authenticated;

create or replace function public.update_storefront_public_settings_v3(
  p_slug text,p_public_address text,p_public_phone text,
  p_baemin_url text default null,p_coupang_eats_url text default null,p_yogiyo_url text default null,
  p_ddangyo_url text default null,p_mukkebi_url text default null,
  p_daangn_order_url text default null,p_naver_order_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$declare
  v_store_id uuid;
  v_provider text;
  v_label text;
  v_url text;
begin
  perform public.update_storefront_public_settings_v2(
    p_slug,p_public_address,p_public_phone,p_baemin_url,p_coupang_eats_url,p_yogiyo_url,p_ddangyo_url,p_mukkebi_url
  );
  select id into v_store_id from public.stores
  where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  for v_provider,v_label,v_url in
    select * from (values
      ('daangn_order'::text,'당근 주문'::text,nullif(trim(coalesce(p_daangn_order_url,'')),'')),
      ('naver_order'::text,'네이버 주문'::text,nullif(trim(coalesce(p_naver_order_url,'')),''))
    ) as q(provider,label,url)
  loop
    if v_url is not null and v_url !~ '^https://' then
      raise exception 'invalid_public_order_url' using errcode='22023';
    end if;
    insert into public.store_channel_profiles as existing(
      store_id,provider,display_name,connection_status,source_kind,public_order_url,verified_at
    ) values (
      v_store_id,v_provider,v_label,
      case when v_url is null then 'partner_required' else 'ready' end,
      case when v_url is null then 'not_connected' else 'manual_verified' end,
      v_url,case when v_url is null then null else now() end
    ) on conflict(store_id,provider) do update
    set display_name=excluded.display_name,
        public_order_url=excluded.public_order_url,
        connection_status=excluded.connection_status,
        source_kind=excluded.source_kind,
        verified_at=excluded.verified_at,
        updated_at=now();
  end loop;
  return public.store_user_site_admin_snapshot_v3(p_slug);
end
$$;
revoke all on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) to authenticated;