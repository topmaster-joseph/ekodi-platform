-- EKODI Gen10 Commerce Intelligence
-- Store-scoped delivery-platform operations, read/write capability ledger, and privacy-safe learning events.
-- Official API / merchant connections are preferred. Public discovery is read-only and never promoted to authoritative write access.

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

alter table public.store_channel_profiles
  drop constraint if exists store_channel_profiles_source_kind_check;
alter table public.store_channel_profiles
  add constraint store_channel_profiles_source_kind_check
  check (source_kind in ('not_connected','official_api','partner_import','verified_file','manual_verified','public_discovery'));

alter table public.store_channel_menu_listings
  drop constraint if exists store_channel_menu_listings_source_kind_check;
alter table public.store_channel_menu_listings
  add constraint store_channel_menu_listings_source_kind_check
  check (source_kind in ('official_api','partner_import','verified_file','manual_verified','public_discovery'));

alter table public.store_channel_profiles
  add column if not exists connection_mode text not null default 'none',
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists sync_interval_minutes integer,
  add column if not exists next_sync_at timestamptz,
  add column if not exists last_error_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='store_channel_profiles_connection_mode_chk'
      and conrelid='public.store_channel_profiles'::regclass
  ) then
    alter table public.store_channel_profiles add constraint store_channel_profiles_connection_mode_chk
      check (connection_mode in ('none','official_api','merchant_connection','partner_import','public_discovery','manual_verified'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname='store_channel_profiles_sync_interval_chk'
      and conrelid='public.store_channel_profiles'::regclass
  ) then
    alter table public.store_channel_profiles add constraint store_channel_profiles_sync_interval_chk
      check (sync_interval_minutes is null or sync_interval_minutes between 15 and 10080);
  end if;
end
$$;

insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind,connection_mode,capabilities)
select s.id,p.provider,p.display_name,'partner_required','not_connected','none','{}'::jsonb
from public.stores s
cross join (values
  ('daangn_order'::text,'당근주문'::text),
  ('naver_order'::text,'네이버주문'::text)
) p(provider,display_name)
where s.operating_space_slug is not null
on conflict(store_id,provider) do nothing;

create table if not exists public.store_platform_sync_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order')),
  sync_kind text not null check (sync_kind in ('store','menu','orders','sales','reviews','full')),
  source_kind text not null check (source_kind in ('official_api','partner_import','verified_file','manual_verified','public_discovery')),
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','blocked')),
  source_url text,
  records_seen integer not null default 0 check (records_seen>=0),
  records_changed integer not null default 0 check (records_changed>=0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  check (source_url is null or source_url ~ '^https://')
);
create index if not exists store_platform_sync_runs_store_provider_idx
  on public.store_platform_sync_runs(store_id,provider,started_at desc);

create table if not exists public.store_platform_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order')),
  external_order_ref text not null,
  status text not null default 'unknown' check (status in ('received','accepted','preparing','ready','delivering','completed','cancelled','refunded','unknown')),
  ordered_at timestamptz not null,
  fulfilled_at timestamptz,
  gross_amount integer check (gross_amount is null or gross_amount>=0),
  discount_amount integer check (discount_amount is null or discount_amount>=0),
  platform_fee integer check (platform_fee is null or platform_fee>=0),
  delivery_fee integer check (delivery_fee is null or delivery_fee>=0),
  net_amount integer,
  item_count integer not null default 0 check (item_count>=0),
  order_summary jsonb not null default '{}'::jsonb,
  source_kind text not null check (source_kind in ('official_api','partner_import','verified_file','manual_verified')),
  captured_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_order_ref)
);
create index if not exists store_platform_orders_store_time_idx
  on public.store_platform_orders(store_id,ordered_at desc);
create index if not exists store_platform_orders_store_provider_status_idx
  on public.store_platform_orders(store_id,provider,status,ordered_at desc);

create table if not exists public.store_platform_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order')),
  external_review_ref text not null,
  rating numeric(2,1) check (rating is null or (rating>=0 and rating<=5)),
  review_text text,
  review_created_at timestamptz not null,
  reply_text text,
  reply_status text not null default 'unanswered' check (reply_status in ('unanswered','draft','approved','queued','published','failed')),
  reply_draft_source text not null default 'none' check (reply_draft_source in ('none','human','ai')),
  reply_updated_at timestamptz,
  source_kind text not null check (source_kind in ('official_api','partner_import','verified_file','manual_verified')),
  captured_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,external_review_ref)
);
create index if not exists store_platform_reviews_store_reply_idx
  on public.store_platform_reviews(store_id,reply_status,review_created_at desc);

