-- EKODIBIZ Trading commercial ERP: buyers, landed-cost quotations and contracts.
-- Reuses the existing workspace authority and supplier/product records.

create table if not exists public.trade_buyers (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_name text not null,
  country_code text not null default '',
  contact_name text not null default '',
  wechat text not null default '',
  email text not null default '',
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_quotations (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  quotation_no text not null,
  buyer_id uuid not null references public.trade_buyers(id) on delete restrict,
  engagement_id uuid references public.trade_engagements(id) on delete set null,
  supplier_id uuid references public.trade_counterparties(id) on delete set null,
  currency text not null default 'USD',
  quantity numeric(14,2) not null default 1 check (quantity > 0),
  unit_price numeric(16,2) not null default 0 check (unit_price >= 0),
  purchase_cost numeric(16,2) not null default 0 check (purchase_cost >= 0),
  shipping_cost numeric(16,2) not null default 0 check (shipping_cost >= 0),
  inspection_cost numeric(16,2) not null default 0 check (inspection_cost >= 0),
  packing_cost numeric(16,2) not null default 0 check (packing_cost >= 0),
  insurance_cost numeric(16,2) not null default 0 check (insurance_cost >= 0),
  other_cost numeric(16,2) not null default 0 check (other_cost >= 0),
  status text not null default 'draft' check (status in ('draft','sent','accepted','expired','cancelled')),
  valid_until date,
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_tenant_id, quotation_no)
);

create table if not exists public.trade_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_no text not null,
  quotation_id uuid not null references public.trade_quotations(id) on delete restrict,
  status text not null default 'preparing' check (status in ('preparing','signed','deposit_paid','balance_paid','delivering','completed','cancelled')),
  deposit_amount numeric(16,2) not null default 0 check (deposit_amount >= 0),
  balance_amount numeric(16,2) not null default 0 check (balance_amount >= 0),
  delivery_date date,
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_tenant_id, contract_no)
);

create index if not exists trade_buyers_workspace_idx on public.trade_buyers(workspace_tenant_id,status,company_name);
create index if not exists trade_quotations_workspace_idx on public.trade_quotations(workspace_tenant_id,status,created_at desc);
create index if not exists trade_contracts_workspace_idx on public.trade_contracts(workspace_tenant_id,status,created_at desc);

alter table public.trade_buyers enable row level security;
alter table public.trade_quotations enable row level security;
alter table public.trade_contracts enable row level security;
revoke all on table public.trade_buyers, public.trade_quotations, public.trade_contracts from anon, authenticated;

create or replace function public.trade_commercial_snapshot(p_workspace_slug text default 'ekoditrade')
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare
  v_access jsonb := public.trade_current_access(p_workspace_slug);
  v_workspace_id uuid := nullif(v_access->>'workspace_id','')::uuid;
  v_buyers jsonb; v_quotes jsonb; v_contracts jsonb;
begin
  if coalesce((v_access->>'allowed')::boolean,false) is not true then return jsonb_build_object('error','trade_access_required'); end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.company_name),'[]'::jsonb) into v_buyers from public.trade_buyers b where b.workspace_tenant_id=v_workspace_id;
  select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object(
    'buyer_name',b.company_name,'product_title',coalesce(e.title,''),'supplier_name',coalesce(s.display_name,''),
    'revenue',q.quantity*q.unit_price,
    'total_cost',q.purchase_cost+q.shipping_cost+q.inspection_cost+q.packing_cost+q.insurance_cost+q.other_cost,
    'profit',q.quantity*q.unit_price-(q.purchase_cost+q.shipping_cost+q.inspection_cost+q.packing_cost+q.insurance_cost+q.other_cost)
  ) order by q.created_at desc),'[]'::jsonb) into v_quotes
  from public.trade_quotations q join public.trade_buyers b on b.id=q.buyer_id
  left join public.trade_engagements e on e.id=q.engagement_id left join public.trade_counterparties s on s.id=q.supplier_id
  where q.workspace_tenant_id=v_workspace_id;
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('quotation_no',q.quotation_no,'buyer_name',b.company_name) order by c.created_at desc),'[]'::jsonb) into v_contracts
  from public.trade_contracts c join public.trade_quotations q on q.id=c.quotation_id join public.trade_buyers b on b.id=q.buyer_id
  where c.workspace_tenant_id=v_workspace_id;
  return jsonb_build_object('access',v_access,'buyers',v_buyers,'quotations',v_quotes,'contracts',v_contracts);
end $$;

