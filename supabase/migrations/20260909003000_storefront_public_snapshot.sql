-- Customer-first public storefront projection.
-- Exposes only public store facts, verified menu data, and explicit customer order URLs.

alter table public.store_channel_profiles
  add column if not exists public_order_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='store_channel_profiles_public_order_url_chk'
      and conrelid='public.store_channel_profiles'::regclass
  ) then
    alter table public.store_channel_profiles
      add constraint store_channel_profiles_public_order_url_chk
      check (public_order_url is null or public_order_url ~ '^https://');
  end if;
end
$$;

update public.stores
set public_address='전남 무안군 청계면 승달산길 37-1 1층',
    public_phone='061-453-8295',
    public_description='목포대 후문에서 피자마루 메뉴를 주문할 수 있는 피자마루 목포대점입니다.'
where lower(operating_space_slug)='pizzamaru';

insert into public.store_channel_profiles as existing(
  store_id,provider,display_name,connection_status,source_kind,public_order_url,verified_at
)
select s.id,'store','피자마루 공식 주문','ready','manual_verified',
       'https://www.pizzamaru.co.kr/orderchoice/?deliv_type=1',now()
from public.stores s
where lower(s.operating_space_slug)='pizzamaru'
on conflict(store_id,provider) do update
set display_name=excluded.display_name,
    public_order_url=excluded.public_order_url,
    connection_status=case
      when existing.connection_status in ('active','ready')
        then existing.connection_status
      else 'ready'
    end,
    source_kind=case
      when existing.source_kind<>'not_connected'
        then existing.source_kind
      else 'manual_verified'
    end,
    verified_at=coalesce(existing.verified_at,excluded.verified_at),
    updated_at=now();

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
        'name',m.canonical_name,
        'category',m.category,
        'description',m.description,
        'base_price',m.base_price,
        'image_url',m.image_url,
        'availability',m.availability
      ) order by coalesce(m.category,''),m.canonical_name)
      from public.store_menu_items m
      where m.store_id=s.id
        and m.source_basis in ('platform_verified','operator_verified','pos_verified')
        and m.availability<>'hidden'
    ),'[]'::jsonb),    'channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',c.provider,
        'display_name',c.display_name,
        'order_url',c.public_order_url
      ) order by case c.provider
        when 'baemin' then 1 when 'coupang_eats' then 2
        when 'yogiyo' then 3 when 'store' then 4 else 9 end)
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

create or replace function public.store_user_site_admin_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store record;
  v_site record;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select s.* into v_store
  from public.stores s
  where lower(s.operating_space_slug)=v_slug
  limit 1;

  if v_store.id is null then
    raise exception 'workspace_not_found' using errcode='22023';
  end if;
  if not public.can_manage_store_user_site(v_store.id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  select * into v_site from public.store_user_sites us where us.store_id=v_store.id;  return jsonb_build_object(
    'store_id',v_store.id,
    'store_name',v_store.name,
    'canonical_slug',v_store.operating_space_slug,
    'canonical_url','https://ekodi.kr/'||v_store.operating_space_slug,
    'status',v_site.status,
    'provisioning_mode',v_site.provisioning_mode,
    'page_kicker',v_site.page_kicker,
    'page_lead',v_site.page_lead,
    'page_theme',v_site.page_theme,
    'page_description',v_site.page_description,
    'alias_slugs',v_site.alias_slugs,
    'provisioned_at',v_site.provisioned_at,
    'updated_at',v_site.updated_at,
    'generation_model','shared_shell_workspace_automatic',
    'generation_trigger','stores.operating_space_slug',
    'public_address',v_store.public_address,
    'public_phone',v_store.public_phone,
    'delivery_channels',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',c.provider,
        'display_name',c.display_name,
        'public_order_url',c.public_order_url,
        'connection_status',c.connection_status,
        'source_kind',c.source_kind
      ) order by c.display_name)
      from public.store_channel_profiles c
      where c.store_id=v_store.id and c.provider in ('baemin','coupang_eats','yogiyo','store')
    ),'[]'::jsonb)
  );
end
$$;

revoke all on function public.store_user_site_admin_snapshot(text) from public, anon;
grant execute on function public.store_user_site_admin_snapshot(text) to authenticated;

create or replace function public.update_storefront_public_settings(
  p_slug text,
  p_public_address text,
  p_public_phone text,
  p_baemin_url text default null,
  p_coupang_eats_url text default null,
  p_yogiyo_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store_id uuid;
  v_provider text;
  v_label text;
  v_url text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select id into v_store_id from public.stores where lower(operating_space_slug)=v_slug limit 1;  if v_store_id is null then
    raise exception 'workspace_not_found' using errcode='22023';
  end if;
  if not public.can_manage_store_user_site(v_store_id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  update public.stores
  set public_address=nullif(trim(coalesce(p_public_address,'')),''),
      public_phone=nullif(trim(coalesce(p_public_phone,'')),'')
  where id=v_store_id;

  for v_provider,v_label,v_url in
    select * from (values
      ('baemin'::text,'배달의민족'::text,nullif(trim(coalesce(p_baemin_url,'')),'')),
      ('coupang_eats'::text,'쿠팡이츠'::text,nullif(trim(coalesce(p_coupang_eats_url,'')),'')),
      ('yogiyo'::text,'요기요'::text,nullif(trim(coalesce(p_yogiyo_url,'')),''))
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
    )    on conflict(store_id,provider) do update
    set public_order_url=excluded.public_order_url,
        connection_status=case
          when excluded.public_order_url is not null
            and existing.connection_status not in ('active','ready') then 'ready'
          when excluded.public_order_url is null
            and existing.source_kind='manual_verified' then 'partner_required'
          else existing.connection_status
        end,
        source_kind=case
          when excluded.public_order_url is not null
            and existing.source_kind='not_connected' then 'manual_verified'
          when excluded.public_order_url is null
            and existing.source_kind='manual_verified' then 'not_connected'
          else existing.source_kind
        end,
        verified_at=case
          when excluded.public_order_url is not null then coalesce(existing.verified_at,now())
          when existing.source_kind='manual_verified' then null
          else existing.verified_at
        end,
        updated_at=now();
  end loop;

  return public.store_user_site_admin_snapshot(v_slug);
end
$$;

revoke all on function public.update_storefront_public_settings(text,text,text,text,text,text) from public, anon;
grant execute on function public.update_storefront_public_settings(text,text,text,text,text,text) to authenticated;