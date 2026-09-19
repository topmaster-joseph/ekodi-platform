-- EKODI common Activity + Person participation ledger.
-- Additive migration: keeps the existing Mission event/application tables as a compatibility layer.

-- 1) EKODI Mission becomes a first-class tenant/workspace so tenant-local authorization
-- can be resolved through current_site_activity_contexts().
insert into public.tenants (slug, name, status, kind, settings)
values (
  'ekodimission',
  '에코디선교회',
  'active',
  'mission',
  jsonb_build_object(
    'ownership','ekodi',
    'operating_model','customer-site',
    'site_key','mission',
    'canonical_path','/ekodimission',
    'default_activity_role','mission_operator',
    'default_activity_role_label','선교회 운영자'
  )
)
on conflict (slug) do update
set name=excluded.name,
    status='active',
    kind=excluded.kind,
    settings=coalesce(public.tenants.settings,'{}'::jsonb) || excluded.settings;

-- Keep platform-global authority distinct from Mission tenant-local authority.
with mission_tenant as (
  select id from public.tenants where slug='ekodimission'
), admin_source as (
  select distinct lower(email) as email
  from public.site_access_registry
  where site_key='admin'
    and role='platform_admin'::public.app_role
    and status='active'
    and source='existing_platform_admin'
)
insert into public.site_access_registry
  (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
select
  a.email,
  'mission',
  m.id,
  'tenant_admin'::public.app_role,
  'active',
  'owned_site_local_role',
  'Local activity role: mission_operator (선교회 운영자)',
  'standard',
  now(),
  now()
from admin_source a
cross join mission_tenant m
on conflict (email,site_key,tenant_id,role) do update
set status='active',
    source=excluded.source,
    note=excluded.note,
    plan=excluded.plan,
    updated_at=now();

-- 2) Person remains public.people. Contact identifiers are private and separate
-- from login identities so non-login participants can be deduplicated safely.
create table if not exists public.person_contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('phone','email')),
  value text not null,
  normalized_value text not null,
  is_primary boolean not null default true,
  verified boolean not null default false,
  consent_basis text not null default 'activity_registration',
  source_channel text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(normalized_value) > 0)
);
create unique index if not exists person_contacts_kind_normalized_uidx
  on public.person_contacts(kind,normalized_value);
create index if not exists person_contacts_person_idx
  on public.person_contacts(person_id,kind,is_primary desc);

alter table public.person_contacts enable row level security;
revoke all on table public.person_contacts from anon, authenticated;

-- 3) Shared Activity ledger.
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_tenant_id uuid not null references public.tenants(id) on delete restrict,
  activity_key text not null,
  activity_type text not null default 'event',
  title text not null,
  summary text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  venue text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft'
    check (status in ('draft','review','published','closed','archived')),
  visibility text not null default 'private'
    check (visibility in ('private','workspace','public')),
  registration_open boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_tenant_id,activity_key)
);
create index if not exists activities_workspace_starts_idx
  on public.activities(workspace_tenant_id,starts_at desc);

alter table public.activities enable row level security;
revoke all on table public.activities from anon, authenticated;

create table if not exists public.activity_participations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  source_channel text not null default 'website'
    check (source_channel in ('website','qr','google_form','admin','import','api')),
  source_ref text not null default '',
  status text not null default 'applied'
    check (status in ('applied','waitlist','confirmed','attended','no_show','cancelled')),
  participant_role text not null default 'participant',
  party_size integer not null default 1 check (party_size between 1 and 20),
  companions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(companions)='array'),
  language text not null default 'ko',
  dietary_notes text not null default '',
  support_notes text not null default '',
  media_consent text not null default 'confirm_on_site'
    check (media_consent in ('yes','no','confirm_on_site')),
  privacy_consent boolean not null default false,
  follow_up_status text not null default 'none'
    check (follow_up_status in ('none','pending','contacted','closed')),
  follow_up_note text not null default '',
  submitted_at timestamptz not null default now(),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (activity_id,person_id)
);
create index if not exists activity_participations_activity_status_idx
  on public.activity_participations(activity_id,status,submitted_at);
