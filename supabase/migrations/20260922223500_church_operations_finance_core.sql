-- EKODI Church operations core: offerings, accounting ledger, and donation receipt requests.
-- Finance data stays in church_private and is accessible only through authenticated edge boundaries.

alter table church_private.members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists church_members_auth_user_scope_uidx
  on church_private.members(tenant_id, auth_user_id)
  where auth_user_id is not null;

create table if not exists church_private.offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  member_id uuid references church_private.members(id) on delete set null,
  donor_name text,
  offering_type text not null default 'other'
    check (offering_type in ('tithe','sunday','thanksgiving','mission','building','designated','other')),
  amount numeric(14,2) not null check (amount > 0),
  offered_on date not null,
  method text not null default 'bank'
    check (method in ('cash','bank','card','other')),
  reference_no text,
  anonymous boolean not null default false,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church_private.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  entry_date date not null,
  direction text not null check (direction in ('income','expense')),
  account_code text not null,
  account_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  counterparty text,
  memo text,
  offering_id uuid unique references church_private.offerings(id) on delete set null,
  evidence_ref text,
  status text not null default 'posted' check (status in ('draft','posted','void')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists church_private.receipt_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  church_slug text not null,
  member_id uuid references church_private.members(id) on delete set null,
  requester_user_id uuid references auth.users(id) on delete set null,
  tax_year integer not null check (tax_year between 2000 and 2200),
  donor_name text not null,
  delivery_email text,
  status text not null default 'requested'
    check (status in ('requested','review','issued','rejected')),
  note text,
  handled_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists church_offerings_scope_idx
  on church_private.offerings(tenant_id, offered_on desc, offering_type);
create index if not exists church_offerings_member_idx
  on church_private.offerings(tenant_id, member_id, offered_on desc);
create index if not exists church_ledger_scope_idx
  on church_private.ledger_entries(tenant_id, entry_date desc, direction, status);
create index if not exists church_receipts_scope_idx
  on church_private.receipt_requests(tenant_id, status, tax_year desc, requested_at desc);
create unique index if not exists church_receipts_member_year_active_uidx
  on church_private.receipt_requests(tenant_id, member_id, tax_year)
  where member_id is not null and status <> 'rejected';

drop trigger if exists church_offerings_touch_updated_at on church_private.offerings;
create trigger church_offerings_touch_updated_at before update on church_private.offerings
for each row execute function church_private.touch_updated_at();
drop trigger if exists church_ledger_touch_updated_at on church_private.ledger_entries;
create trigger church_ledger_touch_updated_at before update on church_private.ledger_entries
for each row execute function church_private.touch_updated_at();
drop trigger if exists church_receipts_touch_updated_at on church_private.receipt_requests;
create trigger church_receipts_touch_updated_at before update on church_private.receipt_requests
for each row execute function church_private.touch_updated_at();

alter table church_private.offerings enable row level security;
alter table church_private.ledger_entries enable row level security;
alter table church_private.receipt_requests enable row level security;

revoke all privileges on church_private.offerings, church_private.ledger_entries, church_private.receipt_requests from anon, authenticated;
grant all privileges on church_private.offerings, church_private.ledger_entries, church_private.receipt_requests to service_role;

comment on table church_private.offerings is 'Restricted church offering register. Donor identity is finance-sensitive.';
comment on table church_private.ledger_entries is 'Restricted church accounting journal; offering income is auto-linked to the offering register.';
comment on table church_private.receipt_requests is 'Restricted donation receipt request workflow. Do not store resident registration numbers.';

create or replace function public.church_finance_list(
  p_table text,
  p_church_slug text,
  p_status text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church, church_private
as $$
declare
  v_tenant_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit,100),250));
  v_result jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants
  where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return v_result; end if;

  case p_table
    when 'church_offerings' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_date desc, x.created_at desc),'[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id',o.id,'member_id',o.member_id,
          'donor_name',case when o.anonymous then '무기명' else coalesce(o.donor_name,m.preferred_name,m.full_name,'미지정') end,
          'offering_type',o.offering_type,'amount',o.amount,'offered_on',o.offered_on,
          'method',o.method,'reference_no',o.reference_no,'anonymous',o.anonymous,
          'note',o.note,'created_at',o.created_at
        ) row_value, o.offered_on sort_date, o.created_at
        from church_private.offerings o
        left join church_private.members m on m.id=o.member_id and m.tenant_id=o.tenant_id
        where o.tenant_id=v_tenant_id
        order by o.offered_on desc,o.created_at desc limit v_limit
      ) x;
    when 'church_ledger_entries' then
      select coalesce(jsonb_agg(x.row_value order by x.sort_date desc, x.created_at desc),'[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id',l.id,'entry_date',l.entry_date,'direction',l.direction,
          'account_code',l.account_code,'account_name',l.account_name,'amount',l.amount,
          'counterparty',l.counterparty,'memo',l.memo,'offering_id',l.offering_id,
          'evidence_ref',l.evidence_ref,'status',l.status,'created_at',l.created_at
        ) row_value,l.entry_date sort_date,l.created_at
        from church_private.ledger_entries l
        where l.tenant_id=v_tenant_id and (p_status is null or l.status=p_status)
        order by l.entry_date desc,l.created_at desc limit v_limit
      ) x;
    when 'church_receipt_requests' then
      select coalesce(jsonb_agg(x.row_value order by x.requested_at desc),'[]'::jsonb)
      into v_result
      from (
        select jsonb_build_object(
          'id',r.id,'member_id',r.member_id,'tax_year',r.tax_year,'donor_name',r.donor_name,
          'delivery_email',r.delivery_email,'status',r.status,'note',r.note,
          'requested_at',r.requested_at,'issued_at',r.issued_at,'created_at',r.created_at
        ) row_value,r.requested_at
        from church_private.receipt_requests r
        where r.tenant_id=v_tenant_id and (p_status is null or r.status=p_status)
        order by r.requested_at desc limit v_limit
      ) x;
    else
      raise exception 'finance table not allowed' using errcode='22023';
  end case;
  return v_result;
