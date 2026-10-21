-- EKODI Delivery Commerce Intelligence Layer v1
-- Provider-independent acquisition orchestration with provenance and verification.

alter table public.store_channel_profiles
  drop constraint if exists store_channel_profiles_provider_check;
alter table public.store_channel_profiles
  add constraint store_channel_profiles_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));

alter table public.store_channel_menu_listings
  drop constraint if exists store_channel_menu_listings_provider_check;
alter table public.store_channel_menu_listings
  add constraint store_channel_menu_listings_provider_check
  check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store'));

insert into public.store_channel_profiles(store_id,provider,display_name,connection_status,source_kind)
select s.id,p.provider,p.display_name,'partner_required','not_connected'
from public.stores s
cross join (values ('daangn'::text,'당근주문'::text),('naver_order'::text,'네이버주문'::text)) p(provider,display_name)
where s.operating_space_slug in ('jadam','pizzamaru','yogurt')
on conflict(store_id,provider) do nothing;

create table if not exists public.store_commerce_source_configs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null check (provider in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store')),
  acquisition_mode text not null check (acquisition_mode in ('official_api','partner_api','public_web','merchant_portal','browser_session','operator_import','pos_bridge')),
  source_url text,
  enabled boolean not null default true,
  priority smallint not null default 50 check (priority between 1 and 100),
  sync_interval_minutes integer not null default 360 check (sync_interval_minutes between 60 and 10080),
  verification_policy text not null default 'verify_before_publish' check (verification_policy in ('verify_before_publish','trusted_official','operator_review')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,provider,acquisition_mode),
  constraint store_commerce_source_configs_source_url_https_chk check (source_url is null or source_url ~ '^https://')
);

create table if not exists public.store_commerce_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  source_config_id uuid references public.store_commerce_source_configs(id) on delete set null,
  provider text not null,
  acquisition_mode text not null,
  status text not null default 'queued' check (status in ('queued','running','needs_browser','needs_merchant_auth','complete','failed','cancelled')),
  requested_by uuid,
  request_context jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_commerce_sync_jobs_queue_idx on public.store_commerce_sync_jobs(status,created_at);
create index if not exists store_commerce_sync_jobs_store_idx on public.store_commerce_sync_jobs(store_id,created_at desc);

create table if not exists public.store_commerce_evidence (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  acquisition_mode text not null,
  entity_type text not null check (entity_type in ('store','channel','menu_item','menu_listing','source_page')),
  entity_key text not null,
  field_name text not null,
  observed_value jsonb not null default '{}'::jsonb,
  source_url text,
  source_observed_at timestamptz,
  captured_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 0.500 check (confidence between 0 and 1),
  verification_state text not null default 'pending' check (verification_state in ('pending','verified','rejected','stale')),
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint store_commerce_evidence_source_url_https_chk check (source_url is null or source_url ~ '^https://'),
  unique(store_id,provider,entity_type,entity_key,field_name,payload_hash)
);

create index if not exists store_commerce_evidence_lookup_idx on public.store_commerce_evidence(store_id,provider,verification_state,captured_at desc);

alter table public.store_commerce_source_configs enable row level security;
alter table public.store_commerce_sync_jobs enable row level security;
alter table public.store_commerce_evidence enable row level security;

drop policy if exists store_commerce_source_configs_admin on public.store_commerce_source_configs;
create policy store_commerce_source_configs_admin on public.store_commerce_source_configs for all to authenticated
  using (public.can_manage_store_user_site(store_id)) with check (public.can_manage_store_user_site(store_id));

drop policy if exists store_commerce_sync_jobs_admin on public.store_commerce_sync_jobs;
create policy store_commerce_sync_jobs_admin on public.store_commerce_sync_jobs for all to authenticated
  using (public.can_manage_store_user_site(store_id)) with check (public.can_manage_store_user_site(store_id));

drop policy if exists store_commerce_evidence_admin on public.store_commerce_evidence;
create policy store_commerce_evidence_admin on public.store_commerce_evidence for select to authenticated
  using (public.can_manage_store_user_site(store_id));

grant select,insert,update,delete on public.store_commerce_source_configs to authenticated;
grant select,insert,update on public.store_commerce_sync_jobs to authenticated;
grant select on public.store_commerce_evidence to authenticated;
revoke all on public.store_commerce_source_configs from anon;
revoke all on public.store_commerce_sync_jobs from anon;
revoke all on public.store_commerce_evidence from anon;

