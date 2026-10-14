-- EKODIBIZ Business Center. Additive tenant-scoped records and append-only audit log.
-- Authentication is Supabase JWT; workspace access is resolved by the existing registry.
create or replace function public.ekodibiz_ops_active_tenant()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  if auth.uid() is null then return null; end if;
  v := public.current_site_access('biz');
  if v->>'authenticated' <> 'true' or v->>'status' <> 'active'
    or coalesce(v->>'role','') not in ('tenant_admin','workspace_admin','platform_admin','owner','admin','store_owner','client_admin')
  then return null; end if;
  return nullif(v->>'tenant_id','')::uuid;
end $$;
revoke all on function public.ekodibiz_ops_active_tenant() from public, anon;
grant execute on function public.ekodibiz_ops_active_tenant() to authenticated;

create table if not exists public.ekodibiz_ops_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.ekodibiz_ops_active_tenant() references public.tenants(id),
  kind text not null check (kind in ('admin','project','education','finance','document','task')),
  title text not null check (char_length(trim(title)) between 2 and 200),
  details text not null default '' check (char_length(details) <= 8000),
  status text not null default 'planned' check (status in ('planned','in_progress','review','done','archived')),
  due_on date,
  reference text not null default '' check (char_length(reference) <= 400),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ekodibiz_ops_items_tenant_updated_idx
  on public.ekodibiz_ops_items(tenant_id, updated_at desc);
create index if not exists ekodibiz_ops_items_tenant_kind_due_idx
  on public.ekodibiz_ops_items(tenant_id, kind, due_on) where status <> 'archived';

create table if not exists public.ekodibiz_ops_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  item_id uuid references public.ekodibiz_ops_items(id),
  actor_id uuid references auth.users(id),
  action text not null check (action in ('created','updated','print_requested','csv_requested')),
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists ekodibiz_ops_audit_tenant_time_idx
  on public.ekodibiz_ops_audit(tenant_id, occurred_at desc);

create or replace function public.ekodibiz_ops_stamp()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.ekodibiz_ops_active_tenant() is null
    or new.tenant_id is distinct from public.ekodibiz_ops_active_tenant()
  then raise exception 'ekodibiz_ops_forbidden' using errcode='42501'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  elsif new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
  then raise exception 'immutable_item_identity' using errcode='23514'; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

create or replace function public.ekodibiz_ops_audit_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ekodibiz_ops_audit(tenant_id,item_id,actor_id,action,before_data,after_data)
  values (new.tenant_id,new.id,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,
          case when tg_op='INSERT' then null else to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;
drop trigger if exists ekodibiz_ops_stamp_trg on public.ekodibiz_ops_items;
create trigger ekodibiz_ops_stamp_trg before insert or update on public.ekodibiz_ops_items
for each row execute function public.ekodibiz_ops_stamp();
drop trigger if exists ekodibiz_ops_audit_trg on public.ekodibiz_ops_items;
create trigger ekodibiz_ops_audit_trg after insert or update on public.ekodibiz_ops_items
for each row execute function public.ekodibiz_ops_audit_change();

alter table public.ekodibiz_ops_items enable row level security;
alter table public.ekodibiz_ops_audit enable row level security;
revoke all on public.ekodibiz_ops_items, public.ekodibiz_ops_audit from public,anon,authenticated;
grant select,insert,update on public.ekodibiz_ops_items to authenticated;
grant select on public.ekodibiz_ops_audit to authenticated;
-- No client delete and no direct client insert/update into audit.
create policy ekodibiz_ops_items_read on public.ekodibiz_ops_items
for select to authenticated using (tenant_id = public.ekodibiz_ops_active_tenant());
create policy ekodibiz_ops_items_write on public.ekodibiz_ops_items
for insert to authenticated with check (tenant_id = public.ekodibiz_ops_active_tenant());
create policy ekodibiz_ops_items_change on public.ekodibiz_ops_items
for update to authenticated using (tenant_id = public.ekodibiz_ops_active_tenant())
with check (tenant_id = public.ekodibiz_ops_active_tenant());
create policy ekodibiz_ops_audit_read on public.ekodibiz_ops_audit
for select to authenticated using (tenant_id = public.ekodibiz_ops_active_tenant());

-- Logs the request to open an output or export, not proof of physical printing.
create or replace function public.ekodibiz_ops_log_output(p_action text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare v_tenant uuid;
begin
  v_tenant := public.ekodibiz_ops_active_tenant();
  if v_tenant is null or p_action not in ('print_requested','csv_requested')
  then raise exception 'ekodibiz_ops_forbidden' using errcode='42501'; end if;
  insert into public.ekodibiz_ops_audit(tenant_id,actor_id,action)
  values (v_tenant,auth.uid(),p_action);
end $$;
revoke all on function public.ekodibiz_ops_log_output(text) from public,anon;
grant execute on function public.ekodibiz_ops_log_output(text) to authenticated;

comment on table public.ekodibiz_ops_items is 'EKODIBIZ operational administrative records, separate from finance and tax source systems.';
comment on table public.ekodibiz_ops_audit is 'Append-only EKODIBIZ business-center change/output-request ledger.';
