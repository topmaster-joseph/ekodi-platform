-- EKODI-O2O-002: additive tenant-owned, auditable, revocable QR links.
-- QR scan is never identity verification, attendance, a payment or an activity-point award.
-- Deployed only through the guarded schema workflow and constitutional change gates.

create table if not exists public.o2o_campaign_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site_id text not null check (site_id in ('mission','commerce','education','books','mall','civic')),
  title text not null check (length(btrim(title)) between 1 and 90),
  target_path text not null check (length(target_path) between 2 and 500),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz
);
create index if not exists o2o_campaign_links_tenant_created_idx
  on public.o2o_campaign_links (tenant_id, created_at desc);
alter table public.o2o_campaign_links enable row level security;
revoke all on table public.o2o_campaign_links from public, anon, authenticated, service_role;
-- No client table policies. All access is through explicitly role-gated RPCs.

create table if not exists public.o2o_campaign_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  link_id uuid not null references public.o2o_campaign_links(id) on delete cascade,
  action text not null check (action in ('issued','revoked')),
  actor_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index if not exists o2o_campaign_audit_tenant_time_idx
  on public.o2o_campaign_audit (tenant_id, occurred_at desc);
alter table public.o2o_campaign_audit enable row level security;
revoke all on table public.o2o_campaign_audit from public, anon, authenticated, service_role;
revoke all on sequence public.o2o_campaign_audit_id_seq from public, anon, authenticated, service_role;

