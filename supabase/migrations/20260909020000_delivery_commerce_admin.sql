-- EKODI Delivery Commerce Intelligence: store-scoped delivery-platform operations.
-- Keeps each store admin isolated while enabling menu, order, sales, review and reply workflows.

alter table public.store_channel_profiles
  add column if not exists sync_mode text not null default 'manual',
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists last_error text,
  add column if not exists last_success_at timestamptz;

alter table public.store_channel_profiles
  drop constraint if exists store_channel_profiles_sync_mode_check;
alter table public.store_channel_profiles
  add constraint store_channel_profiles_sync_mode_check
  check (sync_mode in ('official_api','partner_api','browser_session','file_import','manual','disabled'));

alter table public.store_channel_profiles drop constraint if exists store_channel_profiles_provider_check;
alter table public.store_channel_profiles add constraint store_channel_profiles_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));

alter table public.store_channel_menu_listings drop constraint if exists store_channel_menu_listings_provider_check;
alter table public.store_channel_menu_listings add constraint store_channel_menu_listings_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));

create table if not exists public.store_delivery_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_order_ref text not null,
  order_status text not null default 'unknown',
  fulfillment_type text not null default 'unknown',
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null default 0 check (total >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  ordered_at timestamptz not null default now(),
  source_kind text not null default 'manual_verified',
  source_url text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_order_ref),
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order')),
  check (order_status in ('received','accepted','preparing','ready','delivering','completed','cancelled','unknown')),
  check (fulfillment_type in ('delivery','pickup','unknown')),
  check (source_url is null or source_url ~ '^https://')
);

create table if not exists public.store_delivery_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_review_ref text not null,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  author_alias text,
  review_text text not null default '',
  reviewed_at timestamptz not null default now(),
  reply_text text,
  reply_status text not null default 'not_replied',
  reply_external_ref text,
  replied_at timestamptz,
  source_kind text not null default 'manual_verified',
  source_url text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_review_ref),
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order')),
  check (reply_status in ('not_replied','draft','pending_sync','sent','failed','not_supported')),
  check (source_url is null or source_url ~ '^https://')
);

create index if not exists store_delivery_orders_store_time_idx
  on public.store_delivery_orders(store_id,ordered_at desc);
create index if not exists store_delivery_reviews_store_time_idx
  on public.store_delivery_reviews(store_id,reviewed_at desc);

create table if not exists public.store_delivery_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  target_type text not null,
  target_ref text not null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_by uuid,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order')),
  check (target_type in ('store','menu','order','review')),
  check (status in ('queued','sent','succeeded','failed','cancelled'))
);
create index if not exists store_delivery_actions_queue_idx
  on public.store_delivery_actions(status,created_at) where status='queued';

alter table public.store_delivery_orders enable row level security;
alter table public.store_delivery_reviews enable row level security;
alter table public.store_delivery_actions enable row level security;
revoke all on public.store_delivery_orders from public,anon,authenticated;
revoke all on public.store_delivery_reviews from public,anon,authenticated;
revoke all on public.store_delivery_actions from public,anon,authenticated;