create index if not exists activity_participations_person_idx
  on public.activity_participations(person_id,submitted_at desc);

alter table public.activity_participations enable row level security;
revoke all on table public.activity_participations from anon, authenticated;

-- Relationship is deliberately separate. Participation never creates membership,
-- church membership, donor, volunteer, partner, or staff status automatically.
create table if not exists public.person_workspace_relationships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  workspace_tenant_id uuid not null references public.tenants(id) on delete cascade,
  relationship_type text not null
    check (relationship_type in ('member','church_member','donor','volunteer','partner','staff')),
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id,workspace_tenant_id,relationship_type)
);
alter table public.person_workspace_relationships enable row level security;
revoke all on table public.person_workspace_relationships from anon, authenticated;

create table if not exists public.activity_participation_audit (
  id bigint generated always as identity primary key,
  activity_id uuid not null references public.activities(id) on delete cascade,
  participation_id uuid references public.activity_participations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  source_channel text not null default 'api',
  created_at timestamptz not null default now()
);
create index if not exists activity_participation_audit_activity_idx
  on public.activity_participation_audit(activity_id,created_at desc);
alter table public.activity_participation_audit enable row level security;
revoke all on table public.activity_participation_audit from anon, authenticated;

-- Compatibility pointers from the legacy Mission projection into the canonical ledger.
alter table public.mission_event_applications
  add column if not exists person_id uuid references public.people(id) on delete set null,
  add column if not exists activity_participation_id uuid references public.activity_participations(id) on delete set null;

create index if not exists mission_event_applications_person_idx
  on public.mission_event_applications(person_id);
create index if not exists mission_event_applications_participation_idx
  on public.mission_event_applications(activity_participation_id);

-- 4) Authorization helpers.
create or replace function public.activity_is_workspace_operator(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from jsonb_array_elements(public.current_site_activity_contexts()) as ctx
      where nullif(ctx->>'tenant_id','')::uuid=p_tenant_id
        and coalesce(ctx->>'authorization_role','') in ('tenant_admin','store_owner')
    );
$$;
revoke all on function public.activity_is_workspace_operator(uuid) from public;
grant execute on function public.activity_is_workspace_operator(uuid) to authenticated;

create or replace function public.activity_record_participation_audit(
  p_activity_id uuid,
  p_participation_id uuid,
  p_action text,
  p_before jsonb,
  p_after jsonb,
  p_source_channel text
) returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  insert into public.activity_participation_audit(
    activity_id,participation_id,actor_user_id,action,before_state,after_state,source_channel
  ) values (
    p_activity_id,p_participation_id,auth.uid(),left(coalesce(p_action,'unknown'),80),
    p_before,p_after,left(coalesce(p_source_channel,'api'),40)
  );
end;
$$;
revoke all on function public.activity_record_participation_audit(uuid,uuid,text,jsonb,jsonb,text) from public;

