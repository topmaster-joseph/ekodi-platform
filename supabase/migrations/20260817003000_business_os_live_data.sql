-- EKODI Business OS live-data foundation for EKODIBIZ and Jadam.
-- Read operational orders in-place, expose aggregate-only snapshots, and keep
-- all external effects behind human approval. No customer PII is returned.

create table if not exists public.business_os_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  workspace_key text not null,
  action_type text not null,
  title text not null,
  summary text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','completed','cancelled','blocked')),
  requires_approval boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_os_actions_scope_idx
  on public.business_os_actions(tenant_id, store_id, status, created_at desc);
create index if not exists business_os_actions_workspace_idx
  on public.business_os_actions(workspace_key, status, created_at desc);

create table if not exists public.business_os_finance_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  metric_date date not null,
  source text not null default 'manual',
  cogs numeric(14,2) not null default 0 check (cogs >= 0),
  delivery_fees numeric(14,2) not null default 0 check (delivery_fees >= 0),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  marketing_spend numeric(14,2) not null default 0 check (marketing_spend >= 0),
  other_costs numeric(14,2) not null default 0 check (other_costs >= 0),
  cash_in numeric(14,2) not null default 0 check (cash_in >= 0),
  cash_out numeric(14,2) not null default 0 check (cash_out >= 0),
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_os_finance_daily_scope_source_uq
  on public.business_os_finance_daily(tenant_id, store_id, metric_date, source) nulls not distinct;
create index if not exists business_os_finance_daily_scope_date_idx
  on public.business_os_finance_daily(tenant_id, store_id, metric_date desc);

create table if not exists public.business_os_marketing_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  metric_date date not null,
  source text not null default 'marketing_ai',
  unanswered_reviews integer check (unanswered_reviews is null or unanswered_reviews >= 0),
  campaigns_live integer check (campaigns_live is null or campaigns_live >= 0),
  leads integer check (leads is null or leads >= 0),
  conversions integer check (conversions is null or conversions >= 0),
  spend numeric(14,2) check (spend is null or spend >= 0),
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_os_marketing_daily_scope_source_uq
  on public.business_os_marketing_daily(tenant_id, store_id, metric_date, source) nulls not distinct;
create index if not exists business_os_marketing_daily_scope_date_idx
  on public.business_os_marketing_daily(tenant_id, store_id, metric_date desc);

alter table public.business_os_actions enable row level security;
alter table public.business_os_finance_daily enable row level security;
alter table public.business_os_marketing_daily enable row level security;

drop policy if exists business_os_actions_read on public.business_os_actions;
create policy business_os_actions_read on public.business_os_actions
  for select to authenticated
  using (
    (store_id is not null and public.has_store_private_access(store_id))
    or (store_id is null and public.has_tenant_access(tenant_id))
  );

drop policy if exists business_os_finance_daily_read on public.business_os_finance_daily;
create policy business_os_finance_daily_read on public.business_os_finance_daily
  for select to authenticated
  using (
    (store_id is not null and public.has_store_private_access(store_id))
    or (store_id is null and public.has_tenant_access(tenant_id))
  );

drop policy if exists business_os_marketing_daily_read on public.business_os_marketing_daily;
create policy business_os_marketing_daily_read on public.business_os_marketing_daily
  for select to authenticated
  using (
    (store_id is not null and public.has_store_private_access(store_id))
    or (store_id is null and public.has_tenant_access(tenant_id))
  );

revoke all on public.business_os_actions from anon, authenticated;
revoke all on public.business_os_finance_daily from anon, authenticated;
revoke all on public.business_os_marketing_daily from anon, authenticated;
grant select on public.business_os_actions to authenticated;
grant select on public.business_os_finance_daily to authenticated;
grant select on public.business_os_marketing_daily to authenticated;

