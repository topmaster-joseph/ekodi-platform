-- Platform-menu storefront: app-specific prices, images, and order deep links.
-- Public output is limited to verified public-safe menu facts.

alter table public.store_channel_profiles
  drop constraint if exists store_channel_profiles_provider_check;
alter table public.store_channel_profiles
  add constraint store_channel_profiles_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','store'));

alter table public.store_channel_menu_listings
  drop constraint if exists store_channel_menu_listings_provider_check;
alter table public.store_channel_menu_listings
  add constraint store_channel_menu_listings_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','store'));

alter table public.store_menu_items
  drop constraint if exists store_menu_items_source_basis_check;
alter table public.store_menu_items
  add constraint store_menu_items_source_basis_check
  check (source_basis in ('pending','brand_official','platform_verified','operator_verified','pos_verified'));

alter table public.store_menu_items
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz;
alter table public.store_channel_menu_listings
  add column if not exists image_url text,
  add column if not exists public_order_url text,
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='store_menu_items_source_url_https_chk'
      and conrelid='public.store_menu_items'::regclass
  ) then
    alter table public.store_menu_items add constraint store_menu_items_source_url_https_chk
      check (source_url is null or source_url ~ '^https://');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='store_channel_menu_listings_urls_https_chk'
      and conrelid='public.store_channel_menu_listings'::regclass
  ) then
    alter table public.store_channel_menu_listings add constraint store_channel_menu_listings_urls_https_chk
      check ((image_url is null or image_url ~ '^https://')
        and (public_order_url is null or public_order_url ~ '^https://')
        and (source_url is null or source_url ~ '^https://'));
  end if;
end
$$;
insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind)
select s.id,p.provider,p.display_name,'partner_required','not_connected'
from public.stores s
cross join (values
  ('ddangyo'::text,'땡겨요'::text),
  ('mukkebi'::text,'먹깨비'::text)
) as p(provider,display_name)
where s.operating_space_slug in ('jadam','pizzamaru','yogurt')
on conflict(store_id,provider) do nothing;