-- Resolve a Person from private contact identifiers. Conflicting phone/email matches
-- are rejected rather than silently merging two people.
create or replace function public.activity_resolve_person(
  p_name text,
  p_phone text default '',
  p_email text default '',
  p_source_channel text default 'api'
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_name text:=left(trim(coalesce(p_name,'')),80);
  v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_phone_person uuid;
  v_email_person uuid;
  v_person uuid;
begin
  if length(v_name)<1 then raise exception 'INVALID_NAME'; end if;
  if v_phone<>'' and (length(v_phone)<8 or length(v_phone)>20) then raise exception 'INVALID_PHONE'; end if;
  if length(v_email)>254 or (v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'INVALID_EMAIL';
  end if;
  if v_phone='' and v_email='' then raise exception 'CONTACT_REQUIRED'; end if;

  -- Serialize equal identifiers so two concurrent submissions cannot create two People.
  if v_phone<>'' then perform pg_advisory_xact_lock(hashtextextended('activity-phone:'||v_phone,0)); end if;
  if v_email<>'' then perform pg_advisory_xact_lock(hashtextextended('activity-email:'||v_email,0)); end if;

  if v_phone<>'' then
    select person_id into v_phone_person
    from public.person_contacts
    where kind='phone' and normalized_value=v_phone
    limit 1;
  end if;
  if v_email<>'' then
    select person_id into v_email_person
    from public.person_contacts
    where kind='email' and normalized_value=v_email
    limit 1;
  end if;

  if v_phone_person is not null and v_email_person is not null and v_phone_person<>v_email_person then
    raise exception 'CONTACT_IDENTITY_CONFLICT';
  end if;

  v_person:=coalesce(v_phone_person,v_email_person);
  if v_person is null then
    insert into public.people(display_name,status)
    values (v_name,'active')
    returning id into v_person;
  else
    update public.people
    set display_name=case when coalesce(trim(display_name),'')='' then v_name else display_name end,
        updated_at=now()
    where id=v_person;
  end if;

  if v_phone<>'' then
    insert into public.person_contacts(person_id,kind,value,normalized_value,is_primary,consent_basis,source_channel)
    values (v_person,'phone',left(trim(p_phone),40),v_phone,true,'activity_registration',left(p_source_channel,40))
    on conflict (kind,normalized_value) do update
      set value=excluded.value,updated_at=now();
  end if;
  if v_email<>'' then
    insert into public.person_contacts(person_id,kind,value,normalized_value,is_primary,consent_basis,source_channel)
    values (v_person,'email',left(trim(p_email),254),v_email,true,'activity_registration',left(p_source_channel,40))
    on conflict (kind,normalized_value) do update
      set value=excluded.value,updated_at=now();
  end if;

  return v_person;
end;
$$;
revoke all on function public.activity_resolve_person(text,text,text,text) from public;

-- 5) Public/adapter entry point. Website, QR, Google Form adapters, imports and APIs
-- converge on the same Person + Activity participation ledger.
create or replace function public.activity_submit_participation(
  p_workspace_slug text,
  p_activity_key text,
  p_name text,
  p_phone text,
  p_email text default '',
  p_party_size integer default 1,
  p_language text default 'ko',
  p_dietary_notes text default '',
  p_support_notes text default '',
  p_media_consent text default 'confirm_on_site',
  p_privacy_consent boolean default false,
  p_source_channel text default 'website',
  p_source_ref text default '',
  p_companions jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_person uuid;
  v_participation public.activity_participations%rowtype;
  v_status text:='applied';
  v_used integer:=0;
  v_source text:=lower(trim(coalesce(p_source_channel,'website')));
begin
  if not coalesce(p_privacy_consent,false) then raise exception 'PRIVACY_CONSENT_REQUIRED'; end if;
  if coalesce(p_party_size,0)<1 or p_party_size>20 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if coalesce(jsonb_typeof(p_companions),'')<>'array' then raise exception 'INVALID_COMPANIONS'; end if;
  if v_source not in ('website','qr','google_form','admin','import','api') then raise exception 'INVALID_SOURCE_CHANNEL'; end if;
  if coalesce(p_media_consent,'confirm_on_site') not in ('yes','no','confirm_on_site') then raise exception 'INVALID_MEDIA_CONSENT'; end if;

  select a.* into v_activity
  from public.activities a
  join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug))
    and a.activity_key=p_activity_key
  for update;

  if not found
     or v_activity.status<>'published'
     or v_activity.visibility<>'public'
     or not v_activity.registration_open then
    raise exception 'APPLICATION_CLOSED';
  end if;

  if v_activity.capacity is not null then
    select coalesce(sum(p.party_size),0)::integer into v_used
    from public.activity_participations p
    where p.activity_id=v_activity.id
      and p.status in ('applied','confirmed','attended');
    if v_used+p_party_size>v_activity.capacity then v_status:='waitlist'; end if;
  end if;

  v_person:=public.activity_resolve_person(p_name,p_phone,p_email,v_source);

  insert into public.activity_participations(
    activity_id,person_id,source_channel,source_ref,status,participant_role,party_size,
    companions,language,dietary_notes,support_notes,media_consent,privacy_consent,
    submitted_at,updated_at
  ) values (
    v_activity.id,v_person,v_source,left(coalesce(p_source_ref,''),300),v_status,'participant',
    p_party_size,p_companions,left(trim(coalesce(p_language,'ko')),24),
    left(trim(coalesce(p_dietary_notes,'')),500),
    left(trim(coalesce(p_support_notes,'')),2000),
    p_media_consent,true,now(),now()
  )
  on conflict (activity_id,person_id) do update
  set source_channel=excluded.source_channel,
      source_ref=excluded.source_ref,
      status=case
        when activity_participations.status in ('cancelled','no_show') then excluded.status
        else activity_participations.status
      end,
      party_size=excluded.party_size,
      companions=excluded.companions,
      language=excluded.language,
      dietary_notes=excluded.dietary_notes,
      support_notes=excluded.support_notes,
      media_consent=excluded.media_consent,
      privacy_consent=true,
      updated_at=now()
  returning * into v_participation;

  perform public.activity_record_participation_audit(
    v_activity.id,v_participation.id,'submit_or_update',null,to_jsonb(v_participation),v_source
  );

  return jsonb_build_object(
    'ok',true,
    'activity_id',v_activity.id,
    'person_id',v_person,
    'participation_id',v_participation.id,
    'status',v_participation.status
  );
