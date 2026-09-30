-- EKODIBIZ trade partner portal.
-- Partner users authenticate through EKODI identity; access is then bound to counterparty companies.

create table if not exists public.trade_company_members (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references public.trade_counterparties(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  email text not null,
  role text not null default 'counterparty_member',
  status text not null default 'pre_registered',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_company_members_email_lower check (email = lower(email)),
  constraint trade_company_members_role_check check (role in ('counterparty_admin','counterparty_member')),
  constraint trade_company_members_status_check check (status in ('pre_registered','active','disabled')),
  unique (counterparty_id, email)
);

create table if not exists public.trade_engagements (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  counterparty_id uuid not null references public.trade_counterparties(id) on delete cascade,
  engagement_code text not null,
  title text not null,
  summary text not null default '',
  status text not null default 'prospecting',
  phase text not null default '',
  started_at timestamptz not null default now(),
  target_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_engagement_status_check check (status in ('prospecting','negotiating','contracted','in_progress','on_hold','completed','cancelled')),
  unique (workspace_tenant_id, engagement_code)
);create table if not exists public.trade_records (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.trade_engagements(id) on delete cascade,
  record_type text not null default 'progress',
  visibility text not null default 'shared',
  status text not null default 'draft',
  title text not null,
  body text not null default '',
  event_at timestamptz not null default now(),
  supersedes_id uuid references public.trade_records(id) on delete set null,
  created_by_user_id uuid,
  created_by_person_id uuid references public.people(id) on delete set null,
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trade_record_type_check check (record_type in ('progress','milestone','official','document','decision','note')),
  constraint trade_record_visibility_check check (visibility in ('shared','internal')),
  constraint trade_record_status_check check (status in ('draft','confirmed','superseded'))
);

create table if not exists public.trade_record_acknowledgements (
  record_id uuid not null references public.trade_records(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  acknowledgement text not null default 'acknowledged',
  created_at timestamptz not null default now(),
  constraint trade_record_ack_type_check check (acknowledgement in ('seen','acknowledged','confirmed')),
  primary key (record_id, person_id)
);

create index if not exists trade_company_members_person_idx
  on public.trade_company_members(counterparty_id, person_id) where person_id is not null;
create index if not exists trade_company_members_email_idx
  on public.trade_company_members(email, status);
create index if not exists trade_engagements_company_idx
  on public.trade_engagements(counterparty_id, updated_at desc);
create index if not exists trade_records_engagement_idx
  on public.trade_records(engagement_id, event_at desc, created_at desc);

alter table public.trade_company_members enable row level security;
alter table public.trade_engagements enable row level security;
alter table public.trade_records enable row level security;
alter table public.trade_record_acknowledgements enable row level security;revoke all on table public.trade_company_members from anon, authenticated;
revoke all on table public.trade_engagements from anon, authenticated;
revoke all on table public.trade_records from anon, authenticated;
revoke all on table public.trade_record_acknowledgements from anon, authenticated;

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select li.person_id
    from public.login_identities li
   where li.auth_user_id = auth.uid()
     and li.status = 'active'
   order by li.is_primary desc, li.linked_at asc
   limit 1;
$$;

create or replace function public.trade_company_access(p_counterparty_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_company public.trade_counterparties%rowtype;
  v_person_id uuid := public.current_person_id();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_trade jsonb;
  v_member public.trade_company_members%rowtype;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('allowed',false,'reason','auth_required');
  end if;
  select * into v_company from public.trade_counterparties where id=p_counterparty_id limit 1;
  if v_company.id is null then return jsonb_build_object('allowed',false,'reason','company_not_found'); end if;

  select public.trade_current_access(t.slug) into v_trade
    from public.tenants t where t.id=v_company.workspace_tenant_id limit 1;
  if coalesce((v_trade->>'allowed')::boolean,false) is true then
    if v_trade->>'scope_mode'='all' or exists (
      select 1 from jsonb_array_elements_text(coalesce(v_trade->'company_ids','[]'::jsonb)) x(value)
      where x.value=p_counterparty_id::text
    ) then
      return jsonb_build_object('allowed',true,'side','ekodibiz','role',v_trade->>'role',
        'can_write',coalesce((v_trade->>'can_write')::boolean,false),
        'can_manage_members',coalesce((v_trade->>'can_manage_access')::boolean,false) or v_trade->>'role'='trade_admin',
        'can_create_official',coalesce((v_trade->>'can_write')::boolean,false));
    end if;
  end if;
  select m.* into v_member
    from public.trade_company_members m
   where m.counterparty_id=p_counterparty_id
     and m.status in ('pre_registered','active')
     and ((v_person_id is not null and m.person_id=v_person_id) or lower(m.email)=v_email)
   order by case when v_person_id is not null and m.person_id=v_person_id then 0 else 1 end, m.updated_at desc
   limit 1;

  if v_member.id is null then
    return jsonb_build_object('allowed',false,'reason','company_membership_required');
  end if;
  return jsonb_build_object('allowed',true,'side','counterparty','role',v_member.role,
    'member_id',v_member.id,'can_write',true,
    'can_manage_members',v_member.role='counterparty_admin',
    'can_create_official',false);
end
$$;

create or replace function public.trade_partner_companies(p_workspace_slug text default 'ekodi-biz')
returns table(
  id uuid, slug text, display_name text, legal_name text, country_code text,
  registration_no text, status text, access_side text, access_role text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id uuid;
  v_trade jsonb := public.trade_current_access(p_workspace_slug);
  v_person_id uuid := public.current_person_id();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  select t.id into v_workspace_id from public.tenants t where t.slug=p_workspace_slug and t.status='active' limit 1;
  if v_workspace_id is null or auth.uid() is null then return; end if;

  if coalesce((v_trade->>'allowed')::boolean,false) is true then
    if v_trade->>'scope_mode'='all' then
      return query select c.id,c.slug,c.display_name,c.legal_name,c.country_code,c.registration_no,c.status,
        'ekodibiz'::text,(v_trade->>'role')::text
        from public.trade_counterparties c
       where c.workspace_tenant_id=v_workspace_id and c.status<>'archived'
       order by c.display_name;
      return;
    end if;
    return query select c.id,c.slug,c.display_name,c.legal_name,c.country_code,c.registration_no,c.status,
      'ekodibiz'::text,(v_trade->>'role')::text
      from public.trade_counterparties c
     where c.workspace_tenant_id=v_workspace_id
       and c.id in (select value::uuid from jsonb_array_elements_text(coalesce(v_trade->'company_ids','[]'::jsonb)))
       and c.status<>'archived' order by c.display_name;
    return;
  end if;  return query
    select c.id,c.slug,c.display_name,c.legal_name,c.country_code,c.registration_no,c.status,
      'counterparty'::text,m.role
      from public.trade_company_members m
      join public.trade_counterparties c on c.id=m.counterparty_id
     where c.workspace_tenant_id=v_workspace_id
       and c.status<>'archived'
       and m.status in ('pre_registered','active')
       and ((v_person_id is not null and m.person_id=v_person_id) or lower(m.email)=v_email)
     order by c.display_name;
end
$$;

create or replace function public.trade_list_company_members(p_counterparty_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_access jsonb := public.trade_company_access(p_counterparty_id);
  v_members jsonb;
begin
  if coalesce((v_access->>'allowed')::boolean,false) is not true
     or coalesce((v_access->>'can_manage_members')::boolean,false) is not true then
    return jsonb_build_object('error','company_member_admin_required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'email',m.email,'person_id',m.person_id,'role',m.role,'status',m.status,
    'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.email),'[]'::jsonb)
    into v_members from public.trade_company_members m where m.counterparty_id=p_counterparty_id;
  return jsonb_build_object('members',v_members,'access',v_access);
end
$$;

create or replace function public.trade_upsert_company_member(
  p_counterparty_id uuid,
  p_email text,
  p_role text default 'counterparty_member',
  p_status text default 'pre_registered'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_access jsonb := public.trade_company_access(p_counterparty_id);
  v_email text := lower(trim(coalesce(p_email,'')));
  v_person_id uuid;
  v_id uuid;
begin
  if coalesce((v_access->>'allowed')::boolean,false) is not true
     or coalesce((v_access->>'can_manage_members')::boolean,false) is not true then
    return jsonb_build_object('error','company_member_admin_required');
  end if;  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('error','invalid_email');
  end if;
  if p_role not in ('counterparty_admin','counterparty_member') then
    return jsonb_build_object('error','invalid_role');
  end if;
  if p_status not in ('pre_registered','active','disabled') then
    return jsonb_build_object('error','invalid_status');
  end if;

  select li.person_id into v_person_id
    from public.login_identities li
   where lower(li.email)=v_email and li.status='active'
   order by li.is_primary desc,li.linked_at asc
   limit 1;

  insert into public.trade_company_members(counterparty_id,person_id,email,role,status,created_by)
  values(p_counterparty_id,v_person_id,v_email,p_role,p_status,auth.uid())
  on conflict(counterparty_id,email) do update
    set person_id=coalesce(excluded.person_id,public.trade_company_members.person_id),
        role=excluded.role,status=excluded.status,updated_at=now()
  returning id into v_id;

  insert into public.site_access_registry(email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
  select v_email,'trade',c.workspace_tenant_id,'member'::public.app_role,
         case when p_status='disabled' then 'revoked' else p_status end,
         'trade_counterparty_member','Counterparty company: '||c.id::text,'standard',now(),now()
    from public.trade_counterparties c where c.id=p_counterparty_id
  on conflict(email,site_key,tenant_id,role) do update
    set status=excluded.status,source=excluded.source,note=excluded.note,updated_at=now();  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata)
  select c.workspace_tenant_id,auth.uid(),'trade.company_member.upsert','company_member',v_id::text,
         jsonb_build_object('counterparty_id',p_counterparty_id,'email',v_email,'role',p_role,'status',p_status)
    from public.trade_counterparties c where c.id=p_counterparty_id;

  return jsonb_build_object('ok',true,'id',v_id,'email',v_email,'role',p_role,'status',p_status);
end
$$;

create or replace function public.trade_list_engagements(p_counterparty_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_access jsonb := public.trade_company_access(p_counterparty_id);
  v_rows jsonb;
begin
  if coalesce((v_access->>'allowed')::boolean,false) is not true then
    return jsonb_build_object('error','company_access_required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'code',e.engagement_code,'title',e.title,'summary',e.summary,
    'status',e.status,'phase',e.phase,'started_at',e.started_at,'target_at',e.target_at,
    'closed_at',e.closed_at,'updated_at',e.updated_at
  ) order by e.updated_at desc),'[]'::jsonb)
    into v_rows from public.trade_engagements e where e.counterparty_id=p_counterparty_id;
  return jsonb_build_object('access',v_access,'engagements',v_rows);
end
$$;create or replace function public.trade_upsert_engagement(
  p_counterparty_id uuid,
  p_id uuid,
  p_engagement_code text,
  p_title text,
  p_summary text default '',
  p_status text default 'prospecting',
  p_phase text default '',
  p_target_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_access jsonb := public.trade_company_access(p_counterparty_id);
  v_workspace_id uuid;
  v_id uuid;
  v_code text := upper(trim(coalesce(p_engagement_code,'')));
  v_title text := trim(coalesce(p_title,''));
begin
  if coalesce((v_access->>'allowed')::boolean,false) is not true
     or coalesce((v_access->>'can_write')::boolean,false) is not true then
    return jsonb_build_object('error','engagement_write_forbidden');
  end if;
  if v_code='' or length(v_code)>80 or v_title='' or length(v_title)>240 then
    return jsonb_build_object('error','invalid_engagement');
  end if;
  if p_status not in ('prospecting','negotiating','contracted','in_progress','on_hold','completed','cancelled') then
    return jsonb_build_object('error','invalid_engagement_status');
  end if;  select c.workspace_tenant_id into v_workspace_id
    from public.trade_counterparties c where c.id=p_counterparty_id limit 1;

  if p_id is null then
    insert into public.trade_engagements(
      workspace_tenant_id,counterparty_id,engagement_code,title,summary,status,phase,target_at,created_by
    ) values(
      v_workspace_id,p_counterparty_id,v_code,v_title,trim(coalesce(p_summary,'')),p_status,
      trim(coalesce(p_phase,'')),p_target_at,auth.uid()
    ) returning id into v_id;
  else
    update public.trade_engagements
       set engagement_code=v_code,title=v_title,summary=trim(coalesce(p_summary,'')),status=p_status,
           phase=trim(coalesce(p_phase,'')),target_at=p_target_at,
           closed_at=case when p_status in ('completed','cancelled') then coalesce(closed_at,now()) else null end,
           updated_at=now()
     where id=p_id and counterparty_id=p_counterparty_id
     returning id into v_id;
  end if;
  if v_id is null then return jsonb_build_object('error','engagement_not_found'); end if;

  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(v_workspace_id,auth.uid(),case when p_id is null then 'trade.engagement.create' else 'trade.engagement.update' end,
    'engagement',v_id::text,jsonb_build_object('counterparty_id',p_counterparty_id,'code',v_code,'status',p_status,'phase',p_phase));
  return jsonb_build_object('ok',true,'id',v_id,'code',v_code,'status',p_status);
exception
  when unique_violation then return jsonb_build_object('error','engagement_code_exists');
end
$$;create or replace function public.trade_list_records(p_engagement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_counterparty_id uuid;
  v_access jsonb;
  v_records jsonb;
begin
  select e.counterparty_id into v_counterparty_id from public.trade_engagements e where e.id=p_engagement_id limit 1;
  if v_counterparty_id is null then return jsonb_build_object('error','engagement_not_found'); end if;
  v_access := public.trade_company_access(v_counterparty_id);
  if coalesce((v_access->>'allowed')::boolean,false) is not true then
    return jsonb_build_object('error','company_access_required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'record_type',r.record_type,'visibility',r.visibility,'status',r.status,
    'title',r.title,'body',r.body,'event_at',r.event_at,'supersedes_id',r.supersedes_id,
    'confirmed_at',r.confirmed_at,'created_at',r.created_at,
    'acknowledgements',coalesce((select jsonb_agg(jsonb_build_object('person_id',a.person_id,'type',a.acknowledgement,'created_at',a.created_at)) from public.trade_record_acknowledgements a where a.record_id=r.id),'[]'::jsonb)
  ) order by r.event_at desc,r.created_at desc),'[]'::jsonb)
    into v_records from public.trade_records r
   where r.engagement_id=p_engagement_id
     and ((v_access->>'side')='ekodibiz' or r.visibility='shared');
  return jsonb_build_object('access',v_access,'records',v_records);
end
$$;create or replace function public.trade_create_record(
  p_engagement_id uuid,
  p_record_type text,
  p_visibility text,
  p_title text,
  p_body text default '',
  p_event_at timestamptz default now(),
  p_supersedes_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_counterparty_id uuid;
  v_workspace_id uuid;
  v_access jsonb;
  v_person_id uuid := public.current_person_id();
  v_id uuid;
  v_type text := lower(trim(coalesce(p_record_type,'progress')));
  v_visibility text := lower(trim(coalesce(p_visibility,'shared')));
begin
  select e.counterparty_id,e.workspace_tenant_id into v_counterparty_id,v_workspace_id
    from public.trade_engagements e where e.id=p_engagement_id limit 1;
  if v_counterparty_id is null then return jsonb_build_object('error','engagement_not_found'); end if;
  v_access := public.trade_company_access(v_counterparty_id);
  if coalesce((v_access->>'allowed')::boolean,false) is not true
     or coalesce((v_access->>'can_write')::boolean,false) is not true then
    return jsonb_build_object('error','record_write_forbidden');
  end if;
  if v_type not in ('progress','milestone','official','document','decision','note') then
    return jsonb_build_object('error','invalid_record_type');
  end if;  if v_visibility not in ('shared','internal') then
    return jsonb_build_object('error','invalid_record_visibility');
  end if;
  if trim(coalesce(p_title,''))='' or length(trim(p_title))>240 then
    return jsonb_build_object('error','invalid_record_title');
  end if;
  if v_visibility='internal' and (v_access->>'side')<>'ekodibiz' then
    return jsonb_build_object('error','internal_record_forbidden');
  end if;
  if v_type in ('official','decision') and coalesce((v_access->>'can_create_official')::boolean,false) is not true then
    return jsonb_build_object('error','official_record_forbidden');
  end if;
  if p_supersedes_id is not null and not exists(
    select 1 from public.trade_records r where r.id=p_supersedes_id and r.engagement_id=p_engagement_id and r.status='confirmed'
  ) then
    return jsonb_build_object('error','superseded_record_invalid');
  end if;

  insert into public.trade_records(
    engagement_id,record_type,visibility,status,title,body,event_at,supersedes_id,created_by_user_id,created_by_person_id
  ) values(
    p_engagement_id,v_type,v_visibility,'draft',trim(p_title),trim(coalesce(p_body,'')),coalesce(p_event_at,now()),
    p_supersedes_id,auth.uid(),v_person_id
  ) returning id into v_id;

  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(v_workspace_id,auth.uid(),'trade.record.create','record',v_id::text,
    jsonb_build_object('engagement_id',p_engagement_id,'type',v_type,'visibility',v_visibility,'supersedes_id',p_supersedes_id));
  return jsonb_build_object('ok',true,'id',v_id,'status','draft','record_type',v_type,'visibility',v_visibility);
end
$$;create or replace function public.trade_confirm_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_record public.trade_records%rowtype;
  v_counterparty_id uuid;
  v_workspace_id uuid;
  v_access jsonb;
begin
  select r.* into v_record from public.trade_records r where r.id=p_record_id limit 1;
  if v_record.id is null then return jsonb_build_object('error','record_not_found'); end if;
  select e.counterparty_id,e.workspace_tenant_id into v_counterparty_id,v_workspace_id
    from public.trade_engagements e where e.id=v_record.engagement_id limit 1;
  v_access := public.trade_company_access(v_counterparty_id);
  if coalesce((v_access->>'allowed')::boolean,false) is not true
     or coalesce((v_access->>'can_create_official')::boolean,false) is not true then
    return jsonb_build_object('error','record_confirm_forbidden');
  end if;
  if v_record.status<>'draft' then return jsonb_build_object('error','record_not_draft'); end if;

  update public.trade_records
     set status='confirmed',confirmed_by_user_id=auth.uid(),confirmed_at=now()
   where id=p_record_id;
  if v_record.supersedes_id is not null then
    update public.trade_records set status='superseded' where id=v_record.supersedes_id and status='confirmed';
  end if;
  insert into public.trade_access_audit_log(workspace_tenant_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(v_workspace_id,auth.uid(),'trade.record.confirm','record',p_record_id::text,
    jsonb_build_object('engagement_id',v_record.engagement_id,'supersedes_id',v_record.supersedes_id));
  return jsonb_build_object('ok',true,'id',p_record_id,'status','confirmed','confirmed_at',now());
end
$$;create or replace function public.trade_acknowledge_record(
  p_record_id uuid,
  p_acknowledgement text default 'acknowledged'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_record public.trade_records%rowtype;
  v_counterparty_id uuid;
  v_access jsonb;
  v_person_id uuid := public.current_person_id();
  v_ack text := lower(trim(coalesce(p_acknowledgement,'acknowledged')));
begin
  if v_person_id is null then return jsonb_build_object('error','person_identity_required'); end if;
  if v_ack not in ('seen','acknowledged','confirmed') then return jsonb_build_object('error','invalid_acknowledgement'); end if;
  select r.* into v_record from public.trade_records r where r.id=p_record_id limit 1;
  if v_record.id is null then return jsonb_build_object('error','record_not_found'); end if;
  select e.counterparty_id into v_counterparty_id from public.trade_engagements e where e.id=v_record.engagement_id limit 1;
  v_access := public.trade_company_access(v_counterparty_id);
  if coalesce((v_access->>'allowed')::boolean,false) is not true then return jsonb_build_object('error','company_access_required'); end if;
  if (v_access->>'side')='counterparty' and v_record.visibility<>'shared' then return jsonb_build_object('error','record_not_visible'); end if;

  insert into public.trade_record_acknowledgements(record_id,person_id,acknowledgement)
  values(p_record_id,v_person_id,v_ack)
  on conflict(record_id,person_id) do update set acknowledgement=excluded.acknowledgement,created_at=now();
  return jsonb_build_object('ok',true,'record_id',p_record_id,'acknowledgement',v_ack);
end
$$;

revoke all on function public.current_person_id() from public, anon;
revoke all on function public.trade_company_access(uuid) from public, anon;
revoke all on function public.trade_partner_companies(text) from public, anon;
revoke all on function public.trade_list_company_members(uuid) from public, anon;revoke all on function public.trade_upsert_company_member(uuid,text,text,text) from public, anon;
revoke all on function public.trade_list_engagements(uuid) from public, anon;
revoke all on function public.trade_upsert_engagement(uuid,uuid,text,text,text,text,text,timestamptz) from public, anon;
revoke all on function public.trade_list_records(uuid) from public, anon;
revoke all on function public.trade_create_record(uuid,text,text,text,text,timestamptz,uuid) from public, anon;
revoke all on function public.trade_confirm_record(uuid) from public, anon;
revoke all on function public.trade_acknowledge_record(uuid,text) from public, anon;

grant execute on function public.current_person_id() to authenticated;
grant execute on function public.trade_company_access(uuid) to authenticated;
grant execute on function public.trade_partner_companies(text) to authenticated;
grant execute on function public.trade_list_company_members(uuid) to authenticated;
grant execute on function public.trade_upsert_company_member(uuid,text,text,text) to authenticated;
grant execute on function public.trade_list_engagements(uuid) to authenticated;
grant execute on function public.trade_upsert_engagement(uuid,uuid,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.trade_list_records(uuid) to authenticated;
grant execute on function public.trade_create_record(uuid,text,text,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.trade_confirm_record(uuid) to authenticated;
grant execute on function public.trade_acknowledge_record(uuid,text) to authenticated;

create or replace function public.trade_claim_company_memberships(p_workspace_slug text default 'ekodi-biz')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id uuid;
  v_person_id uuid := public.current_person_id();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_count integer := 0;
  v_ekodi_id text;
begin
  if auth.uid() is null or v_person_id is null or v_email='' then
    return jsonb_build_object('error','person_identity_required');
  end if;
  select id into v_workspace_id from public.tenants where slug=p_workspace_slug and status='active' limit 1;
  if v_workspace_id is null then return jsonb_build_object('error','workspace_not_found'); end if;
  update public.trade_company_members m
     set person_id=v_person_id,status='active',updated_at=now()
    from public.trade_counterparties c
   where c.id=m.counterparty_id and c.workspace_tenant_id=v_workspace_id
     and lower(m.email)=v_email and m.status in ('pre_registered','active') and m.person_id is distinct from v_person_id;
  get diagnostics v_count = row_count;
  update public.site_access_registry set status='active',updated_at=now()
   where lower(email)=v_email and site_key='trade' and tenant_id=v_workspace_id and status='pre_registered';
  select ekodi_id into v_ekodi_id from public.people where id=v_person_id limit 1;
  return jsonb_build_object('ok',true,'claimed',v_count,'person_id',v_person_id,'ekodi_id',v_ekodi_id);
end
$$;

revoke all on function public.trade_claim_company_memberships(text) from public, anon;
grant execute on function public.trade_claim_company_memberships(text) to authenticated;
