-- Repository alignment for store-scoped delivery platform administration.
-- Mirrors the production-safe ledger shape and adds only manager-scoped RPCs.

create table if not exists public.store_platform_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_order_ref text not null,
  order_display_no text,
  status text not null default 'received',
  fulfillment_type text not null default 'delivery',
  subtotal integer not null default 0 check (subtotal>=0),
  discount integer not null default 0 check (discount>=0),
  delivery_fee integer not null default 0 check (delivery_fee>=0),
  total integer not null default 0 check (total>=0),
  platform_fee integer not null default 0 check (platform_fee>=0),
  net_receivable integer,
  item_summary jsonb not null default '[]'::jsonb,
  customer_display text,
  delivery_area_hint text,
  platform_order_url text,
  ordered_at timestamptz not null,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  source_kind text not null default 'partner_import',
  source_url text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_order_ref)
);
create table if not exists public.store_platform_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_review_ref text not null,
  author_alias text,
  rating numeric check (rating is null or (rating>=0 and rating<=5)),
  review_body text,
  review_tags jsonb not null default '[]'::jsonb,
  review_url text,
  review_created_at timestamptz not null,
  reply_body text,
  reply_status text not null default 'unanswered',
  reply_draft text,
  reply_published_at timestamptz,
  source_kind text not null default 'partner_import',
  source_url text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_review_ref)
);

create table if not exists public.store_platform_settlements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_settlement_ref text not null,
  period_start date not null,  period_end date not null,
  gross_sales integer not null default 0,
  discounts integer not null default 0,
  platform_fees integer not null default 0,
  delivery_fees integer not null default 0,
  adjustments integer not null default 0,
  net_settlement integer not null default 0,
  paid_at timestamptz,
  source_kind text not null default 'partner_import',
  source_url text,
  captured_at timestamptz not null default now(),
  unique(store_id,provider,external_settlement_ref)
);