end;
$$;
revoke all on function public.activity_submit_participation(text,text,text,text,text,integer,text,text,text,text,boolean,text,text,jsonb) from public;
grant execute on function public.activity_submit_participation(text,text,text,text,text,integer,text,text,text,text,boolean,text,text,jsonb) to anon, authenticated;

-- 6) Tenant-admin read model.
create or replace function public.activity_admin_snapshot(
  p_workspace_slug text,
  p_activity_key text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
begin
  select * into v_tenant from public.tenants where slug=lower(trim(p_workspace_slug));
  if not found or not public.activity_is_workspace_operator(v_tenant.id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'workspace',jsonb_build_object('tenant_id',v_tenant.id,'slug',v_tenant.slug,'name',v_tenant.name),
    'summary',jsonb_build_object(
      'total',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and (p_activity_key is null or a.activity_key=p_activity_key)),
      'applied',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='applied' and (p_activity_key is null or a.activity_key=p_activity_key)),
      'waitlist',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='waitlist' and (p_activity_key is null or a.activity_key=p_activity_key)),
      'confirmed',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='confirmed' and (p_activity_key is null or a.activity_key=p_activity_key)),
      'attended',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='attended' and (p_activity_key is null or a.activity_key=p_activity_key)),
      'no_show',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='no_show' and (p_activity_key is null or a.activity_key=p_activity_key)),
      'cancelled',(select count(*) from public.activity_participations p join public.activities a on a.id=p.activity_id where a.workspace_tenant_id=v_tenant.id and p.status='cancelled' and (p_activity_key is null or a.activity_key=p_activity_key))
    ),
    'activities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'activity_key',a.activity_key,'activity_type',a.activity_type,'title',a.title,
        'starts_at',a.starts_at,'ends_at',a.ends_at,'venue',a.venue,'capacity',a.capacity,
        'status',a.status,'visibility',a.visibility,'registration_open',a.registration_open
      ) order by a.starts_at desc nulls last,a.created_at desc)
      from public.activities a
      where a.workspace_tenant_id=v_tenant.id
        and (p_activity_key is null or a.activity_key=p_activity_key)
    ),'[]'::jsonb),
    'participants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'participation_id',p.id,
        'activity_id',a.id,
        'activity_key',a.activity_key,
        'activity_title',a.title,
        'person_id',pe.id,
        'ekodi_id',pe.ekodi_id,
        'name',pe.display_name,
        'phone',(select c.value from public.person_contacts c where c.person_id=pe.id and c.kind='phone' order by c.is_primary desc,c.created_at limit 1),
        'email',(select c.value from public.person_contacts c where c.person_id=pe.id and c.kind='email' order by c.is_primary desc,c.created_at limit 1),
        'status',p.status,
        'participant_role',p.participant_role,
        'party_size',p.party_size,
        'companions',p.companions,
        'language',p.language,
        'dietary_notes',p.dietary_notes,
        'support_notes',p.support_notes,
        'media_consent',p.media_consent,
        'follow_up_status',p.follow_up_status,
        'follow_up_note',p.follow_up_note,
        'source_channel',p.source_channel,
        'source_ref',p.source_ref,
        'submitted_at',p.submitted_at,
        'checked_in_at',p.checked_in_at,
        'relationships',coalesce((
          select jsonb_agg(r.relationship_type order by r.relationship_type)
          from public.person_workspace_relationships r
          where r.person_id=pe.id
            and r.workspace_tenant_id=v_tenant.id
            and r.status='active'
        ),'[]'::jsonb)
      ) order by p.submitted_at desc)
      from public.activity_participations p
      join public.activities a on a.id=p.activity_id
      join public.people pe on pe.id=p.person_id
      where a.workspace_tenant_id=v_tenant.id
        and (p_activity_key is null or a.activity_key=p_activity_key)
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.activity_admin_snapshot(text,text) from public;
grant execute on function public.activity_admin_snapshot(text,text) to authenticated;