create table if not exists public.store_platform_action_queue (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order')),
  action_kind text not null check (action_kind in ('store_update','menu_update','sync_orders','sync_sales','sync_reviews','review_reply','order_action')),
  target_ref text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','queued','executing','succeeded','failed','cancelled')),
  requires_human_approval boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  error_code text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_platform_action_queue_store_status_idx
  on public.store_platform_action_queue(store_id,status,created_at desc);

create table if not exists public.store_commerce_learning_events (
  id bigint generated by default as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order')),
  event_type text not null,
  target_kind text not null default 'store' check (target_kind in ('store','menu','order','review','connection','mapping')),
  signal jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  outcome text not null default 'observed',
  source_ref_hash text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (signal::text !~* '(token|secret|password|authorization|cookie|phone|address|customer_name|email)')
);
create index if not exists store_commerce_learning_events_store_idx
  on public.store_commerce_learning_events(store_id,provider,event_type,observed_at desc);

alter table public.store_platform_sync_runs enable row level security;
alter table public.store_platform_orders enable row level security;
alter table public.store_platform_reviews enable row level security;
alter table public.store_platform_action_queue enable row level security;
alter table public.store_commerce_learning_events enable row level security;

create policy store_platform_sync_runs_private_read on public.store_platform_sync_runs
  for select to authenticated using (public.has_store_private_access(store_id));
create policy store_platform_orders_private_read on public.store_platform_orders
  for select to authenticated using (public.has_store_private_access(store_id));
create policy store_platform_reviews_private_read on public.store_platform_reviews
  for select to authenticated using (public.has_store_private_access(store_id));
create policy store_platform_action_queue_private_read on public.store_platform_action_queue
  for select to authenticated using (public.has_store_private_access(store_id));
create policy store_commerce_learning_events_private_read on public.store_commerce_learning_events
  for select to authenticated using (public.has_store_private_access(store_id));

revoke all on public.store_platform_sync_runs, public.store_platform_orders, public.store_platform_reviews,
  public.store_platform_action_queue, public.store_commerce_learning_events from anon, authenticated;
grant select on public.store_platform_sync_runs, public.store_platform_orders, public.store_platform_reviews,
  public.store_platform_action_queue, public.store_commerce_learning_events to authenticated;

create or replace function public.store_commerce_admin_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  v_slug text:=lower(trim(coalesce(p_slug,'')));
  v_store_id uuid;
  v_store_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id,name into v_store_id,v_store_name from public.stores where lower(operating_space_slug)=v_slug limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;

  return jsonb_build_object(
    'store',jsonb_build_object('id',v_store_id,'slug',v_slug,'name',v_store_name),
    'providers',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',c.provider,'display_name',c.display_name,'platform_store_name',c.platform_store_name,
      'connection_status',c.connection_status,'connection_mode',c.connection_mode,'source_kind',c.source_kind,
      'capabilities',c.capabilities,'public_order_url',c.public_order_url,'last_synced_at',c.last_synced_at,
      'verified_at',c.verified_at,'next_sync_at',c.next_sync_at,'last_error_code',c.last_error_code
    ) order by case c.provider when 'baemin' then 1 when 'coupang_eats' then 2 when 'yogiyo' then 3 when 'ddangyo' then 4 when 'mukkebi' then 5 when 'daangn_order' then 6 when 'naver_order' then 7 else 9 end)
      from public.store_channel_profiles c where c.store_id=v_store_id and c.provider<>'store'),'[]'::jsonb),
    'sales',jsonb_build_object(
      'today_gross',coalesce((select sum(coalesce(o.gross_amount,0)) from public.store_platform_orders o where o.store_id=v_store_id and o.status='completed' and o.ordered_at>=date_trunc('day',now())),0),
      'today_orders',coalesce((select count(*) from public.store_platform_orders o where o.store_id=v_store_id and o.status='completed' and o.ordered_at>=date_trunc('day',now())),0),
      'last30_gross',coalesce((select sum(coalesce(o.gross_amount,0)) from public.store_platform_orders o where o.store_id=v_store_id and o.status='completed' and o.ordered_at>=now()-interval '30 days'),0),
      'last30_net',coalesce((select sum(coalesce(o.net_amount,o.gross_amount,0)) from public.store_platform_orders o where o.store_id=v_store_id and o.status='completed' and o.ordered_at>=now()-interval '30 days'),0)
    ),
    'orders',coalesce((select jsonb_agg(x order by (x->>'ordered_at') desc) from (
      select jsonb_build_object('provider',o.provider,'external_order_ref',o.external_order_ref,'status',o.status,
        'ordered_at',o.ordered_at,'fulfilled_at',o.fulfilled_at,'gross_amount',o.gross_amount,
        'discount_amount',o.discount_amount,'platform_fee',o.platform_fee,'delivery_fee',o.delivery_fee,
        'net_amount',o.net_amount,'item_count',o.item_count,'order_summary',o.order_summary,'source_kind',o.source_kind) x
      from public.store_platform_orders o where o.store_id=v_store_id order by o.ordered_at desc limit 100
    ) q),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(x order by (x->>'review_created_at') desc) from (
      select jsonb_build_object('provider',r.provider,'external_review_ref',r.external_review_ref,'rating',r.rating,
        'review_text',r.review_text,'review_created_at',r.review_created_at,'reply_text',r.reply_text,
        'reply_status',r.reply_status,'reply_draft_source',r.reply_draft_source,'reply_updated_at',r.reply_updated_at,
        'source_kind',r.source_kind) x
      from public.store_platform_reviews r where r.store_id=v_store_id order by r.review_created_at desc limit 100
    ) q),'[]'::jsonb),
    'review_summary',jsonb_build_object(
      'unanswered',coalesce((select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.reply_status='unanswered'),0),
      'draft',coalesce((select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.reply_status='draft'),0),
      'queued',coalesce((select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.reply_status in ('approved','queued')),0)
    ),
    'actions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'provider',a.provider,'action_kind',a.action_kind,
      'target_ref',a.target_ref,'status',a.status,'requires_human_approval',a.requires_human_approval,
      'approved_at',a.approved_at,'created_at',a.created_at) order by a.created_at desc)
      from public.store_platform_action_queue a where a.store_id=v_store_id and a.status not in ('succeeded','cancelled')),'[]'::jsonb),
    'learning',jsonb_build_object(
      'events',coalesce((select count(*) from public.store_commerce_learning_events l where l.store_id=v_store_id),0),
      'verified_outcomes',coalesce((select count(*) from public.store_commerce_learning_events l where l.store_id=v_store_id and l.outcome in ('verified','succeeded','published')),0),
      'avg_confidence',coalesce((select round(avg(l.confidence),3) from public.store_commerce_learning_events l where l.store_id=v_store_id),0)
    )
  );