create or replace function public.business_os_resolve_scope(p_workspace_key text)
returns table(
  workspace_key text,
  workspace_name text,
  tenant_id uuid,
  store_id uuid,
  store_slug text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_key text := lower(trim(coalesce(p_workspace_key,'')));
begin
  if v_key = 'ekodibiz' then
    return query
      select 'ekodibiz'::text, t.name, t.id, null::uuid, null::text
        from public.tenants t
       where t.slug = 'ekodibiz' and t.kind = 'business'
       limit 1;
    return;
  end if;

  if v_key = 'jadam' then
    return query
      select 'jadam'::text, s.name, t.id, s.id, s.slug
        from public.tenants t
        join public.stores s on s.tenant_id = t.id
       where t.slug = 'ekodibiz'
         and s.slug = 'jadam-mokpo-univ'
       limit 1;
    return;
  end if;
end
$$;

revoke all on function public.business_os_resolve_scope(text) from public, anon, authenticated;

create or replace function public.business_os_snapshot(p_workspace_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_scope record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_scope from public.business_os_resolve_scope(p_workspace_key) limit 1;
  if v_scope.tenant_id is null then
    raise exception 'workspace_not_found' using errcode = '22023';
  end if;

  if v_scope.store_id is null then
    if not public.has_tenant_access(v_scope.tenant_id) then
      raise exception 'workspace_access_required' using errcode = '42501';
    end if;
  elsif not public.has_store_private_access(v_scope.store_id) then
    raise exception 'workspace_access_required' using errcode = '42501';
  end if;

  with scoped_orders as (
    select
      o.id,
      o.total,
      o.status::text as status,
      o.source,
      o.created_at,
      (o.created_at at time zone 'Asia/Seoul')::date as local_date,
      case
        when o.customer_user_id is not null then 'user:' || o.customer_user_id::text
        when nullif(trim(o.customer_phone),'') is not null then 'phone:' || md5(trim(o.customer_phone))
        else null
      end as customer_key
    from public.orders o
    where o.tenant_id = v_scope.tenant_id
      and (v_scope.store_id is null or o.store_id = v_scope.store_id)
  ),
  completed as (
    select * from scoped_orders where status = 'completed'
  ),
  today_sales as (
    select coalesce(sum(total),0)::numeric as sales,
           count(*)::integer as orders,
           count(distinct customer_key) filter (where customer_key is not null)::integer as customers
      from completed where local_date = v_today
  ),
  prior_sales as (
    select coalesce(sum(total),0)::numeric as sales
      from completed where local_date = v_today - 7
  ),
  first_customer_order as (
    select customer_key, min(local_date) as first_date
      from completed
     where customer_key is not null
     group by customer_key
  ),
  new_customers as (
    select count(*)::integer as count from first_customer_order where first_date = v_today
  ),
  recent_customer_orders as (
    select customer_key, count(*)::integer as visit_count, max(local_date) as last_date
      from completed
     where customer_key is not null
       and local_date >= v_today - 89
     group by customer_key
  ),
  repeat_stats as (
    select count(*)::integer as active_customers,
           count(*) filter (where visit_count >= 2)::integer as repeat_customers
      from recent_customer_orders
  ),
  all_customer_last as (
    select customer_key, max(local_date) as last_date
      from completed
     where customer_key is not null
       and local_date >= v_today - 365
     group by customer_key
  ),
  inactive_stats as (
    select count(*) filter (where last_date < v_today - 30)::integer as inactive_30d
      from all_customer_last
  ),
  action_stats as (
    select count(*) filter (where status in ('draft','pending_approval','approved'))::integer as open_actions,
           count(*) filter (where status = 'pending_approval')::integer as pending_approvals,
           count(*) filter (where priority in ('high','urgent') and status in ('draft','pending_approval','approved'))::integer as high_priority
      from public.business_os_actions a
     where a.tenant_id = v_scope.tenant_id
       and (v_scope.store_id is null or a.store_id = v_scope.store_id)
  ),
  finance_today as (
    select coalesce(sum(cogs + delivery_fees + labor_cost + marketing_spend + other_costs),0)::numeric as cost_total,
           coalesce(sum(marketing_spend),0)::numeric as marketing_spend,
           coalesce(sum(cash_in),0)::numeric as cash_in,
           coalesce(sum(cash_out),0)::numeric as cash_out,
           count(*)::integer as rows_count
      from public.business_os_finance_daily f
     where f.tenant_id = v_scope.tenant_id
       and (v_scope.store_id is null or f.store_id = v_scope.store_id)
       and f.metric_date = v_today
  ),
  marketing_today as (
    select coalesce(sum(unanswered_reviews),0)::integer as unanswered_reviews,
           coalesce(sum(campaigns_live),0)::integer as campaigns_live,
           coalesce(sum(leads),0)::integer as leads,
           coalesce(sum(conversions),0)::integer as conversions,
           coalesce(sum(spend),0)::numeric as spend,
           count(*)::integer as rows_count
      from public.business_os_marketing_daily m
     where m.tenant_id = v_scope.tenant_id
       and (v_scope.store_id is null or m.store_id = v_scope.store_id)
       and m.metric_date = v_today
  )
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'key', v_scope.workspace_key,
      'name', v_scope.workspace_name,
      'tenantId', v_scope.tenant_id,
      'storeId', v_scope.store_id,
      'storeSlug', v_scope.store_slug
    ),
    'asOf', now(),
    'metrics', jsonb_build_object(
      'sales', ts.sales,
      'salesDelta', case when ps.sales > 0 then round(((ts.sales - ps.sales) / ps.sales) * 100, 1) else null end,
      'customers', ts.customers,
      'newCustomers', nc.count,
      'repeatRate', case when rs.active_customers > 0 then round((rs.repeat_customers::numeric / rs.active_customers::numeric) * 100, 1) else null end,
      'targetRepeatRate', 45,
      'openActions', ac.open_actions,
      'pendingApprovals', ac.pending_approvals
    ),
    'marketing', jsonb_build_object(
      'connected', mt.rows_count > 0,
      'unansweredReviews', case when mt.rows_count > 0 then mt.unanswered_reviews else null end,
      'campaignsLive', case when mt.rows_count > 0 then mt.campaigns_live else null end,
      'leads', case when mt.rows_count > 0 then mt.leads else null end,
      'conversions', case when mt.rows_count > 0 then mt.conversions else null end,
      'spend', case when mt.rows_count > 0 then mt.spend else null end,
      'inactiveCustomers', ins.inactive_30d
    ),
    'operations', jsonb_build_object(
      'highPriorityActions', ac.high_priority,
      'pendingApprovals', ac.pending_approvals
    ),
    'finance', jsonb_build_object(
      'connected', ft.rows_count > 0,
      'costTotal', case when ft.rows_count > 0 then ft.cost_total else null end,
      'marketingSpend', case when ft.rows_count > 0 then ft.marketing_spend else null end,
      'cashIn', case when ft.rows_count > 0 then ft.cash_in else null end,
      'cashOut', case when ft.rows_count > 0 then ft.cash_out else null end,
      'estimatedOperatingMargin', case when ft.rows_count > 0 and ts.sales > 0 then round(((ts.sales - ft.cost_total) / ts.sales) * 100, 1) else null end
    ),
    'sources', jsonb_build_object(
      'sales', 'orders',
      'salesConnected', true,
      'marketingAggregateConnected', mt.rows_count > 0,
      'financeAggregateConnected', ft.rows_count > 0,
      'containsCustomerPii', false
    )
  ) into v_result
  from today_sales ts
  cross join prior_sales ps
  cross join new_customers nc
  cross join repeat_stats rs
  cross join inactive_stats ins
  cross join action_stats ac
  cross join finance_today ft
  cross join marketing_today mt;

  return v_result;