create or replace function public.activity_admin_add_participant(
  p_workspace_slug text,
  p_activity_key text,
  p_name text,
  p_phone text,
  p_email text default '',
  p_party_size integer default 1,
  p_status text default 'applied',
  p_participant_role text default 'participant',
  p_language text default 'ko',
  p_companions jsonb default '[]'::jsonb,
  p_support_notes text default '',
  p_follow_up_status text default 'none',
  p_follow_up_note text default '',
  p_source_channel text default 'admin',
  p_privacy_consent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_person uuid;
  v_before jsonb;
  v_row public.activity_participations%rowtype;
  v_source text:=lower(trim(coalesce(p_source_channel,'admin')));
begin
  select a.* into v_activity
  from public.activities a
  join public.tenants t on t.id=a.workspace_tenant_id
  where t.slug=lower(trim(p_workspace_slug)) and a.activity_key=p_activity_key;

  if not found or not public.activity_is_workspace_operator(v_activity.workspace_tenant_id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if not coalesce(p_privacy_consent,false) then raise exception 'PRIVACY_CONSENT_REQUIRED'; end if;
  if p_status not in ('applied','waitlist','confirmed','attended','no_show','cancelled') then raise exception 'INVALID_STATUS'; end if;
  if p_follow_up_status not in ('none','pending','contacted','closed') then raise exception 'INVALID_FOLLOW_UP_STATUS'; end if;
  if p_party_size<1 or p_party_size>20 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if coalesce(jsonb_typeof(p_companions),'')<>'array' then raise exception 'INVALID_COMPANIONS'; end if;
  if v_source not in ('website','qr','google_form','admin','import','api') then raise exception 'INVALID_SOURCE_CHANNEL'; end if;

  v_person:=public.activity_resolve_person(p_name,p_phone,p_email,v_source);
  select to_jsonb(p) into v_before
  from public.activity_participations p
  where p.activity_id=v_activity.id and p.person_id=v_person;

  insert into public.activity_participations(
    activity_id,person_id,source_channel,status,participant_role,party_size,companions,
    language,support_notes,privacy_consent,follow_up_status,follow_up_note,
    checked_in_at,cancelled_at,submitted_at,updated_at
  ) values (
    v_activity.id,v_person,v_source,p_status,left(trim(coalesce(p_participant_role,'participant')),80),
    p_party_size,p_companions,left(trim(coalesce(p_language,'ko')),24),
    left(trim(coalesce(p_support_notes,'')),2000),true,p_follow_up_status,
    left(trim(coalesce(p_follow_up_note,'')),2000),
    case when p_status='attended' then now() else null end,
    case when p_status='cancelled' then now() else null end,
    now(),now()
  )
  on conflict(activity_id,person_id) do update
  set source_channel=excluded.source_channel,
      status=excluded.status,
      participant_role=excluded.participant_role,
      party_size=excluded.party_size,
      companions=excluded.companions,
      language=excluded.language,
      support_notes=excluded.support_notes,
      follow_up_status=excluded.follow_up_status,
      follow_up_note=excluded.follow_up_note,
      checked_in_at=case when excluded.status='attended' then coalesce(activity_participations.checked_in_at,now()) else activity_participations.checked_in_at end,
      cancelled_at=case when excluded.status='cancelled' then coalesce(activity_participations.cancelled_at,now()) else activity_participations.cancelled_at end,
      updated_at=now()
  returning * into v_row;

  perform public.activity_record_participation_audit(
    v_activity.id,v_row.id,'admin_add_or_upsert',v_before,to_jsonb(v_row),v_source
  );
  return jsonb_build_object('ok',true,'person_id',v_person,'participation_id',v_row.id,'status',v_row.status);
end;
$$;
revoke all on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) from public;
grant execute on function public.activity_admin_add_participant(text,text,text,text,text,integer,text,text,text,jsonb,text,text,text,text,boolean) to authenticated;

create or replace function public.activity_admin_update_participation(
  p_participation_id uuid,
  p_status text default null,
  p_participant_role text default null,
  p_party_size integer default null,
  p_companions jsonb default null,
  p_support_notes text default null,
  p_follow_up_status text default null,
  p_follow_up_note text default null,
  p_media_consent text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_activity public.activities%rowtype;
  v_before public.activity_participations%rowtype;
  v_after public.activity_participations%rowtype;
begin
  select p.* into v_before
  from public.activity_participations p
  where p.id=p_participation_id;
  if not found then raise exception 'PARTICIPATION_NOT_FOUND'; end if;

  select * into v_activity from public.activities where id=v_before.activity_id;
  if not public.activity_is_workspace_operator(v_activity.workspace_tenant_id) then
    raise exception 'ACTIVITY_ADMIN_FORBIDDEN';
  end if;
  if p_status is not null and p_status not in ('applied','waitlist','confirmed','attended','no_show','cancelled') then raise exception 'INVALID_STATUS'; end if;
  if p_follow_up_status is not null and p_follow_up_status not in ('none','pending','contacted','closed') then raise exception 'INVALID_FOLLOW_UP_STATUS'; end if;
  if p_media_consent is not null and p_media_consent not in ('yes','no','confirm_on_site') then raise exception 'INVALID_MEDIA_CONSENT'; end if;
  if p_party_size is not null and (p_party_size<1 or p_party_size>20) then raise exception 'INVALID_PARTY_SIZE'; end if;
  if p_companions is not null and coalesce(jsonb_typeof(p_companions),'')<>'array' then raise exception 'INVALID_COMPANIONS'; end if;

  update public.activity_participations
  set status=coalesce(p_status,status),
      participant_role=coalesce(left(trim(p_participant_role),80),participant_role),
      party_size=coalesce(p_party_size,party_size),
      companions=coalesce(p_companions,companions),
      support_notes=coalesce(left(trim(p_support_notes),2000),support_notes),
      follow_up_status=coalesce(p_follow_up_status,follow_up_status),
      follow_up_note=coalesce(left(trim(p_follow_up_note),2000),follow_up_note),
      media_consent=coalesce(p_media_consent,media_consent),
      checked_in_at=case
        when p_status='attended' then coalesce(checked_in_at,now())
        else checked_in_at
      end,
      cancelled_at=case
        when p_status='cancelled' then coalesce(cancelled_at,now())
        else cancelled_at
      end,
      updated_at=now()
  where id=p_participation_id
  returning * into v_after;

  perform public.activity_record_participation_audit(
    v_activity.id,v_after.id,'admin_update',to_jsonb(v_before),to_jsonb(v_after),'admin'
  );
  return jsonb_build_object('ok',true,'participation_id',v_after.id,'status',v_after.status,'checked_in_at',v_after.checked_in_at);
end;
$$;
revoke all on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) from public;
grant execute on function public.activity_admin_update_participation(uuid,text,text,integer,jsonb,text,text,text,text) to authenticated;

-- 7) Promote the existing Mission event and existing applicants into the canonical ledger.
with mission_tenant as (
  select id from public.tenants where slug='ekodimission'
)
insert into public.activities(
  workspace_tenant_id,activity_key,activity_type,title,starts_at,ends_at,venue,
  status,visibility,registration_open,metadata,created_at,updated_at
)
select
  mt.id,me.event_key,'event',me.title,me.starts_at,me.ends_at,me.venue,
  case me.status when 'published' then 'published' when 'closed' then 'closed' else 'review' end,
  case me.status when 'published' then 'public' else 'private' end,
  me.applications_open,
  jsonb_build_object('compatibility_source','mission_events'),
  me.created_at,now()
