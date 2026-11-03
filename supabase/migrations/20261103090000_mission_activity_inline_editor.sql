
-- Public-facing basic activity copy, independent of participant/payment truth.
-- A public activity page is static by default; approved edits override that copy.
create table if not exists public.mission_activity_page_edits (
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  activity_key text not null check (activity_key ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  summary text not null default '' check (char_length(summary) <= 1500),
  venue text not null default '' check (char_length(venue) <= 180),
  event_date date,
  event_time time without time zone,
  revision bigint not null default 1 check (revision >= 1),
  modified_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_tenant_id, activity_key),
  check (event_time is null or event_date is not null)
);
alter table public.mission_activity_page_edits enable row level security;
revoke all on table public.mission_activity_page_edits from public, anon, authenticated, service_role;

create table if not exists public.mission_activity_page_edit_audit (
  id bigint generated always as identity primary key,
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  activity_key text not null,
  editor_id uuid references auth.users(id) on delete set null,
  old_content jsonb,
  new_content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists mission_activity_page_edit_audit_tenant_idx
  on public.mission_activity_page_edit_audit(workspace_tenant_id,activity_key,created_at desc);
alter table public.mission_activity_page_edit_audit enable row level security;
revoke all on table public.mission_activity_page_edit_audit from public, anon, authenticated, service_role;

-- Whitelist one public workspace; project no editor, audit, participation or payment fields.
create or replace function public.mission_activity_page_public_snapshot(p_workspace_slug text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare v_tenant_id uuid;
begin
  if p_workspace_slug is distinct from 'ekodimission' then
    return pg_catalog.jsonb_build_object('ok',false,'items','[]'::jsonb);
  end if;
  select t.id into v_tenant_id from public.tenants t where t.slug='ekodimission' and t.status='active';
  if v_tenant_id is null then
    return pg_catalog.jsonb_build_object('ok',false,'items','[]'::jsonb);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,
    'items',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key',e.activity_key,'title',e.title,'summary',e.summary,
        'venue',e.venue,'date',e.event_date,'time',to_char(e.event_time,'HH24:MI'),
        'revision',e.revision,'updatedAt',e.updated_at
      ) order by e.activity_key)
      from public.mission_activity_page_edits e
      where e.workspace_tenant_id=v_tenant_id
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.mission_activity_page_public_snapshot(text) from public, anon, authenticated;
grant execute on function public.mission_activity_page_public_snapshot(text) to anon, authenticated, service_role;

create or replace function public.mission_activity_page_update(
  p_workspace_slug text,
  p_activity_key text,
  p_title text,
  p_summary text,
  p_venue text,
  p_event_date date,
  p_event_time time without time zone,
  p_expected_revision bigint
) returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_existing public.mission_activity_page_edits%rowtype;
  v_saved public.mission_activity_page_edits%rowtype;
  v_before jsonb;
begin
  if auth.uid() is null or p_workspace_slug is distinct from 'ekodimission' then
    raise exception 'ACTIVITY_EDIT_FORBIDDEN' using errcode='42501';
  end if;
  select t.id into v_tenant_id
  from public.tenants t
  where t.slug='ekodimission' and t.status='active';
  if v_tenant_id is null or not public.activity_is_workspace_operator(v_tenant_id) then
    raise exception 'ACTIVITY_EDIT_FORBIDDEN' using errcode='42501';
  end if;

  if p_activity_key is null or p_activity_key !~ '^[a-z0-9][a-z0-9-]{2,79}$'
    or p_title is null or char_length(btrim(p_title)) not between 1 and 140
    or char_length(coalesce(p_summary,'')) > 1500
    or char_length(coalesce(p_venue,'')) > 180
    or p_expected_revision is null or p_expected_revision < 0
    or (p_event_time is not null and p_event_date is null)
    or p_event_date < date '2000-01-01' or p_event_date > date '2100-12-31'
    or p_title ~ '[[:cntrl:]]' or replace(replace(coalesce(p_summary,''),chr(10),''),chr(13),'') ~ '[[:cntrl:]]'
    or coalesce(p_venue,'') ~ '[[:cntrl:]]'
  then
    raise exception 'ACTIVITY_EDIT_INVALID' using errcode='22023';
  end if;
  -- Existing title/summary/venue are public editorial copy only.
  -- The registration status, payment ledger, attendee data and activity key are immutable here.
  select * into v_existing from public.mission_activity_page_edits
  where workspace_tenant_id=v_tenant_id and activity_key=p_activity_key
  for update;
  if found then
    if v_existing.revision<>p_expected_revision then
      raise exception 'ACTIVITY_EDIT_CONFLICT' using errcode='40001';
    end if;
    v_before:=pg_catalog.to_jsonb(v_existing);
    update public.mission_activity_page_edits
    set title=btrim(p_title),summary=coalesce(p_summary,''),venue=coalesce(p_venue,''),
      event_date=p_event_date,event_time=p_event_time,
      revision=revision+1,modified_by=auth.uid(),updated_at=now()
    where workspace_tenant_id=v_tenant_id and activity_key=p_activity_key
    returning * into v_saved;
  else
    if p_expected_revision<>0 then
      raise exception 'ACTIVITY_EDIT_CONFLICT' using errcode='40001';
    end if;
    insert into public.mission_activity_page_edits
      (workspace_tenant_id,activity_key,title,summary,venue,event_date,event_time,modified_by)
    values (v_tenant_id,p_activity_key,btrim(p_title),coalesce(p_summary,''),coalesce(p_venue,''),
      p_event_date,p_event_time,auth.uid())
    returning * into v_saved;
  end if;

  insert into public.mission_activity_page_edit_audit
    (workspace_tenant_id,activity_key,editor_id,old_content,new_content)
  values(v_tenant_id,p_activity_key,auth.uid(),v_before,pg_catalog.to_jsonb(v_saved));

  return pg_catalog.jsonb_build_object(
    'ok',true,'item',pg_catalog.jsonb_build_object(
      'key',v_saved.activity_key,'title',v_saved.title,'summary',v_saved.summary,
      'venue',v_saved.venue,'date',v_saved.event_date,
      'time',to_char(v_saved.event_time,'HH24:MI'),
      'revision',v_saved.revision,'updatedAt',v_saved.updated_at
    )
  );
end;
$$;
revoke all on function public.mission_activity_page_update(text,text,text,text,text,date,time without time zone,bigint)
  from public, anon, authenticated;
grant execute on function public.mission_activity_page_update(text,text,text,text,text,date,time without time zone,bigint)
  to authenticated, service_role;