create table if not exists public.store_platform_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  action_type text not null,
  target_ref text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  approval_state text not null default 'user_approved',
  requested_by uuid,
  requested_at timestamptz not null default now(),
  executed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='store_platform_orders_provider_check') then
    alter table public.store_platform_orders add constraint store_platform_orders_provider_check
      check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_orders_status_check') then
    alter table public.store_platform_orders add constraint store_platform_orders_status_check
      check (status in ('received','accepted','preparing','ready','picked_up','delivering','completed','cancelled','rejected','unknown'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_orders_fulfillment_type_check') then
    alter table public.store_platform_orders add constraint store_platform_orders_fulfillment_type_check
      check (fulfillment_type in ('delivery','pickup','dine_in','unknown'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_orders_source_kind_check') then
    alter table public.store_platform_orders add constraint store_platform_orders_source_kind_check
      check (source_kind in ('official_api','partner_import','verified_file','manual_verified'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_orders_urls_https_chk') then
    alter table public.store_platform_orders add constraint store_platform_orders_urls_https_chk
      check ((platform_order_url is null or platform_order_url ~ '^https://') and (source_url is null or source_url ~ '^https://'));
  end if;
end $$;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='store_platform_reviews_provider_check') then
    alter table public.store_platform_reviews add constraint store_platform_reviews_provider_check
      check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_reviews_reply_status_check') then
    alter table public.store_platform_reviews add constraint store_platform_reviews_reply_status_check
      check (reply_status in ('unanswered','draft','queued','published','failed','not_supported'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_reviews_urls_https_chk') then
    alter table public.store_platform_reviews add constraint store_platform_reviews_urls_https_chk
      check ((review_url is null or review_url ~ '^https://') and (source_url is null or source_url ~ '^https://'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_settlements_source_url_https_chk') then
    alter table public.store_platform_settlements add constraint store_platform_settlements_source_url_https_chk
      check (source_url is null or source_url ~ '^https://');
  end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='store_platform_actions_action_type_check') then
    alter table public.store_platform_actions add constraint store_platform_actions_action_type_check
      check (action_type in ('review_reply','order_status_update','menu_availability_update','menu_price_update','sync_now'));
  end if;  if not exists(select 1 from pg_constraint where conname='store_platform_actions_status_check') then
    alter table public.store_platform_actions add constraint store_platform_actions_status_check
      check (status in ('draft','queued','running','completed','failed','cancelled','needs_connection'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_actions_approval_state_check') then
    alter table public.store_platform_actions add constraint store_platform_actions_approval_state_check
      check (approval_state in ('draft','user_approved','system_safe'));
  end if;
end $$;

create index if not exists store_platform_orders_store_time_idx
  on public.store_platform_orders(store_id,ordered_at desc);
create index if not exists store_platform_orders_store_provider_idx
  on public.store_platform_orders(store_id,provider,status,ordered_at desc);
create index if not exists store_platform_reviews_store_time_idx
  on public.store_platform_reviews(store_id,review_created_at desc);
create index if not exists store_platform_reviews_store_reply_idx
  on public.store_platform_reviews(store_id,reply_status,review_created_at desc);
create index if not exists store_platform_settlements_store_period_idx
  on public.store_platform_settlements(store_id,period_end desc);
create index if not exists store_platform_actions_store_status_idx
  on public.store_platform_actions(store_id,status,requested_at desc);

alter table public.store_platform_orders enable row level security;
alter table public.store_platform_reviews enable row level security;
alter table public.store_platform_settlements enable row level security;
alter table public.store_platform_actions enable row level security;
drop policy if exists store_platform_orders_admin on public.store_platform_orders;
create policy store_platform_orders_admin on public.store_platform_orders
  for all to authenticated using (public.can_manage_store_user_site(store_id))
  with check (public.can_manage_store_user_site(store_id));
drop policy if exists store_platform_reviews_admin on public.store_platform_reviews;
create policy store_platform_reviews_admin on public.store_platform_reviews
  for all to authenticated using (public.can_manage_store_user_site(store_id))
  with check (public.can_manage_store_user_site(store_id));
drop policy if exists store_platform_settlements_admin on public.store_platform_settlements;
create policy store_platform_settlements_admin on public.store_platform_settlements
  for all to authenticated using (public.can_manage_store_user_site(store_id))
  with check (public.can_manage_store_user_site(store_id));
drop policy if exists store_platform_actions_admin on public.store_platform_actions;
create policy store_platform_actions_admin on public.store_platform_actions
  for all to authenticated using (public.can_manage_store_user_site(store_id))
  with check (public.can_manage_store_user_site(store_id));

revoke all on public.store_platform_orders, public.store_platform_reviews,
  public.store_platform_settlements, public.store_platform_actions from anon, authenticated;
grant select on public.store_platform_orders, public.store_platform_reviews,
  public.store_platform_settlements, public.store_platform_actions to authenticated;

create or replace function public.store_delivery_platform_admin_snapshot(p_slug text,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_store_id uuid; v_days integer:=greatest(1,least(365,coalesce(p_days,30))); v_since timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  v_since:=now()-(v_days||' days')::interval;  return jsonb_build_object(
    'window_days',v_days,
    'summary',jsonb_build_object(
      'orders',(select count(*) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since),
      'gross_sales',(select coalesce(sum(o.total),0) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since and o.status='completed'),
      'net_receivable',(select coalesce(sum(coalesce(o.net_receivable,o.total-o.platform_fee)),0) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since and o.status='completed'),
      'unanswered_reviews',(select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.reply_status in ('unanswered','draft','failed')),
      'avg_rating',(select round(avg(r.rating)::numeric,2) from public.store_platform_reviews r where r.store_id=v_store_id and r.review_created_at>=v_since)
    ),
    'channels',coalesce((select jsonb_agg(x.obj order by x.provider) from (
      select provider,jsonb_build_object(
        'provider',provider,'orders',count(*),
        'sales',coalesce(sum(total) filter(where status='completed'),0),
        'unanswered_reviews',(select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.provider=o.provider and r.reply_status in ('unanswered','draft','failed'))
      ) obj
      from public.store_platform_orders o where store_id=v_store_id and ordered_at>=v_since group by provider
    )x),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(x.obj order by x.ordered_at desc) from (
      select ordered_at,jsonb_build_object(
        'id',id,'provider',provider,'order_no',coalesce(order_display_no,external_order_ref),
        'status',status,'fulfillment_type',fulfillment_type,'total',total,'net_receivable',net_receivable,
        'items',item_summary,'customer_display',customer_display,'delivery_area_hint',delivery_area_hint,
        'order_url',platform_order_url,'ordered_at',ordered_at,'completed_at',completed_at
      ) obj from public.store_platform_orders where store_id=v_store_id and ordered_at>=v_since order by ordered_at desc limit 100
    )x),'[]'::jsonb),    'reviews',coalesce((select jsonb_agg(x.obj order by x.review_created_at desc) from (
      select review_created_at,jsonb_build_object(
        'id',id,'provider',provider,'rating',rating,'author_alias',author_alias,
        'body',review_body,'url',review_url,'created_at',review_created_at,
        'reply_status',reply_status,'reply_body',reply_body,'reply_draft',reply_draft
      ) obj from public.store_platform_reviews where store_id=v_store_id order by review_created_at desc limit 100
    )x),'[]'::jsonb),
    'settlements',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',provider,'period_start',period_start,'period_end',period_end,
      'gross_sales',gross_sales,'platform_fees',platform_fees,'delivery_fees',delivery_fees,
      'net_settlement',net_settlement,'paid_at',paid_at
    ) order by period_end desc) from public.store_platform_settlements
      where store_id=v_store_id and period_end>=current_date-v_days),'[]'::jsonb)
  );
end $$;

revoke all on function public.store_delivery_platform_admin_snapshot(text,integer) from public,anon;
grant execute on function public.store_delivery_platform_admin_snapshot(text,integer) to authenticated;

create or replace function public.store_platform_review_save_draft(p_slug text,p_review_id uuid,p_draft text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_exists boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  select true into v_exists from public.store_platform_reviews where id=p_review_id and store_id=v_store_id;
  if not coalesce(v_exists,false) then raise exception 'review_not_found' using errcode='22023'; end if;
  update public.store_platform_reviews set reply_draft=nullif(trim(coalesce(p_draft,'')),''),
    reply_status=case when nullif(trim(coalesce(p_draft,'')),'') is null then 'unanswered' else 'draft' end,updated_at=now()
  where id=p_review_id and store_id=v_store_id;
  return jsonb_build_object('ok',true,'review_id',p_review_id);
end $$;
revoke all on function public.store_platform_review_save_draft(text,uuid,text) from public,anon;
grant execute on function public.store_platform_review_save_draft(text,uuid,text) to authenticated;

create or replace function public.store_platform_review_queue_reply(p_slug text,p_review_id uuid,p_reply text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_provider text; v_target text; v_action_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_reply,'')),'') is null then raise exception 'reply_required' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  select provider,external_review_ref into v_provider,v_target from public.store_platform_reviews where id=p_review_id and store_id=v_store_id;
  if v_provider is null then raise exception 'review_not_found' using errcode='22023'; end if;
  insert into public.store_platform_actions(store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by)
  values(v_store_id,v_provider,'review_reply',v_target,jsonb_build_object('review_id',p_review_id,'reply',trim(p_reply)),'queued','user_approved',auth.uid()) returning id into v_action_id;
  update public.store_platform_reviews set reply_draft=trim(p_reply),reply_status='queued',updated_at=now()
  where id=p_review_id and store_id=v_store_id;
  return jsonb_build_object('ok',true,'action_id',v_action_id,'review_id',p_review_id,'status','queued');
end $$;

revoke all on function public.store_platform_review_queue_reply(text,uuid,text) from public,anon;
grant execute on function public.store_platform_review_queue_reply(text,uuid,text) to authenticated;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='store_platform_actions_provider_check') then
    alter table public.store_platform_actions add constraint store_platform_actions_provider_check
      check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));
  end if;
  if not exists(select 1 from pg_constraint where conname='store_platform_actions_payload_secrets_chk') then
    alter table public.store_platform_actions add constraint store_platform_actions_payload_secrets_chk
      check (payload::text !~* '(token|secret|password|authorization|cookie)');
  end if;
end $$;

create or replace function public.store_platform_sync_queue(p_slug text,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_provider text:=lower(trim(coalesce(p_provider,''))); v_action_id uuid; v_ready boolean:=false; v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order') then raise exception 'unsupported_platform_provider' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  select coalesce(connection_status in ('ready','active') and source_kind in ('official_api','partner_import'),false) into v_ready
  from public.store_channel_profiles where store_id=v_store_id and provider=v_provider;
  v_status:=case when coalesce(v_ready,false) then 'queued' else 'needs_connection' end;
  insert into public.store_platform_actions(store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by)
  values(v_store_id,v_provider,'sync_now',v_provider,jsonb_build_object('scope','full'),v_status,'user_approved',auth.uid()) returning id into v_action_id;
  return jsonb_build_object('ok',true,'action_id',v_action_id,'provider',v_provider,'status',v_status);
end $$;

revoke all on function public.store_platform_sync_queue(text,text) from public,anon;
grant execute on function public.store_platform_sync_queue(text,text) to authenticated;
create or replace function public.store_platform_order_queue_action(p_slug text,p_order_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_provider text; v_target text; v_action text:=lower(trim(coalesce(p_action,''))); v_desired text; v_ready boolean:=false; v_status text; v_action_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_action not in ('accept','ready','complete','cancel') then raise exception 'unsupported_order_action' using errcode='22023'; end if;
  v_desired:=case v_action when 'accept' then 'accepted' when 'ready' then 'ready' when 'complete' then 'completed' else 'cancelled' end;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  select provider,external_order_ref into v_provider,v_target from public.store_platform_orders where id=p_order_id and store_id=v_store_id;
  if v_provider is null then raise exception 'order_not_found' using errcode='22023'; end if;
  select coalesce(connection_status in ('ready','active') and source_kind in ('official_api','partner_import'),false) into v_ready
  from public.store_channel_profiles where store_id=v_store_id and provider=v_provider;
  v_status:=case when coalesce(v_ready,false) then 'queued' else 'needs_connection' end;
  insert into public.store_platform_actions(store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by)
  values(v_store_id,v_provider,'order_status_update',v_target,jsonb_build_object('order_id',p_order_id,'requested_action',v_action,'desired_status',v_desired),v_status,'user_approved',auth.uid()) returning id into v_action_id;
  return jsonb_build_object('ok',true,'action_id',v_action_id,'order_id',p_order_id,'status',v_status,'desired_status',v_desired);
end $$;

revoke all on function public.store_platform_order_queue_action(text,uuid,text) from public,anon;
grant execute on function public.store_platform_order_queue_action(text,uuid,text) to authenticated;

comment on table public.store_platform_actions is 'Human-approved store platform action queue. Actual external mutation requires an approved platform adapter.';
comment on function public.store_delivery_platform_admin_snapshot(text,integer) is 'Tenant-scoped delivery platform operations snapshot for each store administrator.';
-- Add consumer order channels used by the store customer/admin surfaces.
alter table public.store_channel_profiles drop constraint if exists store_channel_profiles_provider_check;
alter table public.store_channel_profiles add constraint store_channel_profiles_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));
alter table public.store_channel_menu_listings drop constraint if exists store_channel_menu_listings_provider_check;
alter table public.store_channel_menu_listings add constraint store_channel_menu_listings_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));

insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind)
select s.id,p.provider,p.display_name,'partner_required','not_connected'
from public.stores s cross join (values
  ('daangn'::text,'당근 주문'::text),('naver_order'::text,'네이버 주문'::text)
) p(provider,display_name)
where s.operating_space_slug is not null
on conflict(store_id,provider) do nothing;

create or replace function public.store_platform_menu_queue_action(
  p_slug text,p_provider text,p_external_item_ref text,p_action text,p_value text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_provider text:=lower(trim(coalesce(p_provider,''))); v_action text:=lower(trim(coalesce(p_action,''))); v_ref text:=trim(coalesce(p_external_item_ref,'')); v_action_id uuid; v_ready boolean:=false; v_status text; v_type text; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order') then raise exception 'unsupported_platform_provider' using errcode='22023'; end if;
  if v_action not in ('price','available','sold_out') then raise exception 'unsupported_menu_action' using errcode='22023'; end if;
  if v_ref='' then raise exception 'menu_listing_required' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;  if not exists(select 1 from public.store_channel_menu_listings where store_id=v_store_id and provider=v_provider and external_item_ref=v_ref) then
    raise exception 'menu_listing_not_found' using errcode='22023';
  end if;
  select coalesce(connection_status in ('ready','active') and source_kind='official_api',false) into v_ready
  from public.store_channel_profiles where store_id=v_store_id and provider=v_provider;
  v_status:=case when coalesce(v_ready,false) then 'queued' else 'needs_connection' end;
  if v_action='price' then
    if trim(coalesce(p_value,'')) !~ '^[0-9]+$' or p_value::integer<0 then raise exception 'invalid_menu_price' using errcode='22023'; end if;
    v_type:='menu_price_update'; v_payload:=jsonb_build_object('listed_price',p_value::integer);
  else
    v_type:='menu_availability_update'; v_payload:=jsonb_build_object('availability',v_action);
  end if;
  insert into public.store_platform_actions(store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by)
  values(v_store_id,v_provider,v_type,v_ref,v_payload,v_status,'user_approved',auth.uid()) returning id into v_action_id;
  return jsonb_build_object('ok',true,'action_id',v_action_id,'provider',v_provider,'status',v_status,'action',v_action);
end $$;

revoke all on function public.store_platform_menu_queue_action(text,text,text,text,text) from public,anon;
grant execute on function public.store_platform_menu_queue_action(text,text,text,text,text) to authenticated;

comment on function public.store_platform_sync_queue(text,text) is 'Queues a store-scoped platform sync. Missing write-capable connection remains needs_connection.';
comment on function public.store_platform_order_queue_action(text,uuid,text) is 'Queues a human-approved platform order status change without claiming external completion.';
comment on function public.store_platform_menu_queue_action(text,text,text,text,text) is 'Queues a human-approved platform menu change; official write capability is required for execution.';
create or replace function public.store_user_site_admin_snapshot_v3(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_base jsonb; v_store_id uuid;
begin
  v_base:=public.store_user_site_admin_snapshot_v2(p_slug);
  v_store_id:=nullif(v_base->>'store_id','')::uuid;
  return v_base || jsonb_build_object('delivery_channels',coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider',c.provider,'display_name',c.display_name,'public_order_url',c.public_order_url,
      'connection_status',c.connection_status,'source_kind',c.source_kind,'verified_at',c.verified_at
    ) order by case c.provider when 'ddangyo' then 1 when 'baemin' then 2 when 'yogiyo' then 3
      when 'mukkebi' then 4 when 'coupang_eats' then 5 when 'daangn' then 6 when 'naver_order' then 7 when 'store' then 8 else 9 end)
    from public.store_channel_profiles c where c.store_id=v_store_id
      and c.provider in ('ddangyo','baemin','yogiyo','mukkebi','coupang_eats','daangn','naver_order','store')
  ),'[]'::jsonb));