create or replace function public.store_delivery_commerce_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug,'')));
  v_store_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  select id into v_store_id from public.stores
   where lower(operating_space_slug)=v_slug limit 1;
  if v_store_id is null then
    raise exception 'workspace_not_found' using errcode='22023';
  end if;
  if not public.can_manage_store_user_site(v_store_id) then
    raise exception 'workspace_admin_required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'store_id',v_store_id,
    'channels',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',c.provider,'display_name',c.display_name,'platform_store_name',c.platform_store_name,
      'connection_status',c.connection_status,'source_kind',c.source_kind,'sync_mode',c.sync_mode,
      'capabilities',c.capabilities,'public_order_url',c.public_order_url,'source_url',c.source_url,
      'last_success_at',c.last_success_at,'last_error',c.last_error,'verified_at',c.verified_at
    ) order by c.provider) from public.store_channel_profiles c where c.store_id=v_store_id),'[]'::jsonb),
    'orders',jsonb_build_object(
      'today_count',(select count(*) from public.store_delivery_orders o where o.store_id=v_store_id and (o.ordered_at at time zone 'Asia/Seoul')::date=v_today),
      'today_sales',(select coalesce(sum(o.total),0) from public.store_delivery_orders o where o.store_id=v_store_id and o.order_status='completed' and (o.ordered_at at time zone 'Asia/Seoul')::date=v_today),
      'pending_count',(select count(*) from public.store_delivery_orders o where o.store_id=v_store_id and o.order_status in ('received','accepted','preparing','ready','delivering')),
      'recent',coalesce((select jsonb_agg(x.row_data order by x.ordered_at desc) from (
        select o.ordered_at,jsonb_build_object('provider',o.provider,'external_order_ref',o.external_order_ref,
          'order_status',o.order_status,'fulfillment_type',o.fulfillment_type,'subtotal',o.subtotal,
          'discount',o.discount,'delivery_fee',o.delivery_fee,'total',o.total,'item_count',o.item_count,
          'ordered_at',o.ordered_at,'last_synced_at',o.last_synced_at) row_data
        from public.store_delivery_orders o where o.store_id=v_store_id order by o.ordered_at desc limit 100
      ) x),'[]'::jsonb)
    ),
    'reviews',jsonb_build_object(
      'unanswered_count',(select count(*) from public.store_delivery_reviews r where r.store_id=v_store_id and r.reply_status in ('not_replied','draft','failed')),
      'average_rating',(select coalesce(round(avg(r.rating)::numeric,2),0) from public.store_delivery_reviews r where r.store_id=v_store_id and r.rating is not null),
      'recent',coalesce((select jsonb_agg(x.row_data order by x.reviewed_at desc) from (
        select r.reviewed_at,jsonb_build_object('provider',r.provider,'external_review_ref',r.external_review_ref,
          'rating',r.rating,'author_alias',r.author_alias,'review_text',r.review_text,'reviewed_at',r.reviewed_at,
          'reply_text',r.reply_text,'reply_status',r.reply_status,'replied_at',r.replied_at,
          'last_synced_at',r.last_synced_at) row_data
        from public.store_delivery_reviews r where r.store_id=v_store_id order by r.reviewed_at desc limit 100
      ) x),'[]'::jsonb)
    ),
    'actions',coalesce((select jsonb_agg(x.row_data order by x.created_at desc) from (
      select a.created_at,jsonb_build_object('id',a.id,'provider',a.provider,'target_type',a.target_type,
        'target_ref',a.target_ref,'action_type',a.action_type,'status',a.status,
        'error_message',a.error_message,'created_at',a.created_at,'completed_at',a.completed_at) row_data
      from public.store_delivery_actions a where a.store_id=v_store_id order by a.created_at desc limit 50
    ) x),'[]'::jsonb)
  );
end
$$;

revoke all on function public.store_delivery_commerce_snapshot(text) from public,anon;
grant execute on function public.store_delivery_commerce_snapshot(text) to authenticated;
comment on function public.store_delivery_commerce_snapshot(text) is
  'Store-scoped delivery commerce admin snapshot. No customer phone/address is returned.';