end
$$;
revoke all on function public.store_commerce_admin_snapshot(text) from public,anon;
grant execute on function public.store_commerce_admin_snapshot(text) to authenticated;

create or replace function public.import_store_platform_operations_snapshot(
  p_slug text,p_provider text,p_orders jsonb default '[]'::jsonb,p_reviews jsonb default '[]'::jsonb,
  p_source_kind text default 'manual_verified',p_source_url text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_slug text:=lower(trim(coalesce(p_slug,'')));
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_source text:=lower(trim(coalesce(p_source_kind,'manual_verified')));
  v_store_id uuid; v_item jsonb; v_ref text; v_count_orders int:=0; v_count_reviews int:=0;
  v_ordered timestamptz; v_reviewed timestamptz; v_rating numeric; v_sync_id uuid;
  v_gross int; v_discount int; v_platform_fee int; v_delivery_fee int; v_net int; v_items int;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order') then raise exception 'unsupported_platform_provider' using errcode='22023'; end if;
  if v_source not in ('partner_import','verified_file','manual_verified') then raise exception 'manager_import_source_not_allowed' using errcode='22023'; end if;
  if p_source_url is not null and trim(p_source_url)<>'' and p_source_url !~ '^https://' then raise exception 'invalid_source_url' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_orders,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_reviews,'[]'::jsonb))<>'array' then raise exception 'snapshot_arrays_required' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=v_slug limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;

  insert into public.store_platform_sync_runs(store_id,provider,sync_kind,source_kind,status,source_url)
  values(v_store_id,v_provider,'full',v_source,'running',nullif(trim(coalesce(p_source_url,'')),'')) returning id into v_sync_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_orders,'[]'::jsonb)) loop
    v_ref:=nullif(trim(coalesce(v_item->>'external_order_ref',v_item->>'order_id','')),''); if v_ref is null then continue; end if;
    begin v_ordered:=coalesce(nullif(v_item->>'ordered_at','')::timestamptz,now()); exception when others then v_ordered:=now(); end;
    v_gross:=nullif(regexp_replace(coalesce(v_item->>'gross_amount',v_item->>'amount',''),'[^0-9-]','','g'),'')::int;
    v_discount:=nullif(regexp_replace(coalesce(v_item->>'discount_amount',''),'[^0-9]','','g'),'')::int;
    v_platform_fee:=nullif(regexp_replace(coalesce(v_item->>'platform_fee',''),'[^0-9]','','g'),'')::int;
    v_delivery_fee:=nullif(regexp_replace(coalesce(v_item->>'delivery_fee',''),'[^0-9]','','g'),'')::int;
    v_net:=nullif(regexp_replace(coalesce(v_item->>'net_amount',''),'[^0-9-]','','g'),'')::int;
    v_items:=greatest(0,coalesce(nullif(regexp_replace(coalesce(v_item->>'item_count',''),'[^0-9]','','g'),'')::int,jsonb_array_length(case when jsonb_typeof(v_item->'items')='array' then v_item->'items' else '[]'::jsonb end),0));
    insert into public.store_platform_orders as existing(store_id,provider,external_order_ref,status,ordered_at,fulfilled_at,gross_amount,discount_amount,platform_fee,delivery_fee,net_amount,item_count,order_summary,source_kind,captured_at,last_synced_at)
    values(v_store_id,v_provider,v_ref,case when coalesce(v_item->>'status','unknown') in ('received','accepted','preparing','ready','delivering','completed','cancelled','refunded','unknown') then coalesce(v_item->>'status','unknown') else 'unknown' end,
      v_ordered,nullif(v_item->>'fulfilled_at','')::timestamptz,v_gross,v_discount,v_platform_fee,v_delivery_fee,v_net,v_items,
      jsonb_build_object('items',case when jsonb_typeof(v_item->'items')='array' then v_item->'items' else '[]'::jsonb end,'delivery_mode',coalesce(v_item->>'delivery_mode','')),
      v_source,now(),now())
    on conflict(store_id,provider,external_order_ref) do update set status=excluded.status,fulfilled_at=coalesce(excluded.fulfilled_at,existing.fulfilled_at),gross_amount=excluded.gross_amount,discount_amount=excluded.discount_amount,platform_fee=excluded.platform_fee,delivery_fee=excluded.delivery_fee,net_amount=excluded.net_amount,item_count=excluded.item_count,order_summary=excluded.order_summary,source_kind=excluded.source_kind,last_synced_at=now(),updated_at=now();
    v_count_orders:=v_count_orders+1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_reviews,'[]'::jsonb)) loop
    v_ref:=nullif(trim(coalesce(v_item->>'external_review_ref',v_item->>'review_id','')),''); if v_ref is null then continue; end if;
    begin v_reviewed:=coalesce(nullif(v_item->>'review_created_at','')::timestamptz,now()); exception when others then v_reviewed:=now(); end;
    begin v_rating:=nullif(regexp_replace(coalesce(v_item->>'rating',''),'[^0-9.]','','g'),'')::numeric; exception when others then v_rating:=null; end;
    if v_rating is not null then v_rating:=greatest(0,least(5,v_rating)); end if;
    insert into public.store_platform_reviews as existing(store_id,provider,external_review_ref,rating,review_text,review_created_at,source_kind,captured_at,last_synced_at)
    values(v_store_id,v_provider,v_ref,v_rating,nullif(v_item->>'review_text',''),v_reviewed,v_source,now(),now())
    on conflict(store_id,provider,external_review_ref) do update set rating=excluded.rating,review_text=excluded.review_text,review_created_at=excluded.review_created_at,source_kind=excluded.source_kind,last_synced_at=now(),updated_at=now();
    v_count_reviews:=v_count_reviews+1;
  end loop;

  update public.store_platform_sync_runs set status='succeeded',records_seen=v_count_orders+v_count_reviews,records_changed=v_count_orders+v_count_reviews,finished_at=now() where id=v_sync_id;
  insert into public.store_commerce_learning_events(store_id,provider,event_type,target_kind,signal,confidence,outcome,source_ref_hash)
  values(v_store_id,v_provider,'verified_snapshot_import','mapping',jsonb_build_object('orders_count',v_count_orders,'reviews_count',v_count_reviews,'source_kind',v_source),1,'verified',md5(coalesce(p_source_url,v_provider||':'||now()::text)));
  return jsonb_build_object('ok',true,'provider',v_provider,'orders',v_count_orders,'reviews',v_count_reviews,'sync_id',v_sync_id);