end $$;

revoke all on function public.store_user_site_admin_snapshot_v3(text) from public,anon;
grant execute on function public.store_user_site_admin_snapshot_v3(text) to authenticated;

create or replace function public.update_storefront_public_settings_v3(
  p_slug text,p_public_address text,p_public_phone text,
  p_baemin_url text default null,p_coupang_eats_url text default null,p_yogiyo_url text default null,
  p_ddangyo_url text default null,p_mukkebi_url text default null,p_daangn_url text default null,p_naver_order_url text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid; v_provider text; v_label text; v_url text;
begin
  perform public.update_storefront_public_settings_v2(p_slug,p_public_address,p_public_phone,p_baemin_url,p_coupang_eats_url,p_yogiyo_url,p_ddangyo_url,p_mukkebi_url);
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;  for v_provider,v_label,v_url in select * from (values
    ('daangn'::text,'당근 주문'::text,nullif(trim(coalesce(p_daangn_url,'')),'')),
    ('naver_order'::text,'네이버 주문'::text,nullif(trim(coalesce(p_naver_order_url,'')),''))
  ) q(provider,label,url)
  loop
    if v_url is not null and v_url !~ '^https://' then raise exception 'invalid_public_order_url' using errcode='22023'; end if;
    insert into public.store_channel_profiles as existing(
      store_id,provider,display_name,connection_status,source_kind,public_order_url,verified_at
    ) values (
      v_store_id,v_provider,v_label,
      case when v_url is null then 'partner_required' else 'ready' end,
      case when v_url is null then 'not_connected' else 'manual_verified' end,
      v_url,case when v_url is null then null else now() end
    ) on conflict(store_id,provider) do update
    set display_name=excluded.display_name,public_order_url=excluded.public_order_url,
        connection_status=excluded.connection_status,source_kind=excluded.source_kind,
        verified_at=excluded.verified_at,updated_at=now();
  end loop;
  return public.store_user_site_admin_snapshot_v3(p_slug);
end $$;

revoke all on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text) to authenticated;

comment on function public.update_storefront_public_settings_v3(text,text,text,text,text,text,text,text,text,text)
  is 'Store-manager public contact and verified order-link settings for seven supported consumer order channels.';