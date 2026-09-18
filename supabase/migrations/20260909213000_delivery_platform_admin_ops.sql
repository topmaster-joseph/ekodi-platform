-- Per-store delivery platform operations for orders, revenue, delivery and reviews.

create table if not exists public.store_platform_orders (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store')),
  external_order_ref text not null,order_display_no text,
  status text not null default 'received' check (status in ('received','accepted','preparing','ready','picked_up','delivering','completed','cancelled','rejected','unknown')),
  fulfillment_type text not null default 'delivery' check (fulfillment_type in ('delivery','pickup','dine_in','unknown')),
  subtotal integer not null default 0 check(subtotal>=0),discount integer not null default 0 check(discount>=0),delivery_fee integer not null default 0 check(delivery_fee>=0),total integer not null default 0 check(total>=0),platform_fee integer not null default 0 check(platform_fee>=0),net_receivable integer,
  item_summary jsonb not null default '[]'::jsonb,customer_display text,delivery_area_hint text,platform_order_url text,
  ordered_at timestamptz not null,accepted_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,
  source_kind text not null default 'partner_import' check (source_kind in ('official_api','partner_import','verified_file','manual_verified')),source_url text,last_synced_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(store_id,provider,external_order_ref),
  constraint store_platform_orders_urls_https_chk check ((platform_order_url is null or platform_order_url ~ '^https://') and (source_url is null or source_url ~ '^https://'))
);
create index if not exists store_platform_orders_store_time_idx on public.store_platform_orders(store_id,ordered_at desc);
create index if not exists store_platform_orders_provider_time_idx on public.store_platform_orders(store_id,provider,ordered_at desc);

create table if not exists public.store_platform_settlements (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,provider text not null,external_settlement_ref text not null,
  period_start date not null,period_end date not null,gross_sales integer not null default 0,discounts integer not null default 0,platform_fees integer not null default 0,delivery_fees integer not null default 0,adjustments integer not null default 0,net_settlement integer not null default 0,paid_at timestamptz,source_kind text not null default 'partner_import',source_url text,captured_at timestamptz not null default now(),unique(store_id,provider,external_settlement_ref),
  constraint store_platform_settlements_source_url_https_chk check(source_url is null or source_url ~ '^https://')
);
create index if not exists store_platform_settlements_store_period_idx on public.store_platform_settlements(store_id,period_end desc);

create table if not exists public.store_platform_reviews (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store')),
  external_review_ref text not null,author_alias text,rating numeric(2,1) check(rating between 0 and 5),review_body text,review_tags jsonb not null default '[]'::jsonb,review_url text,review_created_at timestamptz not null,
  reply_body text,reply_status text not null default 'unanswered' check(reply_status in ('unanswered','draft','queued','published','failed','not_supported')),reply_draft text,reply_published_at timestamptz,
  source_kind text not null default 'partner_import',source_url text,last_synced_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(store_id,provider,external_review_ref),
  constraint store_platform_reviews_urls_https_chk check((review_url is null or review_url ~ '^https://') and (source_url is null or source_url ~ '^https://'))
);
create index if not exists store_platform_reviews_store_time_idx on public.store_platform_reviews(store_id,review_created_at desc);
create index if not exists store_platform_reviews_unanswered_idx on public.store_platform_reviews(store_id,reply_status,review_created_at desc);

create table if not exists public.store_platform_actions (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,provider text not null,
  action_type text not null check(action_type in ('review_reply','order_status_update','menu_availability_update','menu_price_update','sync_now')),target_ref text not null,payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('draft','queued','running','completed','failed','cancelled','needs_connection')),approval_state text not null default 'user_approved' check(approval_state in ('draft','user_approved','system_safe')),requested_by uuid,requested_at timestamptz not null default now(),executed_at timestamptz,error_code text,error_message text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists store_platform_actions_queue_idx on public.store_platform_actions(status,requested_at);
create index if not exists store_platform_actions_store_idx on public.store_platform_actions(store_id,requested_at desc);

alter table public.store_platform_orders enable row level security;alter table public.store_platform_settlements enable row level security;alter table public.store_platform_reviews enable row level security;alter table public.store_platform_actions enable row level security;
create policy store_platform_orders_admin on public.store_platform_orders for all to authenticated using(public.can_manage_store_user_site(store_id)) with check(public.can_manage_store_user_site(store_id));
create policy store_platform_settlements_admin on public.store_platform_settlements for all to authenticated using(public.can_manage_store_user_site(store_id)) with check(public.can_manage_store_user_site(store_id));
create policy store_platform_reviews_admin on public.store_platform_reviews for all to authenticated using(public.can_manage_store_user_site(store_id)) with check(public.can_manage_store_user_site(store_id));
create policy store_platform_actions_admin on public.store_platform_actions for all to authenticated using(public.can_manage_store_user_site(store_id)) with check(public.can_manage_store_user_site(store_id));
grant select,insert,update on public.store_platform_orders,public.store_platform_settlements,public.store_platform_reviews,public.store_platform_actions to authenticated;
revoke all on public.store_platform_orders,public.store_platform_settlements,public.store_platform_reviews,public.store_platform_actions from anon;