end
$$;

revoke all on function public.business_os_snapshot(text) from public, anon;
grant execute on function public.business_os_snapshot(text) to authenticated;

create or replace function public.business_os_propose_action(
  p_workspace_key text,
  p_action_type text,
  p_title text,
  p_summary text default null,
  p_priority text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_scope record;
  v_action_type text := lower(trim(coalesce(p_action_type,'')));
  v_priority text := lower(trim(coalesce(p_priority,'normal')));
  v_requires_approval boolean;
  v_status text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'title_required' using errcode='22023'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority' using errcode='22023'; end if;

  select * into v_scope from public.business_os_resolve_scope(p_workspace_key) limit 1;
  if v_scope.tenant_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if v_scope.store_id is null then
    if not public.has_tenant_access(v_scope.tenant_id) then raise exception 'workspace_access_required' using errcode='42501'; end if;
  elsif not public.has_store_private_access(v_scope.store_id) then
    raise exception 'workspace_access_required' using errcode='42501';
  end if;

  if v_action_type in ('transfer_money','sign_contract','terminate_employee','bind_insurance','deny_insurance_claim','make_hiring_decision','raise_debt','file_tax_return') then
    raise exception 'high_impact_human_only' using errcode='42501';
  end if;

  if v_action_type in ('send_customer_message','publish_campaign','change_ad_budget','change_price','issue_refund','submit_job_posting','share_customer_data') then
    v_requires_approval := true;
    v_status := 'pending_approval';
  elsif v_action_type in ('draft_campaign','draft_review_reply','create_followup_task','prepare_sales_summary','segment_customers','suggest_energy_schedule','prepare_trade_quote') then
    v_requires_approval := false;
    v_status := 'draft';
  else
    raise exception 'unsupported_action' using errcode='22023';
  end if;

  insert into public.business_os_actions(
    tenant_id, store_id, workspace_key, action_type, title, summary, priority,
    status, requires_approval, requested_by
  ) values (
    v_scope.tenant_id, v_scope.store_id, v_scope.workspace_key, v_action_type,
    trim(p_title), nullif(trim(coalesce(p_summary,'')),''), v_priority,
    v_status, v_requires_approval, auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('id',v_id,'status',v_status,'requiresApproval',v_requires_approval,'executable',false);
end
$$;

revoke all on function public.business_os_propose_action(text,text,text,text,text) from public, anon;
grant execute on function public.business_os_propose_action(text,text,text,text,text) to authenticated;

create or replace function public.business_os_decide_action(p_action_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action public.business_os_actions%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_decision not in ('approved','rejected') then raise exception 'invalid_decision' using errcode='22023'; end if;

  select * into v_action from public.business_os_actions where id = p_action_id;
  if v_action.id is null then raise exception 'action_not_found' using errcode='22023'; end if;
  if v_action.store_id is null then
    if not public.has_tenant_access(v_action.tenant_id) then raise exception 'workspace_access_required' using errcode='42501'; end if;
  elsif not public.has_store_private_access(v_action.store_id) then
    raise exception 'workspace_access_required' using errcode='42501';
  end if;
  if v_action.status <> 'pending_approval' then raise exception 'action_not_pending' using errcode='22023'; end if;

  update public.business_os_actions
     set status = v_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         updated_at = now()
   where id = p_action_id;

  return jsonb_build_object('id',p_action_id,'status',v_decision,'executed',false);
end
$$;

revoke all on function public.business_os_decide_action(uuid,text) from public, anon;
grant execute on function public.business_os_decide_action(uuid,text) to authenticated;

-- Give currently active EKODIBIZ tenant members a Business OS handoff surface.
-- Future members can still request Business OS access through the central auth center.
insert into public.site_access_registry(email, site_key, tenant_id, role, status, source, note, plan)
select lower(u.email), 'business', t.id, tm.role, 'active', 'business_os_bootstrap',
       'EKODIBIZ Business OS workspace access', 'standard'
  from public.tenants t
  join public.tenant_members tm on tm.tenant_id = t.id and tm.status = 'active'
  join auth.users u on u.id = tm.user_id
 where t.slug = 'ekodibiz'
   and nullif(trim(coalesce(u.email,'')),'') is not null
on conflict (email, site_key, tenant_id, role)
do update set status='active', updated_at=now();

comment on function public.business_os_snapshot(text) is
  'Returns tenant/store-scoped aggregate Business OS metrics without customer PII.';
comment on function public.business_os_propose_action(text,text,text,text,text) is
  'Records bounded AI proposals only; high-impact decisions are rejected and approved items are never auto-executed.';