with source(name,category,description,price,image_url,product_url) as (
  values
  ('이탈리안 치즈 피자','클래식','담백하고 고소한 치즈가 듬뿍 들어가 더욱 부드러운 피자',9900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102323.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('페퍼로니 피자','클래식','고소한 페퍼로니햄이 쫀득한 치즈 위로 듬뿍 올라간 피자',10900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154420.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('콤비네이션 피자','클래식','신선한 야채와 햄, 페퍼로니가 토핑된 피자마루 베스트셀러',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154437.jpg','https://www.pizzamaru.co.kr/product/15980188279162'),
  ('포테이토 피자','클래식','큼직한 감자와 치즈가 어우러진 담백한 피자',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154408.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('꿀고구마 피자','클래식','국산 꿀고구마를 가득 넣은 달콤한 피자',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102052.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('불고기 피자','클래식','불고기를 부드러운 치즈와 함께 즐기는 대표 메뉴',13900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120200821231040.jpg','https://www.pizzamaru.co.kr/menu/11/')
)
update public.store_menu_items m
set category=source.category,description=source.description,base_price=source.price,
    image_url=source.image_url,source_basis='brand_official',source_url=source.product_url,
    verified_at=now(),updated_at=now()
from source,public.stores s
where m.store_id=s.id and lower(s.operating_space_slug)='pizzamaru'
  and lower(m.canonical_name)=lower(source.name);
with source(name,category,description,price,image_url,product_url) as (
  values
  ('이탈리안 치즈 피자','클래식','담백하고 고소한 치즈가 듬뿍 들어가 더욱 부드러운 피자',9900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102323.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('페퍼로니 피자','클래식','고소한 페퍼로니햄이 쫀득한 치즈 위로 듬뿍 올라간 피자',10900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154420.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('콤비네이션 피자','클래식','신선한 야채와 햄, 페퍼로니가 토핑된 피자마루 베스트셀러',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154437.jpg','https://www.pizzamaru.co.kr/product/15980188279162'),
  ('포테이토 피자','클래식','큼직한 감자와 치즈가 어우러진 담백한 피자',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154408.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('꿀고구마 피자','클래식','국산 꿀고구마를 가득 넣은 달콤한 피자',12900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102052.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('불고기 피자','클래식','불고기를 부드러운 치즈와 함께 즐기는 대표 메뉴',13900,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120200821231040.jpg','https://www.pizzamaru.co.kr/menu/11/')
)
insert into public.store_menu_items(
  store_id,canonical_name,category,description,base_price,image_url,availability,
  source_basis,source_url,verified_at
)
select s.id,source.name,source.category,source.description,source.price,source.image_url,
       'available','brand_official',source.product_url,now()
from source
join public.stores s on lower(s.operating_space_slug)='pizzamaru'
where not exists (
  select 1 from public.store_menu_items m
  where m.store_id=s.id and lower(m.canonical_name)=lower(source.name)
);
create or replace function public.store_user_site_public_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_result jsonb;
begin
  select jsonb_build_object(
    'store',jsonb_build_object(
      'name',s.name,
      'address',s.public_address,
      'phone',s.public_phone,
      'business_hours',coalesce(s.business_hours,'{}'::jsonb),
      'description',s.public_description
    ),
    'menu',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,
        'name',m.canonical_name,
        'category',m.category,
        'description',m.description,
        'base_price',m.base_price,
        'image_url',m.image_url,
        'source_basis',m.source_basis,
        'source_url',m.source_url,
        'verified_at',m.verified_at,
        'listings',coalesce((
          select jsonb_agg(jsonb_build_object(
            'provider',l.provider,
            'display_name',coalesce(c.display_name,l.provider),
            'name',l.listing_name,
            'description',l.listing_description,
            'price',l.listed_price,
            'image_url',coalesce(l.image_url,m.image_url),
            'order_url',coalesce(l.public_order_url,c.public_order_url),
            'availability',l.availability,
            'captured_at',l.captured_at,
            'verified_at',coalesce(l.verified_at,l.last_synced_at,l.captured_at)
          ) order by case l.provider
            when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3
            when 'mukkebi' then 4 when 'coupang_eats' then 5 else 9 end)
          from public.store_channel_menu_listings l
          left join public.store_channel_profiles c
            on c.store_id=l.store_id and c.provider=l.provider
          where l.store_id=s.id and l.menu_item_id=m.id
            and l.source_kind in ('official_api','partner_import','verified_file','manual_verified')
            and l.availability<>'hidden'
        ),'[]'::jsonb)
      ) order by coalesce(m.category,''),m.canonical_name)
      from public.store_menu_items m
      where m.store_id=s.id
        and m.source_basis in ('brand_official','platform_verified','operator_verified','pos_verified')
        and m.availability<>'hidden'
    ),'[]'::jsonb),
    'channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',c.provider,
        'display_name',c.display_name,
        'order_url',c.public_order_url,
        'verified_at',c.verified_at
      ) order by case c.provider
        when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3
        when 'mukkebi' then 4 when 'coupang_eats' then 5 when 'store' then 6 else 9 end)
      from public.store_channel_profiles c
      where c.store_id=s.id
        and c.public_order_url is not null
        and c.connection_status in ('ready','active')
        and c.source_kind<>'not_connected'
    ),'[]'::jsonb)
  ) into v_result
  from public.store_user_sites us
  join public.stores s on s.id=us.store_id
  where us.status='active'
    and s.operating_space_slug is not null
    and (lower(s.operating_space_slug)=v_slug or v_slug=any(us.alias_slugs))
  limit 1;

  return v_result;
end
$$;

revoke all on function public.store_user_site_public_snapshot(text) from public;
grant execute on function public.store_user_site_public_snapshot(text) to anon, authenticated;
create or replace function public.store_user_site_admin_snapshot_v2(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$declare
  v_base jsonb;
  v_store_id uuid;
begin
  v_base := public.store_user_site_admin_snapshot(p_slug);
  v_store_id := nullif(v_base->>'store_id','')::uuid;
  return v_base || jsonb_build_object(
    'delivery_channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',c.provider,
        'display_name',c.display_name,
        'public_order_url',c.public_order_url,
        'connection_status',c.connection_status,
        'source_kind',c.source_kind,
        'verified_at',c.verified_at
      ) order by case c.provider
        when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3
        when 'mukkebi' then 4 when 'coupang_eats' then 5 when 'store' then 6 else 9 end)
      from public.store_channel_profiles c
      where c.store_id=v_store_id
        and c.provider in ('ddangyo','baemin','yogiyo','mukkebi','coupang_eats','store')
    ),'[]'::jsonb)
  );
end
$$;
revoke all on function public.store_user_site_admin_snapshot_v2(text) from public, anon;
grant execute on function public.store_user_site_admin_snapshot_v2(text) to authenticated;

create or replace function public.update_storefront_public_settings_v2(
  p_slug text,
  p_public_address text,
  p_public_phone text,
  p_baemin_url text default null,
  p_coupang_eats_url text default null,
  p_yogiyo_url text default null,
  p_ddangyo_url text default null,
  p_mukkebi_url text default null
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
  perform public.update_storefront_public_settings(
    p_slug,p_public_address,p_public_phone,p_baemin_url,p_coupang_eats_url,p_yogiyo_url
  );
  select id into v_store_id from public.stores
  where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  for v_provider,v_label,v_url in
    select * from (values
      ('ddangyo'::text,'땡겨요'::text,nullif(trim(coalesce(p_ddangyo_url,'')),'')),
      ('mukkebi'::text,'먹깨비'::text,nullif(trim(coalesce(p_mukkebi_url,'')),''))
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
    set public_order_url=excluded.public_order_url,
        connection_status=excluded.connection_status,
        source_kind=excluded.source_kind,
        verified_at=excluded.verified_at,
        updated_at=now();
  end loop;
  return public.store_user_site_admin_snapshot_v2(p_slug);
end
$$;
revoke all on function public.update_storefront_public_settings_v2(text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_storefront_public_settings_v2(text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.import_store_platform_menu_snapshot(
  p_slug text,
  p_provider text,
  p_items jsonb,
  p_store_order_url text default null,
  p_source_url text default null,
  p_platform_store_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_store_id uuid;
  v_item jsonb;
  v_menu_id uuid;
  v_name text;
  v_category text;
  v_description text;
  v_image_url text;
  v_order_url text;
  v_external_ref text;
  v_price integer;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_provider not in ('ddangyo','baemin','yogiyo','mukkebi','coupang_eats') then
    raise exception 'unsupported_platform_provider' using errcode='22023';
  end if;
  if p_store_order_url is not null and trim(p_store_order_url)<>'' and p_store_order_url !~ '^https://' then
    raise exception 'invalid_public_order_url' using errcode='22023';
  end if;
  if p_source_url is not null and trim(p_source_url)<>'' and p_source_url !~ '^https://' then
    raise exception 'invalid_source_url' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then
    raise exception 'items_must_be_array' using errcode='22023';
  end if;

  select id into v_store_id from public.stores where lower(operating_space_slug)=v_slug limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  insert into public.store_channel_profiles as existing(
    store_id,provider,display_name,platform_store_name,connection_status,source_kind,
    public_order_url,source_url,verified_at,last_synced_at
  ) values (
    v_store_id,v_provider,
    case v_provider when 'ddangyo' then '땡겨요' when 'baemin' then '배달의민족'
      when 'yogiyo' then '요기요' when 'mukkebi' then '먹깨비' else '쿠팡이츠' end,
    nullif(trim(coalesce(p_platform_store_name,'')),''),'ready','manual_verified',
    nullif(trim(coalesce(p_store_order_url,'')),''),nullif(trim(coalesce(p_source_url,'')),''),now(),now()
  ) on conflict(store_id,provider) do update
  set display_name=excluded.display_name,
      platform_store_name=coalesce(excluded.platform_store_name,existing.platform_store_name),
      connection_status='ready',source_kind='manual_verified',
      public_order_url=coalesce(excluded.public_order_url,existing.public_order_url),
      source_url=coalesce(excluded.source_url,existing.source_url),
      verified_at=now(),last_synced_at=now(),updated_at=now();

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_name := nullif(trim(coalesce(v_item->>'canonical_name',v_item->>'name','')),'');
    if v_name is null then continue; end if;
    v_category := nullif(trim(coalesce(v_item->>'category','')),'');
    v_description := nullif(trim(coalesce(v_item->>'description','')),'');
    v_image_url := nullif(trim(coalesce(v_item->>'image_url','')),'');
    v_order_url := nullif(trim(coalesce(v_item->>'order_url',p_store_order_url,'')),'');
    if v_image_url is not null and v_image_url !~ '^https://' then raise exception 'invalid_image_url'; end if;
    if v_order_url is not null and v_order_url !~ '^https://' then raise exception 'invalid_public_order_url'; end if;
    v_price := null;
    if regexp_replace(coalesce(v_item->>'price',''),'[^0-9]','','g')<>'' then
      v_price := regexp_replace(v_item->>'price','[^0-9]','','g')::integer;
    end if;
    v_external_ref := nullif(trim(coalesce(v_item->>'external_item_ref','')),'');
    if v_external_ref is null then
      v_external_ref := 'manual:'||md5(lower(v_name));
    end if;

    select m.id into v_menu_id
    from public.store_menu_items m
    where m.store_id=v_store_id and lower(m.canonical_name)=lower(v_name)
    order by case m.source_basis when 'brand_official' then 0 else 1 end,m.created_at
    limit 1;

    if v_menu_id is null then
      insert into public.store_menu_items(
        store_id,canonical_name,category,description,image_url,availability,
        source_basis,source_url,verified_at
      ) values (
        v_store_id,v_name,v_category,v_description,v_image_url,'available',
        'platform_verified',nullif(trim(coalesce(p_source_url,'')),''),now()
      ) returning id into v_menu_id;
    else
      update public.store_menu_items
      set image_url=coalesce(image_url,v_image_url),
          description=coalesce(description,v_description),
          category=coalesce(category,v_category),updated_at=now()
      where id=v_menu_id;
    end if;
    insert into public.store_channel_menu_listings as existing(
      store_id,menu_item_id,provider,external_item_ref,listing_name,listing_description,
      listed_price,options,availability,source_kind,captured_at,last_synced_at,
      image_url,public_order_url,source_url,verified_at
    ) values (
      v_store_id,v_menu_id,v_provider,v_external_ref,
      coalesce(nullif(trim(coalesce(v_item->>'name','')),''),v_name),v_description,
      v_price,coalesce(v_item->'options','[]'::jsonb),
      case when coalesce(v_item->>'availability','available') in ('available','sold_out','hidden','unknown')
        then coalesce(v_item->>'availability','available') else 'unknown' end,
      'manual_verified',now(),now(),v_image_url,v_order_url,
      coalesce(nullif(trim(coalesce(v_item->>'source_url','')),''),nullif(trim(coalesce(p_source_url,'')),'')),now()
    ) on conflict(store_id,provider,external_item_ref) where external_item_ref is not null do update
    set menu_item_id=excluded.menu_item_id,
        listing_name=excluded.listing_name,
        listing_description=excluded.listing_description,
        listed_price=excluded.listed_price,
        options=excluded.options,
        availability=excluded.availability,
        source_kind='manual_verified',
        captured_at=now(),last_synced_at=now(),
        image_url=coalesce(excluded.image_url,existing.image_url),
        public_order_url=coalesce(excluded.public_order_url,existing.public_order_url),
        source_url=coalesce(excluded.source_url,existing.source_url),
        verified_at=now(),updated_at=now();
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok',true,'provider',v_provider,'imported',v_count,'store_id',v_store_id);
end
$$;
revoke all on function public.import_store_platform_menu_snapshot(text,text,jsonb,text,text,text) from public, anon;
grant execute on function public.import_store_platform_menu_snapshot(text,text,jsonb,text,text,text) to authenticated;

comment on function public.import_store_platform_menu_snapshot(text,text,jsonb,text,text,text)
  is 'Store-manager verified platform menu snapshot import. Never treats unverified scraped data as authoritative.';