exception when others then
  if v_sync_id is not null then update public.store_platform_sync_runs set status='failed',error_code=sqlstate,finished_at=now() where id=v_sync_id; end if;
  raise;
end
$$;
revoke all on function public.import_store_platform_operations_snapshot(text,text,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.import_store_platform_operations_snapshot(text,text,jsonb,jsonb,text,text) to authenticated;

create or replace function public.queue_store_platform_action(
  p_slug text,p_provider text,p_action_kind text,p_target_ref text default null,p_payload jsonb default '{}'::jsonb,p_approve boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_store_id uuid; v_provider text:=lower(trim(coalesce(p_provider,''))); v_action text:=lower(trim(coalesce(p_action_kind,'')));
  v_caps jsonb:='{}'::jsonb; v_required text; v_can_execute boolean:=false; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn_order','naver_order') then raise exception 'unsupported_platform_provider' using errcode='22023'; end if;
  if v_action not in ('store_update','menu_update','sync_orders','sync_sales','sync_reviews','review_reply','order_action') then raise exception 'unsupported_platform_action' using errcode='22023'; end if;
  v_required:=case v_action when 'store_update' then 'store_write' when 'menu_update' then 'menu_write' when 'sync_orders' then 'orders_read' when 'sync_sales' then 'sales_read' when 'sync_reviews' then 'reviews_read' when 'review_reply' then 'review_reply' else 'orders_read' end;
  select coalesce(capabilities,'{}'::jsonb) into v_caps from public.store_channel_profiles where store_id=v_store_id and provider=v_provider;
  v_can_execute:=coalesce((v_caps->>v_required)::boolean,false);
  v_status:=case when p_approve and v_can_execute then 'queued' when p_approve then 'approved' else 'draft' end;
  insert into public.store_platform_action_queue(store_id,provider,action_kind,target_ref,payload,status,requires_human_approval,approved_by,approved_at,created_by)
  values(v_store_id,v_provider,v_action,nullif(trim(coalesce(p_target_ref,'')),''),coalesce(p_payload,'{}'::jsonb),v_status,true,case when p_approve then auth.uid() else null end,case when p_approve then now() else null end,auth.uid()) returning id into v_id;
  insert into public.store_commerce_learning_events(store_id,provider,event_type,target_kind,signal,confidence,outcome,source_ref_hash)
  values(v_store_id,v_provider,'admin_action_decision',case when v_action='review_reply' then 'review' when v_action='menu_update' then 'menu' when v_action='order_action' then 'order' else 'connection' end,
    jsonb_build_object('action_kind',v_action,'approved',p_approve,'capability_ready',v_can_execute),1,case when v_status='queued' then 'queued' else v_status end,md5(coalesce(p_target_ref,v_id::text)));
  return jsonb_build_object('ok',true,'id',v_id,'status',v_status,'capability_ready',v_can_execute,'required_capability',v_required);
end
$$;
revoke all on function public.queue_store_platform_action(text,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.queue_store_platform_action(text,text,text,text,jsonb,boolean) to authenticated;

create or replace function public.save_store_review_reply(
  p_slug text,p_provider text,p_review_ref text,p_reply_text text,p_approve boolean default false,p_draft_source text default 'human'
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_store_id uuid; v_review public.store_platform_reviews%rowtype; v_action jsonb; v_source text:=lower(trim(coalesce(p_draft_source,'human')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_source not in ('human','ai') then raise exception 'invalid_draft_source' using errcode='22023'; end if;
  if length(trim(coalesce(p_reply_text,'')))<1 or length(p_reply_text)>2000 then raise exception 'invalid_reply_text' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  select * into v_review from public.store_platform_reviews where store_id=v_store_id and provider=lower(trim(p_provider)) and external_review_ref=p_review_ref limit 1;
  if v_review.id is null then raise exception 'review_not_found' using errcode='22023'; end if;
  update public.store_platform_reviews set reply_text=trim(p_reply_text),reply_status=case when p_approve then 'approved' else 'draft' end,reply_draft_source=v_source,reply_updated_at=now(),updated_at=now() where id=v_review.id;
  v_action:=public.queue_store_platform_action(p_slug,p_provider,'review_reply',p_review_ref,jsonb_build_object('review_ref',p_review_ref,'reply_text',trim(p_reply_text)),p_approve);
  update public.store_platform_reviews set reply_status=case when v_action->>'status'='queued' then 'queued' else reply_status end where id=v_review.id;
  return jsonb_build_object('ok',true,'review_ref',p_review_ref,'action',v_action);
end
$$;
revoke all on function public.save_store_review_reply(text,text,text,text,boolean,text) from public,anon;
grant execute on function public.save_store_review_reply(text,text,text,text,boolean,text) to authenticated;

comment on table public.store_commerce_learning_events is 'Privacy-safe EKODI commerce experience ledger. Never store credentials or raw customer identity fields.';
comment on function public.queue_store_platform_action(text,text,text,text,jsonb,boolean) is 'Queues tenant-scoped platform work. Writes only become executable when the merchant connector declares the required capability.';
comment on function public.save_store_review_reply(text,text,text,text,boolean,text) is 'Review reply draft/approval queue. Approval does not bypass provider capability or connector policy.';