create or replace function public.o2o_operator_snapshot(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if p_tenant_id is null or auth.uid() is null
    or not exists (select 1 from jsonb_array_elements(public.current_site_activity_contexts()) ctx
      where ctx->>'tenant_id'=p_tenant_id::text
      and ctx->>'authorization_role' in ('tenant_admin','store_owner')) then
    raise exception 'O2O_OPERATOR_FORBIDDEN' using errcode='42501';
  end if;
  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'siteId', l.site_id, 'title', l.title, 'targetPath', l.target_path,
        'status', case when l.status='active' and l.expires_at<=now() then 'expired' else l.status end, 'expiresAt', l.expires_at,
        'createdAt', l.created_at, 'revokedAt', l.revoked_at
      ) order by l.created_at desc)
      from (select * from public.o2o_campaign_links
        where tenant_id=p_tenant_id
        order by (status='active' and expires_at>now()) desc, created_at desc limit 100) l
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.o2o_operator_issue(
  p_tenant_id uuid, p_site_id text, p_target_path text, p_title text,
  p_expires_at timestamptz default null
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_slug text;
  v_prefix text;
  v_path text;
  v_query text;
  v_fragment text;
  v_token text;
  v_link public.o2o_campaign_links%rowtype;
  v_expiry timestamptz := coalesce(p_expires_at, now()+interval '30 days');
begin
  if p_tenant_id is null or auth.uid() is null
    or not exists (select 1 from jsonb_array_elements(public.current_site_activity_contexts()) ctx
      where ctx->>'tenant_id'=p_tenant_id::text
      and ctx->>'authorization_role' in ('tenant_admin','store_owner')) then
    raise exception 'O2O_OPERATOR_FORBIDDEN' using errcode='42501';
  end if;
  select slug into v_slug from public.tenants where id=p_tenant_id;
  v_prefix := case p_site_id
    when 'mission' then '/ekodimission'
    when 'commerce' then '/cgma'
    when 'education' then '/edu'
    when 'books' then '/ekodibooks'
    when 'mall' then '/ekodimall'
    when 'civic' then '/seonammedi'
    else null end;
  if v_prefix is null or not (
    (p_site_id='mission' and v_slug='ekodimission') or
    (p_site_id='commerce' and v_slug='cgma') or
    (p_site_id='education' and v_slug in ('edu','education')) or
    (p_site_id='books' and v_slug in ('ekodibooks','books')) or
    (p_site_id='mall' and v_slug in ('ekodimall','ekodibiz')) or
    (p_site_id='civic' and v_slug='seonammedi')
  ) then
    raise exception 'O2O_SITE_TENANT_MISMATCH' using errcode='42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 90
    or p_title ~ '[[:cntrl:]]' then
    raise exception 'O2O_INVALID_TITLE' using errcode='22023';
  end if;
  if p_target_path is null or length(p_target_path) > 500
    or p_target_path !~ '^/[a-z0-9/?&=.#_-]+$'
    or position('//' in p_target_path)>0
    or position('..' in p_target_path)>0
    or length(p_target_path)-length(replace(p_target_path,'?',''))>1
    or length(p_target_path)-length(replace(p_target_path,'#',''))>1 then
    raise exception 'O2O_INVALID_TARGET' using errcode='22023';
  end if;
  v_path := split_part(split_part(p_target_path,'?',1),'#',1);
  v_query := case when position('?' in p_target_path)>0
    then split_part(split_part(p_target_path,'?',2),'#',1) else null end;
  v_fragment := case when position('#' in p_target_path)>0
    then split_part(p_target_path,'#',2) else null end;
  if not (v_path=v_prefix or v_path like v_prefix||'/%')
    or exists (select 1 from unnest(string_to_array(v_path,'/')) seg
      where seg in ('admin','api','auth','login','logout','my','account','operator',
        'manage','settings','private','internal','share','edit'))
    or (v_query is not null and v_query !~ '^(meeting|event|activity|tab|section|page|category|id)=[a-zA-Z0-9._-]{1,120}(&((meeting|event|activity|tab|section|page|category|id)=[a-zA-Z0-9._-]{1,120}))*$')
    or (v_fragment is not null and v_fragment !~ '^[a-zA-Z0-9_-]{1,70}$') then
    raise exception 'O2O_TARGET_NOT_PUBLIC' using errcode='22023';
  end if;
  if v_expiry < now()+interval '1 hour' or v_expiry>now()+interval '90 days' then
    raise exception 'O2O_INVALID_EXPIRY' using errcode='22023';
  end if;
  if (select count(*) from public.o2o_campaign_links
      where tenant_id=p_tenant_id and status='active' and expires_at>now())>=100 then
    raise exception 'O2O_ACTIVE_LINK_LIMIT' using errcode='22023';
  end if;
  v_token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.o2o_campaign_links
    (tenant_id,site_id,title,target_path,token_hash,expires_at,created_by)
  values (p_tenant_id,p_site_id,btrim(p_title),p_target_path,
    encode(extensions.digest(v_token,'sha256'),'hex'),v_expiry,auth.uid())
  returning * into v_link;
  insert into public.o2o_campaign_audit(tenant_id,link_id,action,actor_id)
  values (p_tenant_id,v_link.id,'issued',auth.uid());
  return jsonb_build_object(
    'ok',true,'id',v_link.id,'siteId',v_link.site_id,'title',v_link.title,
    'shareUrl','https://ekodi.kr/o2o/go/'||v_token,
    'expiresAt',v_link.expires_at,'targetPath',v_link.target_path
  );
end;
$$;

create or replace function public.o2o_operator_revoke(p_link_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, auth
as $$
declare v_link public.o2o_campaign_links%rowtype;
begin
  if p_link_id is null or auth.uid() is null then
    raise exception 'O2O_OPERATOR_FORBIDDEN' using errcode='42501';
  end if;
  select * into v_link from public.o2o_campaign_links where id=p_link_id for update;
  if not found or not exists (select 1 from jsonb_array_elements(public.current_site_activity_contexts()) ctx
      where ctx->>'tenant_id'=v_link.tenant_id::text
      and ctx->>'authorization_role' in ('tenant_admin','store_owner')) then
    raise exception 'O2O_OPERATOR_FORBIDDEN' using errcode='42501';
  end if;
  if v_link.status='active' then
    update public.o2o_campaign_links set status='revoked',
      revoked_by=auth.uid(), revoked_at=now() where id=p_link_id;
    insert into public.o2o_campaign_audit(tenant_id,link_id,action,actor_id)
      values (v_link.tenant_id,v_link.id,'revoked',auth.uid());
  end if;
  return jsonb_build_object('ok',true,'id',v_link.id,'status','revoked');
end;
$$;

create or replace function public.o2o_public_resolve(p_token text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_site text; v_path text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('ok',false);
  end if;
  select site_id,target_path into v_site,v_path
  from public.o2o_campaign_links
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and status='active' and expires_at>now();
  if v_site is null then return jsonb_build_object('ok',false); end if;
  -- Only public target data. No identities, raw tokens, contact data or audit records.
  return jsonb_build_object('ok',true,'site_id',v_site,'target_path',v_path);
end;
$$;

revoke all on function public.o2o_operator_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.o2o_operator_issue(uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.o2o_operator_revoke(uuid) from public,anon,authenticated;
revoke all on function public.o2o_public_resolve(text) from public,anon,authenticated;
grant execute on function public.o2o_operator_snapshot(uuid) to authenticated;
grant execute on function public.o2o_operator_issue(uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.o2o_operator_revoke(uuid) to authenticated;
grant execute on function public.o2o_public_resolve(text) to anon,authenticated;
comment on table public.o2o_campaign_links is 'Tenant-issued, revocable anonymous QR navigation only; no attendance, purchase, identity or points side effects.';