from public.mission_events me
cross join mission_tenant mt
on conflict(workspace_tenant_id,activity_key) do update
set title=excluded.title,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    venue=excluded.venue,
    status=excluded.status,
    visibility=excluded.visibility,
    registration_open=excluded.registration_open,
    updated_at=now();

do $$
declare
  r public.mission_event_applications%rowtype;
  v_activity uuid;
  v_person uuid;
  v_participation uuid;
  v_status text;
begin
  for r in select * from public.mission_event_applications order by submitted_at
  loop
    select a.id into v_activity
    from public.activities a
    join public.tenants t on t.id=a.workspace_tenant_id
    where t.slug='ekodimission' and a.activity_key=r.event_key;

    if v_activity is null then continue; end if;
    v_person:=public.activity_resolve_person(r.name,r.phone,r.email,'import');
    v_status:=case r.status
      when 'confirmed' then 'confirmed'
      when 'cancelled' then 'cancelled'
      when 'attended' then 'attended'
      else 'applied'
    end;

    insert into public.activity_participations(
      activity_id,person_id,source_channel,status,participant_role,party_size,language,
      dietary_notes,support_notes,media_consent,privacy_consent,submitted_at,
      checked_in_at,cancelled_at,updated_at
    ) values (
      v_activity,v_person,'import',v_status,'participant',r.party_size,r.language,
      r.dietary,r.note,case when r.photo_consent then 'yes' else 'no' end,
      r.privacy_consent,r.submitted_at,
      case when v_status='attended' then coalesce(r.updated_at,r.submitted_at) else null end,
      case when v_status='cancelled' then coalesce(r.updated_at,r.submitted_at) else null end,
      r.updated_at
    )
    on conflict(activity_id,person_id) do update
    set party_size=excluded.party_size,
        language=excluded.language,
        dietary_notes=excluded.dietary_notes,
        support_notes=excluded.support_notes,
        media_consent=excluded.media_consent,
        privacy_consent=excluded.privacy_consent,
        updated_at=greatest(public.activity_participations.updated_at,excluded.updated_at)
    returning id into v_participation;

    update public.mission_event_applications
    set person_id=v_person,activity_participation_id=v_participation
    where id=r.id;

    perform public.activity_record_participation_audit(
      v_activity,v_participation,'compatibility_backfill',null,
      jsonb_build_object('legacy_application_id',r.id,'status',v_status),'import'
    );
  end loop;