create or replace function public.queue_store_delivery_action(
  p_slug text,p_provider text,p_target_type text,p_target_ref text,p_action_type text,p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_store_id uuid; v_id uuid; v_provider text:=lower(trim(coalesce(p_provider,'')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order') then raise exception 'unsupported_provider' using errcode='22023'; end if;
  if p_target_type not in ('store','menu','order','review') then raise exception 'unsupported_target_type' using errcode='22023'; end if;
  insert into public.store_delivery_actions(store_id,provider,target_type,target_ref,action_type,payload,created_by)
  values(v_store_id,v_provider,p_target_type,trim(p_target_ref),trim(p_action_type),coalesce(p_payload,'{}'::jsonb),auth.uid()) returning id into v_id;
  return jsonb_build_object('ok',true,'action_id',v_id,'status','queued');
end
$$;
revoke all on function public.queue_store_delivery_action(text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.queue_store_delivery_action(text,text,text,text,text,jsonb) to authenticated;

create or replace function public.save_store_delivery_review_reply(
  p_slug text,p_provider text,p_external_review_ref text,p_reply_text text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_store_id uuid; v_action uuid; v_reply text:=trim(coalesce(p_reply_text,''));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  if length(v_reply)<1 or length(v_reply)>2000 then raise exception 'invalid_reply_length' using errcode='22023'; end if;
  update public.store_delivery_reviews
     set reply_text=v_reply,reply_status='pending_sync',updated_at=now()
   where store_id=v_store_id and provider=lower(trim(p_provider)) and external_review_ref=trim(p_external_review_ref);
  if not found then raise exception 'review_not_found' using errcode='22023'; end if;
  insert into public.store_delivery_actions(store_id,provider,target_type,target_ref,action_type,payload,created_by)
  values(v_store_id,lower(trim(p_provider)),'review',trim(p_external_review_ref),'reply_review',jsonb_build_object('reply_text',v_reply),auth.uid())
  returning id into v_action;
  return jsonb_build_object('ok',true,'status','pending_sync','action_id',v_action);
end
$$;
revoke all on function public.save_store_delivery_review_reply(text,text,text,text) from public,anon;
grant execute on function public.save_store_delivery_review_reply(text,text,text,text) to authenticated;

with providers(provider,display_name,capabilities) as (
  values
    ('ddangyo','?↔꺼??,'{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('baemin','諛곕떖?섎?議?,'{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('yogiyo','?붽린??,'{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('mukkebi','癒밴묠鍮?,'{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('coupang_eats','荑좏뙜?댁툩','{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('daangn','?밴렐二쇰Ц','{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb),
    ('naver_order','?ㅼ씠踰꾩＜臾?,'{"store":true,"menu":true,"orders":true,"sales":true,"reviews":true,"replies":true}'::jsonb)
)
insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind,sync_mode,capabilities)
select s.id,p.provider,p.display_name,'partner_required','not_connected','manual',p.capabilities
from public.stores s cross join providers p
where lower(s.operating_space_slug) in ('jadam','pizzamaru','yogurt')
on conflict(store_id,provider) do update
set display_name=excluded.display_name,capabilities=excluded.capabilities,updated_at=now();

create or replace function public.import_store_platform_menu_snapshot_v2(
  p_slug text,p_provider text,p_items jsonb,p_store_order_url text default null,
  p_source_url text default null,p_platform_store_name text default null
) returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare
  v_store_id uuid; v_provider text:=lower(trim(coalesce(p_provider,''))); v_item jsonb;
  v_menu_id uuid; v_name text; v_ref text; v_price integer; v_image text; v_order text; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_provider not in ('ddangyo','baemin','yogiyo','mukkebi','coupang_eats','daangn','naver_order') then raise exception 'unsupported_provider' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'items_must_be_array' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  insert into public.store_channel_profiles as c(store_id,provider,display_name,platform_store_name,connection_status,source_kind,sync_mode,public_order_url,source_url,verified_at,last_success_at,last_synced_at)
  values(v_store_id,v_provider,case v_provider when 'ddangyo' then '?↔꺼?? when 'baemin' then '諛곕떖?섎?議? when 'yogiyo' then '?붽린?? when 'mukkebi' then '癒밴묠鍮? when 'coupang_eats' then '荑좏뙜?댁툩' when 'daangn' then '?밴렐二쇰Ц' else '?ㅼ씠踰꾩＜臾? end,
    nullif(trim(coalesce(p_platform_store_name,'')),''),'ready','manual_verified','manual',nullif(trim(coalesce(p_store_order_url,'')),''),nullif(trim(coalesce(p_source_url,'')),''),now(),now(),now())
  on conflict(store_id,provider) do update set platform_store_name=coalesce(excluded.platform_store_name,c.platform_store_name),connection_status='ready',source_kind='manual_verified',public_order_url=coalesce(excluded.public_order_url,c.public_order_url),source_url=coalesce(excluded.source_url,c.source_url),verified_at=now(),last_success_at=now(),last_synced_at=now(),updated_at=now();
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_name:=nullif(trim(coalesce(v_item->>'canonical_name',v_item->>'name','')),'');
    if v_name is null then continue; end if;
    v_ref:=coalesce(nullif(trim(coalesce(v_item->>'external_item_ref','')),''),'manual:'||md5(lower(v_name)));
    v_price:=case when regexp_replace(coalesce(v_item->>'price',''),'[^0-9]','','g')='' then null else regexp_replace(v_item->>'price','[^0-9]','','g')::integer end;
    v_image:=nullif(trim(coalesce(v_item->>'image_url','')),'');
    v_order:=coalesce(nullif(trim(coalesce(v_item->>'order_url','')),''),nullif(trim(coalesce(p_store_order_url,'')),''));
    if v_image is not null and v_image !~ '^https://' then raise exception 'invalid_image_url' using errcode='22023'; end if;
    if v_order is not null and v_order !~ '^https://' then raise exception 'invalid_order_url' using errcode='22023'; end if;
    select id into v_menu_id from public.store_menu_items where store_id=v_store_id and lower(canonical_name)=lower(v_name) order by created_at limit 1;
    if v_menu_id is null then
      insert into public.store_menu_items(store_id,canonical_name,category,description,image_url,availability,source_basis,source_url,verified_at)
      values(v_store_id,v_name,nullif(trim(coalesce(v_item->>'category','')),''),nullif(trim(coalesce(v_item->>'description','')),''),v_image,'available','platform_verified',nullif(trim(coalesce(p_source_url,'')),''),now()) returning id into v_menu_id;
    end if;
    insert into public.store_channel_menu_listings as l(store_id,menu_item_id,provider,external_item_ref,listing_name,listing_description,listed_price,options,availability,source_kind,captured_at,last_synced_at,image_url,public_order_url,source_url,verified_at)
    values(v_store_id,v_menu_id,v_provider,v_ref,coalesce(nullif(trim(coalesce(v_item->>'name','')),''),v_name),nullif(trim(coalesce(v_item->>'description','')),''),v_price,coalesce(v_item->'options','[]'::jsonb),case when coalesce(v_item->>'availability','available') in ('available','sold_out','hidden','unknown') then coalesce(v_item->>'availability','available') else 'unknown' end,'manual_verified',now(),now(),v_image,v_order,coalesce(nullif(trim(coalesce(v_item->>'source_url','')),''),nullif(trim(coalesce(p_source_url,'')),'')),now())
    on conflict(store_id,provider,external_item_ref) where external_item_ref is not null do update
    set menu_item_id=excluded.menu_item_id,listing_name=excluded.listing_name,listing_description=excluded.listing_description,listed_price=excluded.listed_price,options=excluded.options,availability=excluded.availability,source_kind='manual_verified',captured_at=now(),last_synced_at=now(),image_url=coalesce(excluded.image_url,l.image_url),public_order_url=coalesce(excluded.public_order_url,l.public_order_url),source_url=coalesce(excluded.source_url,l.source_url),verified_at=now(),updated_at=now();
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'provider',v_provider,'imported',v_count,'store_id',v_store_id);
end
$$;
revoke all on function public.import_store_platform_menu_snapshot_v2(text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.import_store_platform_menu_snapshot_v2(text,text,jsonb,text,text,text) to authenticated;

comment on table public.store_delivery_orders is 'Store-scoped delivery-platform order mirror. Customer PII is intentionally excluded.';
comment on table public.store_delivery_reviews is 'Store-scoped delivery-platform review mirror with reply synchronization state.';
comment on table public.store_delivery_actions is 'Queued store-manager actions awaiting an authorized delivery-platform connector.';

create or replace function public.store_user_site_admin_snapshot_v2(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public,auth
as $$declare v_base jsonb; v_store_id uuid;
begin
  v_base:=public.store_user_site_admin_snapshot(p_slug);
  v_store_id:=nullif(v_base->>'store_id','')::uuid;
  return v_base||jsonb_build_object('delivery_channels',coalesce((select jsonb_agg(jsonb_build_object(
    'provider',c.provider,'display_name',c.display_name,'public_order_url',c.public_order_url,
    'connection_status',c.connection_status,'source_kind',c.source_kind,'sync_mode',c.sync_mode,
    'capabilities',c.capabilities,'verified_at',c.verified_at,'last_success_at',c.last_success_at
  ) order by case c.provider when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3 when 'mukkebi' then 4 when 'coupang_eats' then 5 when 'daangn' then 6 when 'naver_order' then 7 when 'store' then 8 else 9 end)
  from public.store_channel_profiles c where c.store_id=v_store_id),'[]'::jsonb));
end$$;
revoke all on function public.store_user_site_admin_snapshot_v2(text) from public,anon;
grant execute on function public.store_user_site_admin_snapshot_v2(text) to authenticated;

create or replace function public.update_storefront_public_settings_v3(
  p_slug text,p_public_address text,p_public_phone text,
  p_baemin_url text default null,p_coupang_eats_url text default null,p_yogiyo_url text default null,
  p_ddangyo_url text default null,p_mukkebi_url text default null,p_daangn_url text default null,p_naver_order_url text default null
) returns jsonb language plpgsql security definer set search_path=public,auth
as $$declare v_store_id uuid; v_provider text; v_label text; v_url text;
begin
  perform public.update_storefront_public_settings_v2(p_slug,p_public_address,p_public_phone,p_baemin_url,p_coupang_eats_url,p_yogiyo_url,p_ddangyo_url,p_mukkebi_url);
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  for v_provider,v_label,v_url in select * from (values
    ('daangn'::text,'?밴렐二쇰Ц'::text,nullif(trim(coalesce(p_daangn_url,'')),'')),
    ('naver_order'::text,'?ㅼ씠踰꾩＜臾?::text,nullif(trim(coalesce(p_naver_order_url,'')),''))
  ) q(provider,label,url) loop
    if v_url is not null and v_url !~ '^https://' then raise exception 'invalid_public_order_url' using errcode='22023'; end if;
    insert into public.store_channel_profiles as c(store_id,provider,display_name,connection_status,source_kind,public_order_url,verified_at)
    values(v_store_id,v_provider,v_label,case when v_url is null then 'partner_required' else 'ready' end,case when v_url is null then 'not_connected' else 'manual_verified' end,v_url,case when v_url is null then null else now() end)
    on conflict(store_id,provider) do update set public_order_url=excluded.public_order_url,connection_status=excluded.connection_status,source_kind=excluded.source_kind,verified_at=excluded.verified_at,updated_at=now();
  end loop;
  return public.store_user_site_admin_snapshot_v2(p_slug);
end$$;
revoke all on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) to authenticated;