create or replace function public.delivery_commerce_enqueue(
  p_slug text,p_provider text,p_acquisition_mode text,p_source_url text default null,p_priority integer default 50
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_store_id uuid; v_config_id uuid; v_job_id uuid;
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_mode text := lower(trim(coalesce(p_acquisition_mode,''))); v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_provider not in ('baemin','coupang_eats','yogiyo','ddangyo','mukkebi','daangn','naver_order','store') then raise exception 'unsupported_provider' using errcode='22023'; end if;
  if v_mode not in ('official_api','partner_api','public_web','merchant_portal','browser_session','operator_import','pos_bridge') then raise exception 'unsupported_acquisition_mode' using errcode='22023'; end if;
  if p_source_url is not null and trim(p_source_url)<>'' and p_source_url !~ '^https://' then raise exception 'invalid_source_url' using errcode='22023'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  insert into public.store_commerce_source_configs as existing(store_id,provider,acquisition_mode,source_url,priority,updated_at)
  values(v_store_id,v_provider,v_mode,nullif(trim(coalesce(p_source_url,'')),''),greatest(1,least(100,coalesce(p_priority,50))),now())
  on conflict(store_id,provider,acquisition_mode) do update set source_url=coalesce(excluded.source_url,existing.source_url),priority=excluded.priority,enabled=true,updated_at=now()
  returning id into v_config_id;
  v_status := case v_mode when 'browser_session' then 'needs_browser' when 'merchant_portal' then 'needs_merchant_auth' else 'queued' end;
  insert into public.store_commerce_sync_jobs(store_id,source_config_id,provider,acquisition_mode,status,requested_by)
  values(v_store_id,v_config_id,v_provider,v_mode,v_status,auth.uid()) returning id into v_job_id;
  return jsonb_build_object('ok',true,'job_id',v_job_id,'source_config_id',v_config_id,'provider',v_provider,'mode',v_mode,'status',v_status);
end $$;
revoke all on function public.delivery_commerce_enqueue(text,text,text,text,integer) from public,anon;
grant execute on function public.delivery_commerce_enqueue(text,text,text,text,integer) to authenticated;

create or replace function public.delivery_commerce_admin_snapshot(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_store_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select id into v_store_id from public.stores where lower(operating_space_slug)=lower(trim(coalesce(p_slug,''))) limit 1;
  if v_store_id is null then raise exception 'workspace_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'store_id',v_store_id,
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'mode',c.acquisition_mode,'source_url',c.source_url,'enabled',c.enabled,'priority',c.priority,'verification_policy',c.verification_policy,'last_attempt_at',c.last_attempt_at,'last_success_at',c.last_success_at,'last_error',c.last_error) order by c.priority,c.provider) from public.store_commerce_source_configs c where c.store_id=v_store_id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(x.obj order by x.created_at desc) from (select j.created_at,jsonb_build_object('id',j.id,'provider',j.provider,'mode',j.acquisition_mode,'status',j.status,'created_at',j.created_at,'started_at',j.started_at,'completed_at',j.completed_at,'error_code',j.error_code,'result_summary',j.result_summary) obj from public.store_commerce_sync_jobs j where j.store_id=v_store_id order by j.created_at desc limit 30) x),'[]'::jsonb),
    'evidence',jsonb_build_object('verified',(select count(*) from public.store_commerce_evidence e where e.store_id=v_store_id and e.verification_state='verified'),'pending',(select count(*) from public.store_commerce_evidence e where e.store_id=v_store_id and e.verification_state='pending'),'latest_at',(select max(e.captured_at) from public.store_commerce_evidence e where e.store_id=v_store_id))
  );
end $$;
revoke all on function public.delivery_commerce_admin_snapshot(text) from public,anon;
grant execute on function public.delivery_commerce_admin_snapshot(text) to authenticated;

create or replace function public.delivery_commerce_claim_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_job public.store_commerce_sync_jobs%rowtype; v_source public.store_commerce_source_configs%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_job from public.store_commerce_sync_jobs where id=p_job_id for update;
  if v_job.id is null then raise exception 'job_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_job.store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  if v_job.status not in ('queued','needs_browser','needs_merchant_auth') then raise exception 'job_not_claimable' using errcode='22023'; end if;
  select * into v_source from public.store_commerce_source_configs where id=v_job.source_config_id;
  update public.store_commerce_sync_jobs set status='running',started_at=now(),updated_at=now() where id=p_job_id;
  update public.store_commerce_source_configs set last_attempt_at=now(),updated_at=now() where id=v_source.id;
  return jsonb_build_object('job_id',v_job.id,'store_id',v_job.store_id,'provider',v_job.provider,'mode',v_job.acquisition_mode,'source_url',v_source.source_url,'verification_policy',v_source.verification_policy);
end $$;
revoke all on function public.delivery_commerce_claim_job(uuid) from public,anon;
grant execute on function public.delivery_commerce_claim_job(uuid) to authenticated;