create or replace function public.trade_upsert_buyer(p_workspace_slug text,p_id uuid,p_company_name text,p_country_code text,p_contact_name text,p_wechat text,p_email text,p_status text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_access jsonb:=public.trade_current_access(p_workspace_slug); v_workspace_id uuid:=nullif(v_access->>'workspace_id','')::uuid; v_id uuid;
begin
  if coalesce((v_access->>'can_write')::boolean,false) is not true then return jsonb_build_object('error','trade_write_forbidden'); end if;
  if trim(coalesce(p_company_name,''))='' then return jsonb_build_object('error','company_name_required'); end if;
  if p_id is null then insert into public.trade_buyers(workspace_tenant_id,company_name,country_code,contact_name,wechat,email,status,created_by) values(v_workspace_id,trim(p_company_name),upper(trim(coalesce(p_country_code,''))),trim(coalesce(p_contact_name,'')),trim(coalesce(p_wechat,'')),lower(trim(coalesce(p_email,''))),coalesce(nullif(p_status,''),'active'),auth.uid()) returning id into v_id;
  else update public.trade_buyers set company_name=trim(p_company_name),country_code=upper(trim(coalesce(p_country_code,''))),contact_name=trim(coalesce(p_contact_name,'')),wechat=trim(coalesce(p_wechat,'')),email=lower(trim(coalesce(p_email,''))),status=coalesce(nullif(p_status,''),'active'),updated_at=now() where id=p_id and workspace_tenant_id=v_workspace_id returning id into v_id; end if;
  if v_id is null then return jsonb_build_object('error','buyer_not_found'); end if;
  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id) values(v_workspace_id,auth.uid(),'trade.buyer.upsert','trade_buyer',v_id::text);
  return jsonb_build_object('id',v_id);
end $$;

create or replace function public.trade_create_quotation(p_workspace_slug text,p_buyer_id uuid,p_engagement_id uuid,p_supplier_id uuid,p_currency text,p_quantity numeric,p_unit_price numeric,p_purchase numeric,p_shipping numeric,p_inspection numeric,p_packing numeric,p_insurance numeric,p_other numeric,p_valid_until date,p_status text,p_notes text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_access jsonb:=public.trade_current_access(p_workspace_slug); v_workspace_id uuid:=nullif(v_access->>'workspace_id','')::uuid; v_id uuid; v_no text;
begin
  if coalesce((v_access->>'can_write')::boolean,false) is not true then return jsonb_build_object('error','trade_write_forbidden'); end if;
  if not exists(select 1 from public.trade_buyers where id=p_buyer_id and workspace_tenant_id=v_workspace_id) then return jsonb_build_object('error','buyer_not_found'); end if;
  v_no:='QT-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.trade_quotations(workspace_tenant_id,quotation_no,buyer_id,engagement_id,supplier_id,currency,quantity,unit_price,purchase_cost,shipping_cost,inspection_cost,packing_cost,insurance_cost,other_cost,valid_until,status,notes,created_by)
  values(v_workspace_id,v_no,p_buyer_id,p_engagement_id,p_supplier_id,upper(coalesce(nullif(p_currency,''),'USD')),greatest(coalesce(p_quantity,1),0.01),greatest(coalesce(p_unit_price,0),0),greatest(coalesce(p_purchase,0),0),greatest(coalesce(p_shipping,0),0),greatest(coalesce(p_inspection,0),0),greatest(coalesce(p_packing,0),0),greatest(coalesce(p_insurance,0),0),greatest(coalesce(p_other,0),0),p_valid_until,coalesce(nullif(p_status,''),'draft'),coalesce(p_notes,''),auth.uid()) returning id into v_id;
  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata) values(v_workspace_id,auth.uid(),'trade.quotation.create','trade_quotation',v_id::text,jsonb_build_object('quotation_no',v_no));
  return jsonb_build_object('id',v_id,'quotation_no',v_no);
end $$;

create or replace function public.trade_create_contract(p_workspace_slug text,p_quotation_id uuid,p_status text,p_deposit numeric,p_balance numeric,p_delivery_date date,p_notes text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_access jsonb:=public.trade_current_access(p_workspace_slug); v_workspace_id uuid:=nullif(v_access->>'workspace_id','')::uuid; v_id uuid; v_no text;
begin
  if coalesce((v_access->>'can_write')::boolean,false) is not true then return jsonb_build_object('error','trade_write_forbidden'); end if;
  if not exists(select 1 from public.trade_quotations where id=p_quotation_id and workspace_tenant_id=v_workspace_id) then return jsonb_build_object('error','quotation_not_found'); end if;
  v_no:='CT-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.trade_contracts(workspace_tenant_id,contract_no,quotation_id,status,deposit_amount,balance_amount,delivery_date,notes,created_by)
  values(v_workspace_id,v_no,p_quotation_id,coalesce(nullif(p_status,''),'preparing'),greatest(coalesce(p_deposit,0),0),greatest(coalesce(p_balance,0),0),p_delivery_date,coalesce(p_notes,''),auth.uid()) returning id into v_id;
  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata) values(v_workspace_id,auth.uid(),'trade.contract.create','trade_contract',v_id::text,jsonb_build_object('contract_no',v_no));
  return jsonb_build_object('id',v_id,'contract_no',v_no);
end $$;

revoke all on function public.trade_commercial_snapshot(text), public.trade_upsert_buyer(text,uuid,text,text,text,text,text,text), public.trade_create_quotation(text,uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,text), public.trade_create_contract(text,uuid,text,numeric,numeric,date,text) from public,anon;
grant execute on function public.trade_commercial_snapshot(text), public.trade_upsert_buyer(text,uuid,text,text,text,text,text,text), public.trade_create_quotation(text,uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,text), public.trade_create_contract(text,uuid,text,numeric,numeric,date,text) to authenticated;