end;
$$;

create or replace function public.church_finance_count(
  p_table text,
  p_church_slug text,
  p_status text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church_private
as $$
declare v_tenant_id uuid; v_count bigint:=0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return 0; end if;
  case p_table
    when 'church_offerings' then select count(*) into v_count from church_private.offerings where tenant_id=v_tenant_id;
    when 'church_ledger_entries' then select count(*) into v_count from church_private.ledger_entries where tenant_id=v_tenant_id and (p_status is null or status=p_status);
    when 'church_receipt_requests' then select count(*) into v_count from church_private.receipt_requests where tenant_id=v_tenant_id and (p_status is null or status=p_status);
    else raise exception 'finance table not allowed' using errcode='22023';
  end case;
  return v_count;
end;
$$;

create or replace function public.church_finance_create(
  p_table text,
  p_church_slug text,
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
  v_offering_id uuid;
  v_member_id uuid;
  v_donor_name text;
  v_amount numeric(14,2);
  v_date date;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then raise exception 'church tenant not found' using errcode='P0002'; end if;

  case p_table
    when 'church_offerings' then
      v_member_id := nullif(trim(p_payload->>'member_id'),'')::uuid;
      v_amount := (p_payload->>'amount')::numeric;
      v_date := (p_payload->>'offered_on')::date;
      if v_amount is null or v_amount <= 0 or v_date is null then raise exception 'invalid offering' using errcode='22023'; end if;
      if v_member_id is not null and not exists(select 1 from church_private.members m where m.id=v_member_id and m.tenant_id=v_tenant_id) then
        raise exception 'member not found' using errcode='22023';
      end if;
      v_donor_name := nullif(trim(p_payload->>'donor_name'),'');
      insert into church_private.offerings(
        tenant_id,church_slug,member_id,donor_name,offering_type,amount,offered_on,method,reference_no,anonymous,note,created_by
      ) values (
        v_tenant_id,p_church_slug,v_member_id,
        case when coalesce((p_payload->>'anonymous')::boolean,false) then null else v_donor_name end,
        coalesce(nullif(trim(p_payload->>'offering_type'),''),'other'),
        v_amount,v_date,coalesce(nullif(trim(p_payload->>'method'),''),'bank'),
        nullif(trim(p_payload->>'reference_no'),''),
        coalesce((p_payload->>'anonymous')::boolean,false),
        nullif(trim(p_payload->>'note'),''),p_actor
      ) returning id into v_offering_id;

      insert into church_private.ledger_entries(
        tenant_id,church_slug,entry_date,direction,account_code,account_name,amount,counterparty,memo,offering_id,status,created_by
      ) values (
        v_tenant_id,p_church_slug,v_date,'income','4100','헌금수입',v_amount,
        case when coalesce((p_payload->>'anonymous')::boolean,false) then '무기명' else coalesce(v_donor_name,'교인헌금') end,
        coalesce(nullif(trim(p_payload->>'offering_type'),''),'other')||' 자동분개',
        v_offering_id,'posted',p_actor
      );

      select jsonb_build_object(
        'id',o.id,'member_id',o.member_id,'donor_name',case when o.anonymous then '무기명' else o.donor_name end,
        'offering_type',o.offering_type,'amount',o.amount,'offered_on',o.offered_on,'method',o.method,
        'reference_no',o.reference_no,'anonymous',o.anonymous,'note',o.note,'created_at',o.created_at
      ) into v_result from church_private.offerings o where o.id=v_offering_id;

    when 'church_ledger_entries' then
      v_amount := (p_payload->>'amount')::numeric;
      v_date := (p_payload->>'entry_date')::date;
      if v_amount is null or v_amount <= 0 or v_date is null then raise exception 'invalid ledger entry' using errcode='22023'; end if;
      insert into church_private.ledger_entries(
        tenant_id,church_slug,entry_date,direction,account_code,account_name,amount,counterparty,memo,evidence_ref,status,created_by
      ) values (
        v_tenant_id,p_church_slug,v_date,
        coalesce(nullif(trim(p_payload->>'direction'),''),'expense'),
        coalesce(nullif(trim(p_payload->>'account_code'),''),'5200'),
        coalesce(nullif(trim(p_payload->>'account_name'),''),'기타지출'),
        v_amount,nullif(trim(p_payload->>'counterparty'),''),
        nullif(trim(p_payload->>'memo'),''),nullif(trim(p_payload->>'evidence_ref'),''),
        coalesce(nullif(trim(p_payload->>'status'),''),'posted'),p_actor
      ) returning jsonb_build_object(
        'id',id,'entry_date',entry_date,'direction',direction,'account_code',account_code,
        'account_name',account_name,'amount',amount,'counterparty',counterparty,'memo',memo,
        'evidence_ref',evidence_ref,'status',status,'created_at',created_at
      ) into v_result;
    else
      raise exception 'finance create table not allowed' using errcode='22023';
  end case;

  insert into church_private.audit_logs(tenant_id,church_slug,actor_user_id,action,entity_type,entity_id,detail)
  values(v_tenant_id,p_church_slug,p_actor,'create',p_table,coalesce(v_result->>'id',''),
         jsonb_build_object('source','church-finance'));
  return v_result;
end;
$$;

create or replace function public.church_receipt_status_update(
  p_church_slug text,
  p_id uuid,
  p_status text,
  p_note text,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church_private
as $$
declare v_tenant_id uuid; v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_status not in ('requested','review','issued','rejected') then raise exception 'invalid receipt status' using errcode='22023'; end if;
  select id into v_tenant_id from public.tenants where slug=p_church_slug and status='active' limit 1;
  update church_private.receipt_requests
  set status=p_status,note=nullif(trim(coalesce(p_note,'')),''),
      handled_by=p_actor,issued_at=case when p_status='issued' then now() else issued_at end
  where id=p_id and tenant_id=v_tenant_id
  returning jsonb_build_object('id',id,'status',status,'note',note,'issued_at',issued_at,'updated_at',updated_at) into v_result;
  if v_result is null then raise exception 'receipt request not found' using errcode='P0002'; end if;
  insert into church_private.audit_logs(tenant_id,church_slug,actor_user_id,action,entity_type,entity_id,detail)
  values(v_tenant_id,p_church_slug,p_actor,'update','church_receipt_requests',p_id::text,jsonb_build_object('status',p_status));
  return v_result;
end;
$$;

create or replace function public.church_member_giving_summary(
  p_church_slug text,
  p_user_id uuid,
  p_email text,
  p_tax_year integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_member church_private.members%rowtype;
  v_year integer := coalesce(p_tax_year,extract(year from current_date)::integer);
  v_matches integer;
  v_items jsonb;
  v_total numeric(14,2);
  v_request jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select id into v_tenant_id from public.tenants where slug=p_church_slug and status='active' limit 1;
  if v_tenant_id is null then return jsonb_build_object('linked',false,'reason','tenant_not_found'); end if;

  select * into v_member from church_private.members
  where tenant_id=v_tenant_id and auth_user_id=p_user_id and status<>'inactive' limit 1;

  if v_member.id is null and nullif(trim(coalesce(p_email,'')),'') is not null then
    select count(*) into v_matches from church_private.members
      where tenant_id=v_tenant_id and status<>'inactive' and lower(email)=lower(trim(p_email));
    if v_matches=1 then
      select * into v_member from church_private.members
      where tenant_id=v_tenant_id and status<>'inactive' and lower(email)=lower(trim(p_email)) limit 1;
    end if;
  end if;

  if v_member.id is null then
    return jsonb_build_object('linked',false,'reason','member_not_linked','tax_year',v_year);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'offered_on',o.offered_on,'offering_type',o.offering_type,'amount',o.amount,'method',o.method
  ) order by o.offered_on desc),'[]'::jsonb),coalesce(sum(o.amount),0)
  into v_items,v_total
  from church_private.offerings o
  where o.tenant_id=v_tenant_id and o.member_id=v_member.id
    and extract(year from o.offered_on)::integer=v_year and o.anonymous=false;

  select jsonb_build_object('id',r.id,'status',r.status,'requested_at',r.requested_at,'issued_at',r.issued_at)
  into v_request
  from church_private.receipt_requests r
  where r.tenant_id=v_tenant_id and r.member_id=v_member.id and r.tax_year=v_year and r.status<>'rejected'
  order by r.requested_at desc limit 1;

  return jsonb_build_object(
    'linked',true,'member',jsonb_build_object('id',v_member.id,'name',coalesce(v_member.preferred_name,v_member.full_name)),
    'tax_year',v_year,'total',v_total,'offerings',v_items,'receipt_request',v_request
  );
end;
$$;

create or replace function public.church_member_receipt_request_create(
  p_church_slug text,
  p_user_id uuid,
  p_email text,
  p_tax_year integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, church_private
as $$
declare
  v_tenant_id uuid;
  v_member church_private.members%rowtype;
  v_matches integer;
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_tax_year < 2000 or p_tax_year > extract(year from current_date)::integer then
    raise exception 'invalid tax year' using errcode='22023';
  end if;
  select id into v_tenant_id from public.tenants where slug=p_church_slug and status='active' limit 1;
  select * into v_member from church_private.members
  where tenant_id=v_tenant_id and auth_user_id=p_user_id and status<>'inactive' limit 1;
  if v_member.id is null and nullif(trim(coalesce(p_email,'')),'') is not null then
    select count(*) into v_matches from church_private.members
      where tenant_id=v_tenant_id and status<>'inactive' and lower(email)=lower(trim(p_email));
    if v_matches=1 then
      select * into v_member from church_private.members
      where tenant_id=v_tenant_id and status<>'inactive' and lower(email)=lower(trim(p_email)) limit 1;
    end if;
  end if;
  if v_member.id is null then raise exception 'member not linked' using errcode='42501'; end if;

  insert into church_private.receipt_requests(
    tenant_id,church_slug,member_id,requester_user_id,tax_year,donor_name,delivery_email,status
  ) values (
    v_tenant_id,p_church_slug,v_member.id,p_user_id,p_tax_year,
    coalesce(v_member.full_name,v_member.preferred_name),lower(trim(p_email)),'requested'
  )
  on conflict (tenant_id,member_id,tax_year) where member_id is not null and status <> 'rejected'
  do update set requester_user_id=excluded.requester_user_id,delivery_email=excluded.delivery_email,updated_at=now()
  returning jsonb_build_object('id',id,'status',status,'tax_year',tax_year,'requested_at',requested_at,'issued_at',issued_at) into v_result;
  return v_result;
end;
$$;

revoke all on function public.church_finance_list(text,text,text,integer) from public,anon,authenticated;
revoke all on function public.church_finance_count(text,text,text) from public,anon,authenticated;
revoke all on function public.church_finance_create(text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.church_receipt_status_update(text,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.church_member_giving_summary(text,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.church_member_receipt_request_create(text,uuid,text,integer) from public,anon,authenticated;

grant execute on function public.church_finance_list(text,text,text,integer) to service_role;
grant execute on function public.church_finance_count(text,text,text) to service_role;
grant execute on function public.church_finance_create(text,text,jsonb,uuid) to service_role;
grant execute on function public.church_receipt_status_update(text,uuid,text,text,uuid) to service_role;
grant execute on function public.church_member_giving_summary(text,uuid,text,integer) to service_role;
grant execute on function public.church_member_receipt_request_create(text,uuid,text,integer) to service_role;