create or replace function public.delivery_commerce_complete_scan(
  p_job_id uuid,p_status text,p_metadata jsonb default '{}'::jsonb,p_error_code text default null,p_error_message text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_job public.store_commerce_sync_jobs%rowtype; v_confidence numeric(4,3); v_hash text; v_state text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_job from public.store_commerce_sync_jobs where id=p_job_id for update;
  if v_job.id is null then raise exception 'job_not_found' using errcode='22023'; end if;
  if not public.can_manage_store_user_site(v_job.store_id) then raise exception 'workspace_admin_required' using errcode='42501'; end if;
  if p_status not in ('complete','failed','needs_browser','needs_merchant_auth') then raise exception 'invalid_completion_status' using errcode='22023'; end if;
  v_confidence := greatest(0,least(1,coalesce(nullif(p_metadata->>'confidence','')::numeric,0.50)));
  v_state := case when p_status='complete' and coalesce((p_metadata->>'verified')::boolean,false) then 'verified' else 'pending' end;
  v_hash := md5(coalesce(p_metadata,'{}'::jsonb)::text);
  update public.store_commerce_sync_jobs set status=p_status,result_summary=coalesce(p_metadata,'{}'::jsonb),error_code=p_error_code,error_message=p_error_message,completed_at=case when p_status in ('complete','failed') then now() else null end,updated_at=now() where id=p_job_id;
  update public.store_commerce_source_configs set last_success_at=case when p_status='complete' then now() else last_success_at end,last_error=case when p_status='failed' then coalesce(p_error_message,p_error_code) else null end,updated_at=now() where id=v_job.source_config_id;
  if coalesce(p_metadata,'{}'::jsonb) <> '{}'::jsonb then
    insert into public.store_commerce_evidence(store_id,provider,acquisition_mode,entity_type,entity_key,field_name,observed_value,source_url,confidence,verification_state,payload_hash)
    values(v_job.store_id,v_job.provider,v_job.acquisition_mode,'source_page',v_job.id::text,'page_metadata',coalesce(p_metadata,'{}'::jsonb),nullif(p_metadata->>'source_url',''),v_confidence,v_state,v_hash)
    on conflict(store_id,provider,entity_type,entity_key,field_name,payload_hash) do nothing;
  end if;
  return jsonb_build_object('ok',true,'job_id',p_job_id,'status',p_status,'verification_state',v_state);
end $$;
revoke all on function public.delivery_commerce_complete_scan(uuid,text,jsonb,text,text) from public,anon;
grant execute on function public.delivery_commerce_complete_scan(uuid,text,jsonb,text,text) to authenticated;

create or replace function public.log_store_commerce_listing_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_value jsonb; v_conf numeric(4,3); v_hash text;
begin
  if new.verified_at is null or new.source_kind not in ('official_api','partner_import','verified_file','manual_verified') then return new; end if;
  v_value := jsonb_build_object('provider',new.provider,'name',new.listing_name,'price',new.listed_price,'image_url',new.image_url,'order_url',new.public_order_url,'availability',new.availability,'verified_at',new.verified_at);
  v_conf := case new.source_kind when 'official_api' then 0.990 when 'partner_import' then 0.950 when 'verified_file' then 0.900 else 0.850 end;
  v_hash := md5(v_value::text);
  insert into public.store_commerce_evidence(store_id,provider,acquisition_mode,entity_type,entity_key,field_name,observed_value,source_url,source_observed_at,confidence,verification_state,payload_hash)
  values(new.store_id,new.provider,case new.source_kind when 'official_api' then 'official_api' when 'partner_import' then 'partner_api' else 'operator_import' end,'menu_listing',new.id::text,'listing',v_value,new.source_url,new.verified_at,v_conf,'verified',v_hash)
  on conflict(store_id,provider,entity_type,entity_key,field_name,payload_hash) do nothing;
  return new;
end $$;

drop trigger if exists trg_store_commerce_listing_evidence on public.store_channel_menu_listings;
create trigger trg_store_commerce_listing_evidence after insert or update on public.store_channel_menu_listings
for each row execute function public.log_store_commerce_listing_evidence();

with modes(provider,mode,priority) as (values
  ('baemin'::text,'browser_session'::text,30),('yogiyo','browser_session',30),('ddangyo','browser_session',30),('mukkebi','browser_session',30),('coupang_eats','browser_session',35),('daangn','public_web',20),('naver_order','public_web',20)
)
insert into public.store_commerce_source_configs(store_id,provider,acquisition_mode,priority,verification_policy)
select s.id,m.provider,m.mode,m.priority,'verify_before_publish' from public.stores s cross join modes m
where s.operating_space_slug in ('jadam','pizzamaru','yogurt') on conflict(store_id,provider,acquisition_mode) do nothing;

insert into public.store_commerce_source_configs(store_id,provider,acquisition_mode,source_url,priority,verification_policy)
select s.id,'store','public_web','https://www.pizzamaru.co.kr/menu/',10,'trusted_official' from public.stores s where s.operating_space_slug='pizzamaru'
on conflict(store_id,provider,acquisition_mode) do update set source_url=excluded.source_url,priority=excluded.priority,verification_policy=excluded.verification_policy,updated_at=now();

comment on table public.store_commerce_source_configs is 'EKODI Delivery Commerce Intelligence source registry. Public/API/browser/merchant/operator paths remain provider-independent.';
comment on table public.store_commerce_evidence is 'Field-level provenance ledger for commerce observations. Only verified evidence should become customer-facing canonical data.';
comment on table public.store_commerce_sync_jobs is 'Bounded sync queue. Browser and merchant modes explicitly require authorized sessions; no protection bypass is attempted.';
