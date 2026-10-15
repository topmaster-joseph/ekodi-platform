-- Private website development documents for EKODIBIZ administrator workspace.
create table if not exists public.ekodibiz_webdev_docs (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default public.ekodibiz_ops_active_tenant() references public.tenants(id),
 code text not null check (code ~ '^[a-z0-9-]{5,80}$'),
 title text not null check (char_length(title) between 3 and 200),
 content text not null check (char_length(content) <= 30000),
 version int not null default 1,
 state text not null default 'draft' check (state in ('draft','review','ready','archived')),
 source_note text not null default '',
 modified_at timestamptz not null default now(),
 unique(tenant_id,code)
);
create table if not exists public.ekodibiz_webdev_events (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id),
 doc_id uuid not null references public.ekodibiz_webdev_docs(id),
 action text not null check (action in ('registered','revised','print_requested','compose_requested','sent_reported')),
 actor_id uuid references auth.users(id),
 version int not null,
 content text not null,
 meta jsonb not null default '{}'::jsonb,
 recorded_at timestamptz not null default now()
);
create index if not exists ekodibiz_webdev_events_lookup on public.ekodibiz_webdev_events(tenant_id,doc_id,recorded_at desc);

create or replace function public.ekodibiz_webdev_log_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='INSERT' then
   new.version:=1;
 elsif tg_op='UPDATE' then
   if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
      or new.code is distinct from old.code or new.version is distinct from old.version then
     raise exception 'webdev_immutable_identity';
   end if;
   new.version:=old.version+1;
 end if;
 new.modified_at:=now();
 return new;
end $$;
create or replace function public.ekodibiz_webdev_snapshot()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.ekodibiz_webdev_events(tenant_id,doc_id,action,actor_id,version,content)
 values(new.tenant_id,new.id,case when tg_op='INSERT' then 'registered' else 'revised' end,auth.uid(),new.version,new.content);
 return new;
end $$;
revoke all on function public.ekodibiz_webdev_log_change(),public.ekodibiz_webdev_snapshot() from public,anon,authenticated;
create trigger ebiz_webdev_stamp before insert or update on public.ekodibiz_webdev_docs
for each row execute function public.ekodibiz_webdev_log_change();
create trigger ebiz_webdev_snapshot after insert or update on public.ekodibiz_webdev_docs
for each row execute function public.ekodibiz_webdev_snapshot();

alter table public.ekodibiz_webdev_docs enable row level security;
alter table public.ekodibiz_webdev_events enable row level security;
revoke all on public.ekodibiz_webdev_docs,public.ekodibiz_webdev_events from public,anon,authenticated;
grant select,insert,update on public.ekodibiz_webdev_docs to authenticated;
grant select on public.ekodibiz_webdev_events to authenticated;
create policy ebiz_webdev_read on public.ekodibiz_webdev_docs for select to authenticated
 using (tenant_id=public.ekodibiz_ops_active_tenant());
create policy ebiz_webdev_insert on public.ekodibiz_webdev_docs for insert to authenticated
 with check (tenant_id=public.ekodibiz_ops_active_tenant());
create policy ebiz_webdev_update on public.ekodibiz_webdev_docs for update to authenticated
 using (tenant_id=public.ekodibiz_ops_active_tenant())
 with check (tenant_id=public.ekodibiz_ops_active_tenant());
create policy ebiz_webdev_events_read on public.ekodibiz_webdev_events for select to authenticated
 using (tenant_id=public.ekodibiz_ops_active_tenant());

create or replace function public.ekodibiz_webdev_log_request(p_id uuid,p_action text,p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare v_tenant uuid;v_doc record;
begin
 v_tenant:=public.ekodibiz_ops_active_tenant();
 if v_tenant is null or p_action not in ('print_requested','compose_requested','sent_reported')
 or jsonb_typeof(p_meta)<>'object' or pg_column_size(p_meta)>1024 then
 raise exception 'webdev_action_forbidden'; end if;
 if p_action='sent_reported' and (coalesce(p_meta->>'recipient','') !~* '^[^@ ]+@[^@ ]+\.[^@ ]+$'
 or length(coalesce(p_meta->>'evidence',''))<6) then
 raise exception 'delivery_report_needs_evidence';end if;
 select * into v_doc from public.ekodibiz_webdev_docs where id=p_id and tenant_id=v_tenant;
 if not found then raise exception 'document_not_found';end if;
 insert into public.ekodibiz_webdev_events(tenant_id,doc_id,action,actor_id,version,content,meta)
 values(v_tenant,p_id,p_action,auth.uid(),v_doc.version,v_doc.content,p_meta);
end $$;
revoke all on function public.ekodibiz_webdev_log_request(uuid,text,jsonb) from public,anon;
grant execute on function public.ekodibiz_webdev_log_request(uuid,text,jsonb) to authenticated;