-- Token-gated collaborative editing for public activity plans.
create table if not exists public.activity_collab_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null,
  activity_key text not null,
  draft_content jsonb not null default '{}'::jsonb,
  published_content jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  published_revision integer not null default 0 check (published_revision >= 0),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(workspace_slug, activity_key)
);
alter table public.activity_collab_documents enable row level security;
revoke all on public.activity_collab_documents from anon, authenticated;

create table if not exists public.activity_collab_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.activity_collab_documents(id) on delete cascade,
  token_hash text not null unique,
  permission text not null check (permission in ('view','edit','owner')),
  label text not null default '',
  enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.activity_collab_shares enable row level security;
revoke all on public.activity_collab_shares from anon, authenticated;

create table if not exists public.activity_collab_revisions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.activity_collab_documents(id) on delete cascade,
  revision integer not null,
  editor_name text not null default '',
  action text not null check (action in ('edit','publish','restore')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_collab_revisions_doc_rev_idx on public.activity_collab_revisions(document_id, revision desc);
alter table public.activity_collab_revisions enable row level security;
revoke all on public.activity_collab_revisions from anon, authenticated;

create or replace function public.activity_collab_share_snapshot(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_share public.activity_collab_shares%rowtype; v_doc public.activity_collab_documents%rowtype;
begin
  select * into v_share from public.activity_collab_shares
  where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') and enabled
    and (expires_at is null or expires_at > now()) limit 1;
  if not found then raise exception 'COLLAB_LINK_INVALID'; end if;
  select * into v_doc from public.activity_collab_documents where id=v_share.document_id;
  update public.activity_collab_shares set last_used_at=now() where id=v_share.id;
  return jsonb_build_object('ok',true,'workspace_slug',v_doc.workspace_slug,'activity_key',v_doc.activity_key,
    'permission',v_share.permission,'revision',v_doc.revision,'published_revision',v_doc.published_revision,
    'draft',v_doc.draft_content,'published',v_doc.published_content,'updated_at',v_doc.updated_at,'published_at',v_doc.published_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',r.revision,'editor_name',r.editor_name,'action',r.action,'created_at',r.created_at) order by r.id desc)
      from (select * from public.activity_collab_revisions where document_id=v_doc.id order by id desc limit 20) r),'[]'::jsonb));
end; $$;
revoke all on function public.activity_collab_share_snapshot(text) from public;
grant execute on function public.activity_collab_share_snapshot(text) to anon, authenticated;
comment on function public.activity_collab_share_snapshot(text) is 'Intentional token-gated public collaboration RPC. Returns only activity plan content, never participant or contact data.';

create or replace function public.activity_collab_update(p_token text,p_editor_name text,p_content jsonb,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_share public.activity_collab_shares%rowtype; v_doc public.activity_collab_documents%rowtype; v_next integer;
begin
  if p_content is null or jsonb_typeof(p_content)<>'object' then raise exception 'INVALID_CONTENT'; end if;
  if octet_length(p_content::text)>65536 then raise exception 'CONTENT_TOO_LARGE'; end if;
  select * into v_share from public.activity_collab_shares
  where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and permission in ('edit','owner') and enabled and (expires_at is null or expires_at > now()) limit 1;
  if not found then raise exception 'COLLAB_EDIT_FORBIDDEN'; end if;
  select * into v_doc from public.activity_collab_documents where id=v_share.document_id for update;
  if p_expected_revision is distinct from v_doc.revision then
    return jsonb_build_object('ok',false,'conflict',true,'revision',v_doc.revision,'draft',v_doc.draft_content);
  end if;
  v_next:=v_doc.revision+1;
  update public.activity_collab_documents set draft_content=p_content,revision=v_next,updated_at=now() where id=v_doc.id;
  insert into public.activity_collab_revisions(document_id,revision,editor_name,action,content)
  values(v_doc.id,v_next,left(trim(coalesce(p_editor_name,'')),80),'edit',p_content);
  return jsonb_build_object('ok',true,'revision',v_next,'updated_at',now());
end; $$;
revoke all on function public.activity_collab_update(text,text,jsonb,integer) from public;
grant execute on function public.activity_collab_update(text,text,jsonb,integer) to anon, authenticated;
comment on function public.activity_collab_update(text,text,jsonb,integer) is 'Intentional token-gated public collaboration RPC with optimistic revision checks. No participant data access.';

create or replace function public.activity_collab_publish(p_token text,p_editor_name text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_share public.activity_collab_shares%rowtype; v_doc public.activity_collab_documents%rowtype;
begin
  select * into v_share from public.activity_collab_shares
  where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and permission='owner' and enabled and (expires_at is null or expires_at > now()) limit 1;
  if not found then raise exception 'COLLAB_PUBLISH_FORBIDDEN'; end if;
  select * into v_doc from public.activity_collab_documents where id=v_share.document_id for update;
  if p_expected_revision is distinct from v_doc.revision then
    return jsonb_build_object('ok',false,'conflict',true,'revision',v_doc.revision,'draft',v_doc.draft_content);
  end if;
  update public.activity_collab_documents set published_content=v_doc.draft_content,published_revision=v_doc.revision,published_at=now(),updated_at=now() where id=v_doc.id;
  insert into public.activity_collab_revisions(document_id,revision,editor_name,action,content)
  values(v_doc.id,v_doc.revision,left(trim(coalesce(p_editor_name,'')),80),'publish',v_doc.draft_content);
  return jsonb_build_object('ok',true,'revision',v_doc.revision,'published_at',now());
end; $$;
revoke all on function public.activity_collab_publish(text,text,integer) from public;
grant execute on function public.activity_collab_publish(text,text,integer) to anon, authenticated;
comment on function public.activity_collab_publish(text,text,integer) is 'Intentional owner-token publish RPC. Owner token is separate from shared editor token.';

create or replace function public.activity_collab_public_snapshot(p_workspace_slug text,p_activity_key text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select case when d.published_revision > 0 then jsonb_build_object('ok',true,'workspace_slug',d.workspace_slug,'activity_key',d.activity_key,'revision',d.published_revision,'content',d.published_content,'published_at',d.published_at) else jsonb_build_object('ok',false) end
  from public.activity_collab_documents d
  where d.workspace_slug=lower(trim(p_workspace_slug)) and d.activity_key=p_activity_key limit 1;
$$;
revoke all on function public.activity_collab_public_snapshot(text,text) from public;
grant execute on function public.activity_collab_public_snapshot(text,text) to anon, authenticated;
comment on function public.activity_collab_public_snapshot(text,text) is 'Intentional public read RPC for published activity plan content only.';