end
$$;

-- 8) Keep the existing Mission RPC/API stable, but make Activity+Person the canonical write.
create or replace function public.mission_submit_event_application(
  p_event_key text,
  p_name text,
  p_phone text,
  p_email text default '',
  p_party_size integer default 1,
  p_language text default 'ko',
  p_dietary text default '',
  p_note text default '',
  p_photo_consent boolean default false,
  p_privacy_consent boolean default false,
  p_website text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_event public.mission_events%rowtype;
  v_phone text;
  v_id uuid;
  v_result jsonb;
  v_person uuid;
  v_participation uuid;
  v_now timestamptz:=now();
begin
  if length(trim(coalesce(p_website,'')))>0 then
    return jsonb_build_object('ok',true,'message','신청이 접수되었습니다.');
  end if;
  if coalesce(p_event_key,'') !~ '^[0-9]{6}-[a-z0-9][a-z0-9-]{2,79}$' then raise exception 'INVALID_EVENT'; end if;
  select * into v_event from public.mission_events where event_key=p_event_key;
  if not found or not v_event.applications_open or v_event.status='closed' then raise exception 'APPLICATION_CLOSED'; end if;
  if not coalesce(p_privacy_consent,false) then raise exception 'PRIVACY_CONSENT_REQUIRED'; end if;

  v_result:=public.activity_submit_participation(
    'ekodimission',p_event_key,p_name,p_phone,p_email,p_party_size,p_language,p_dietary,p_note,
    case when p_photo_consent then 'yes' else 'no' end,true,'website','mission_first_party','[]'::jsonb
  );
  v_person:=(v_result->>'person_id')::uuid;
  v_participation:=(v_result->>'participation_id')::uuid;
  v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');

  insert into public.mission_event_applications(
    event_key,name,phone,phone_normalized,email,party_size,language,dietary,note,
    photo_consent,privacy_consent,status,submitted_at,updated_at,person_id,activity_participation_id
  ) values (
    p_event_key,left(trim(p_name),80),left(trim(p_phone),40),v_phone,left(trim(coalesce(p_email,'')),254),
    p_party_size,left(trim(coalesce(p_language,'ko')),24),left(trim(coalesce(p_dietary,'')),500),
    left(trim(coalesce(p_note,'')),2000),coalesce(p_photo_consent,false),true,
    case coalesce(v_result->>'status','applied')
      when 'confirmed' then 'confirmed'
      when 'attended' then 'attended'
      when 'cancelled' then 'cancelled'
      else 'received'
    end,
    v_now,v_now,v_person,v_participation
  )
  on conflict(event_key,phone_normalized) do update
  set name=excluded.name,
      phone=excluded.phone,
      email=excluded.email,
      party_size=excluded.party_size,
      language=excluded.language,
      dietary=excluded.dietary,
      note=excluded.note,
      photo_consent=excluded.photo_consent,
      privacy_consent=true,
      person_id=excluded.person_id,
      activity_participation_id=excluded.activity_participation_id,
      updated_at=v_now
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'application_id',v_id,
    'event_key',p_event_key,
    'participation_id',v_participation,
    'message','신청이 접수되었습니다.'
  );
end;
$$;

revoke all on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) from public;
grant execute on function public.mission_submit_event_application(text,text,text,text,integer,text,text,text,boolean,boolean,text) to anon,authenticated;

comment on table public.activities is 'Canonical workspace-owned Activity ledger. New records are private/draft by default.';
comment on table public.activity_participations is 'Canonical participation lifecycle linked to public.people; relationship/membership is stored separately.';
comment on table public.person_workspace_relationships is 'Explicit relationship ledger. Activity participation must never auto-create these rows.';