create or replace function public.store_delivery_platform_admin_snapshot(p_slug text,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_store_id uuid;v_days integer:=greatest(1,least(365,coalesce(p_days,30)));v_since timestamptz;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
 if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023';end if;
 if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501';end if;
 v_since:=now()-(v_days||' days')::interval;
 return jsonb_build_object(
  'window_days',v_days,
  'summary',jsonb_build_object('orders',(select count(*) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since),'gross_sales',(select coalesce(sum(o.total),0) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since and o.status='completed'),'net_receivable',(select coalesce(sum(coalesce(o.net_receivable,o.total-o.platform_fee)),0) from public.store_platform_orders o where o.store_id=v_store_id and o.ordered_at>=v_since and o.status='completed'),'unanswered_reviews',(select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.reply_status in ('unanswered','draft','failed')),'avg_rating',(select round(avg(r.rating)::numeric,2) from public.store_platform_reviews r where r.store_id=v_store_id and r.review_created_at>=v_since)),
  'channels',coalesce((select jsonb_agg(x.obj order by x.provider) from(select provider,jsonb_build_object('provider',provider,'orders',count(*),'sales',coalesce(sum(total) filter(where status='completed'),0),'unanswered_reviews',(select count(*) from public.store_platform_reviews r where r.store_id=v_store_id and r.provider=o.provider and r.reply_status in ('unanswered','draft','failed')))obj from public.store_platform_orders o where store_id=v_store_id and ordered_at>=v_since group by provider)x),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(x.obj order by x.ordered_at desc) from(select ordered_at,jsonb_build_object('id',id,'provider',provider,'order_no',coalesce(order_display_no,external_order_ref),'status',status,'fulfillment_type',fulfillment_type,'total',total,'net_receivable',net_receivable,'items',item_summary,'customer_display',customer_display,'delivery_area_hint',delivery_area_hint,'order_url',platform_order_url,'ordered_at',ordered_at,'completed_at',completed_at)obj from public.store_platform_orders where store_id=v_store_id and ordered_at>=v_since order by ordered_at desc limit 100)x),'[]'::jsonb),
  'reviews',coalesce((select jsonb_agg(x.obj order by x.review_created_at desc) from(select review_created_at,jsonb_build_object('id',id,'provider',provider,'rating',rating,'author_alias',author_alias,'body',review_body,'url',review_url,'created_at',review_created_at,'reply_status',reply_status,'reply_body',reply_body,'reply_draft',reply_draft)obj from public.store_platform_reviews where store_id=v_store_id order by review_created_at desc limit 100)x),'[]'::jsonb),
  'settlements',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'period_start',period_start,'period_end',period_end,'gross_sales',gross_sales,'platform_fees',platform_fees,'delivery_fees',delivery_fees,'net_settlement',net_settlement,'paid_at',paid_at) order by period_end desc) from public.store_platform_settlements where store_id=v_store_id and period_end>=current_date-v_days),'[]'::jsonb)
 );
end $$;
revoke all on function public.store_delivery_platform_admin_snapshot(text,integer) from public,anon;grant execute on function public.store_delivery_platform_admin_snapshot(text,integer) to authenticated;

create or replace function public.store_platform_review_save_draft(p_slug text,p_review_id uuid,p_draft text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid;v_review public.store_platform_reviews%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
 if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501';end if;
 select * into v_review from public.store_platform_reviews where id=p_review_id and store_id=v_store_id;if v_review.id is null then raise exception 'review_not_found' using errcode='22023';end if;
 update public.store_platform_reviews set reply_draft=nullif(trim(coalesce(p_draft,'')),''),reply_status=case when nullif(trim(coalesce(p_draft,'')),'') is null then 'unanswered' else 'draft' end,updated_at=now() where id=p_review_id;
 return jsonb_build_object('ok',true,'review_id',p_review_id);
end $$;
revoke all on function public.store_platform_review_save_draft(text,uuid,text) from public,anon;grant execute on function public.store_platform_review_save_draft(text,uuid,text) to authenticated;

create or replace function public.store_platform_review_queue_reply(p_slug text,p_review_id uuid,p_reply text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_store_id uuid;v_review public.store_platform_reviews%rowtype;v_action_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
 if v_store_id is null or not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501';end if;
 if nullif(trim(coalesce(p_reply,'')),'') is null then raise exception 'reply_required' using errcode='22023';end if;
 select * into v_review from public.store_platform_reviews where id=p_review_id and store_id=v_store_id;if v_review.id is null then raise exception 'review_not_found' using errcode='22023';end if;
 insert into public.store_platform_actions(store_id,provider,action_type,target_ref,payload,status,approval_state,requested_by) values(v_store_id,v_review.provider,'review_reply',v_review.external_review_ref,jsonb_build_object('review_id',v_review.id,'reply',trim(p_reply)),'queued','user_approved',auth.uid()) returning id into v_action_id;
 update public.store_platform_reviews set reply_draft=trim(p_reply),reply_status='queued',updated_at=now() where id=p_review_id;
 return jsonb_build_object('ok',true,'action_id',v_action_id,'review_id',p_review_id,'status','queued');
end $$;
revoke all on function public.store_platform_review_queue_reply(text,uuid,text) from public,anon;grant execute on function public.store_platform_review_queue_reply(text,uuid,text) to authenticated;

comment on table public.store_platform_orders is 'Normalized platform order ledger without raw customer phone/address; full PII remains in authorized merchant systems.';
comment on table public.store_platform_reviews is 'Normalized reviews with AI-assisted drafts and user-approved reply queue.';
comment on table public.store_platform_actions is 'User-approved outbound action queue; external writes require an authorized provider connector.';
