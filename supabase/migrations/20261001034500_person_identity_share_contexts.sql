-- EKODI Personal Identity & Contact Exchange v2
-- One person fact ledger + reusable roles + context-specific sharing projections.

create table if not exists private.person_identity_roles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  role_key text not null,
  organization_name text not null default '',
  title text not null default '',
  description text not null default '',
  url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_identity_roles_key_format check (role_key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint person_identity_roles_org_length check (length(organization_name) <= 120),
  constraint person_identity_roles_title_length check (length(title) <= 120),
  constraint person_identity_roles_description_length check (length(description) <= 800),
  constraint person_identity_roles_url_length check (length(url) <= 1000),
  constraint person_identity_roles_url_scheme check (url = '' or url ~ '^https?://'),
  constraint person_identity_roles_person_key_unique unique(person_id, role_key),
  constraint person_identity_roles_person_id_id_unique unique(person_id, id)
);

create table if not exists private.person_share_contexts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  context_key text not null,
  label text not null,
  role_id uuid,
  show_phone boolean not null default false,
  show_email boolean not null default false,
  show_profile_intro boolean not null default true,
  show_profile_links boolean not null default true,
  exchange_enabled boolean not null default true,
  visibility text not null default 'private' check (visibility in ('private','public')),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_share_contexts_key_format check (context_key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint person_share_contexts_label_length check (length(label) between 1 and 80),
  constraint person_share_contexts_person_key_unique unique(person_id, context_key),
  constraint person_share_contexts_role_fk
    foreign key(role_id)
    references private.person_identity_roles(id)
    on delete set null
);

create unique index if not exists person_share_contexts_one_default_idx
  on private.person_share_contexts(person_id)
  where is_default;

create index if not exists person_share_contexts_public_order_idx
  on private.person_share_contexts(person_id, visibility, sort_order, created_at);

alter table private.person_contact_exchanges
  add column if not exists context_key text not null default '',
  add column if not exists context_label text not null default '';

revoke all on table private.person_identity_roles from public, anon, authenticated;
revoke all on table private.person_share_contexts from public, anon, authenticated;

-- Preserve legacy affiliation facts as normalized roles/contexts.
insert into private.person_identity_roles(
  person_id, role_key, organization_name, title, description, url, sort_order, active
)
select
  c.person_id,
  'legacy-' || a.ord::text,
  left(trim(coalesce(a.item->>'name','')),120),
  left(trim(coalesce(a.item->>'title','')),120),
  left(coalesce(a.item->>'description',''),800),
  left(trim(coalesce(a.item->>'url','')),1000),
  a.ord::integer,
  true
from private.person_digital_cards c
cross join lateral jsonb_array_elements(coalesce(c.affiliations,'[]'::jsonb)) with ordinality as a(item,ord)
where trim(coalesce(a.item->>'name','')) <> ''
on conflict(person_id,role_key) do nothing;

insert into private.person_share_contexts(
  person_id, context_key, label, role_id,
  show_phone, show_email, show_profile_intro, show_profile_links,
  exchange_enabled, visibility, is_default, sort_order
)
select
  r.person_id,
  r.role_key,
  left(coalesce(nullif(r.organization_name,''),nullif(r.title,''),r.role_key),80),
  r.id,
  c.phone_public,
  c.email_public,
  true,
  true,
  c.exchange_enabled,
  case
    when lower(coalesce(a.item->>'visible','true'))='false' then 'private'
    else 'public'
  end,
  false,
  r.sort_order
from private.person_identity_roles r
join private.person_digital_cards c on c.person_id=r.person_id
join lateral (
  select item
  from jsonb_array_elements(coalesce(c.affiliations,'[]'::jsonb)) with ordinality x(item,ord)
  where ('legacy-' || x.ord::text)=r.role_key
  limit 1
) a on true
where r.role_key like 'legacy-%'
on conflict(person_id,context_key) do nothing;

-- Existing cards without affiliation/context data retain one personal sharing mode.
insert into private.person_share_contexts(
  person_id, context_key, label, role_id,
  show_phone, show_email, show_profile_intro, show_profile_links,
  exchange_enabled, visibility, is_default, sort_order
)
select
  c.person_id,'personal','개인',null,
  c.phone_public,c.email_public,true,true,
  c.exchange_enabled,'public',true,0
from private.person_digital_cards c
where not exists(
  select 1 from private.person_share_contexts s where s.person_id=c.person_id
)
on conflict(person_id,context_key) do nothing;

-- Pick a default only where a legacy migration produced public contexts but no default.
with candidates as (
  select distinct on (s.person_id) s.id
  from private.person_share_contexts s
  where s.visibility='public'
    and not exists(
      select 1
      from private.person_share_contexts d
      where d.person_id=s.person_id and d.is_default
    )
  order by s.person_id,s.sort_order,s.created_at,s.id
)
update private.person_share_contexts s
set is_default=true,updated_at=now()
from candidates c
where s.id=c.id;

create or replace function public.get_my_identity_share_config()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person uuid:=private.current_person_id();
  v_card private.person_digital_cards%rowtype;
  v_has_card boolean:=false;
  v_roles jsonb;
  v_contexts jsonb;
begin
  if auth.uid() is null or v_person is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_card
  from private.person_digital_cards
  where person_id=v_person;
  v_has_card:=found;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',r.role_key,
    'name',r.organization_name,
    'title',r.title,
    'description',r.description,
    'url',r.url,
    'active',r.active
  ) order by r.sort_order,r.created_at,r.id),'[]'::jsonb)
  into v_roles
  from private.person_identity_roles r
  where r.person_id=v_person;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key',s.context_key,
    'label',s.label,
    'role_key',coalesce(r.role_key,''),
    'show_phone',s.show_phone,
    'show_email',s.show_email,
    'show_profile_intro',s.show_profile_intro,
    'show_profile_links',s.show_profile_links,
    'exchange_enabled',s.exchange_enabled,
    'visibility',s.visibility,
    'is_default',s.is_default
  ) order by s.sort_order,s.created_at,s.id),'[]'::jsonb)
  into v_contexts
  from private.person_share_contexts s
  left join private.person_identity_roles r
    on r.person_id=s.person_id and r.id=s.role_id
  where s.person_id=v_person;

  return jsonb_build_object(
    'phone',case when v_has_card then coalesce(v_card.phone,'') else '' end,
    'email',case when v_has_card then coalesce(v_card.email,'') else '' end,
    'exchange_enabled',case when v_has_card then coalesce(v_card.exchange_enabled,false) else false end,
    'roles',coalesce(v_roles,'[]'::jsonb),
    'contexts',coalesce(v_contexts,'[]'::jsonb),
    'updated_at',case when v_has_card then v_card.updated_at else null end
  );
end
$$;
revoke execute on function public.get_my_identity_share_config() from public, anon, authenticated;
grant execute on function public.get_my_identity_share_config() to authenticated;

create or replace function public.set_my_identity_share_config(
  p_phone text default '',
  p_email text default '',
  p_exchange_enabled boolean default false,
  p_roles jsonb default '[]'::jsonb,
  p_contexts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person uuid:=private.current_person_id();
  v_phone text:=left(trim(coalesce(p_phone,'')),40);
  v_email text:=lower(left(trim(coalesce(p_email,'')),254));
  v_roles jsonb:=coalesce(p_roles,'[]'::jsonb);
  v_contexts jsonb:=coalesce(p_contexts,'[]'::jsonb);
  v_role record;
  v_context record;
  v_role_id uuid;
  v_legacy jsonb;
begin
  if auth.uid() is null or v_person is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  if v_phone<>'' and length(regexp_replace(v_phone,'[^0-9+]','','g')) not between 8 and 20 then
    raise exception 'invalid_phone';
  end if;
  if jsonb_typeof(v_roles)<>'array' or jsonb_array_length(v_roles)>20 then
    raise exception 'invalid_roles';
  end if;
  if jsonb_typeof(v_contexts)<>'array' or jsonb_array_length(v_contexts)>20 then
    raise exception 'invalid_contexts';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_roles) item
    where jsonb_typeof(item)<>'object'
       or coalesce(item->>'key','') !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
       or length(trim(coalesce(item->>'name','')))>120
       or length(coalesce(item->>'title',''))>120
       or length(coalesce(item->>'description',''))>800
       or length(coalesce(item->>'url',''))>1000
       or (coalesce(item->>'url','')<>'' and coalesce(item->>'url','') !~ '^https?://')
  ) then
    raise exception 'invalid_role_item';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_roles)
  ) <> (
    select count(distinct lower(item->>'key'))
    from jsonb_array_elements(v_roles) item
  ) then
    raise exception 'duplicate_role_key';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_contexts) item
    where jsonb_typeof(item)<>'object'
       or coalesce(item->>'key','') !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
       or length(trim(coalesce(item->>'label',''))) not between 1 and 80
       or lower(coalesce(item->>'visibility','private')) not in ('private','public')
       or (
         coalesce(trim(item->>'role_key'),'')<>''
         and not exists(
           select 1
           from jsonb_array_elements(v_roles) role_item
           where lower(role_item->>'key')=lower(item->>'role_key')
         )
       )
  ) then
    raise exception 'invalid_context_item';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_contexts)
  ) <> (
    select count(distinct lower(item->>'key'))
    from jsonb_array_elements(v_contexts) item
  ) then
    raise exception 'duplicate_context_key';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_contexts) item
    where coalesce((item->>'is_default')::boolean,false)
  ) > 1 then
    raise exception 'multiple_default_contexts';
  end if;

  insert into private.person_digital_cards(
    person_id,phone,email,phone_public,email_public,exchange_enabled,affiliations,updated_at
  ) values(
    v_person,v_phone,v_email,false,false,coalesce(p_exchange_enabled,false),'[]'::jsonb,now()
  )
  on conflict(person_id) do update
    set phone=excluded.phone,
        email=excluded.email,
        phone_public=false,
        email_public=false,
        exchange_enabled=excluded.exchange_enabled,
        updated_at=now();

  delete from private.person_share_contexts where person_id=v_person;
  delete from private.person_identity_roles where person_id=v_person;

  for v_role in
    select item,ord
    from jsonb_array_elements(v_roles) with ordinality x(item,ord)
  loop
    insert into private.person_identity_roles(
      person_id,role_key,organization_name,title,description,url,sort_order,active,updated_at
    ) values(
      v_person,
      lower(v_role.item->>'key'),
      left(trim(coalesce(v_role.item->>'name','')),120),
      left(trim(coalesce(v_role.item->>'title','')),120),
      left(coalesce(v_role.item->>'description',''),800),
      left(trim(coalesce(v_role.item->>'url','')),1000),
      v_role.ord::integer,
      coalesce((v_role.item->>'active')::boolean,true),
      now()
    );
  end loop;

  for v_context in
    select item,ord
    from jsonb_array_elements(v_contexts) with ordinality x(item,ord)
  loop
    v_role_id:=null;
    if coalesce(trim(v_context.item->>'role_key'),'')<>'' then
      select id into v_role_id
      from private.person_identity_roles
      where person_id=v_person
        and role_key=lower(v_context.item->>'role_key')
      limit 1;
    end if;

    insert into private.person_share_contexts(
      person_id,context_key,label,role_id,
      show_phone,show_email,show_profile_intro,show_profile_links,
      exchange_enabled,visibility,is_default,sort_order,updated_at
    ) values(
      v_person,
      lower(v_context.item->>'key'),
      left(trim(v_context.item->>'label'),80),
      v_role_id,
      coalesce((v_context.item->>'show_phone')::boolean,false),
      coalesce((v_context.item->>'show_email')::boolean,false),
      coalesce((v_context.item->>'show_profile_intro')::boolean,true),
      coalesce((v_context.item->>'show_profile_links')::boolean,true),
      coalesce((v_context.item->>'exchange_enabled')::boolean,true),
      lower(coalesce(v_context.item->>'visibility','private')),
      coalesce((v_context.item->>'is_default')::boolean,false),
      v_context.ord::integer,
      now()
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name',r.organization_name,
    'title',r.title,
    'description',r.description,
    'url',r.url,
    'visible',exists(
      select 1
      from private.person_share_contexts s
      where s.person_id=r.person_id
        and s.role_id=r.id
        and s.visibility='public'
    )
  ) order by r.sort_order,r.created_at,r.id),'[]'::jsonb)
  into v_legacy
  from private.person_identity_roles r
  where r.person_id=v_person and r.active;

  update private.person_digital_cards
  set affiliations=coalesce(v_legacy,'[]'::jsonb),updated_at=now()
  where person_id=v_person;

  return public.get_my_identity_share_config();
end
$$;
revoke execute on function public.set_my_identity_share_config(text,text,boolean,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.set_my_identity_share_config(text,text,boolean,jsonb,jsonb) to authenticated;

create or replace function public.person_identity_share(
  p_handle text,
  p_context text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_handle text:=lower(trim(coalesce(p_handle,'')));
  v_requested text:=lower(trim(coalesce(p_context,'')));
  v_profile public.person_public_profiles%rowtype;
  v_card private.person_digital_cards%rowtype;
  v_context private.person_share_contexts%rowtype;
  v_role private.person_identity_roles%rowtype;
  v_contexts jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_phone text:='';
  v_email text:='';
  v_links jsonb:='[]'::jsonb;
  v_headline text:='';
  v_bio text:='';
  v_role_json jsonb:=null;
  v_ready boolean:=false;
begin
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    return jsonb_build_object('ok',false);
  end if;

  select * into v_profile
  from public.person_public_profiles
  where lower(handle)=v_handle and visibility='public'
  limit 1;
  if not found then return jsonb_build_object('ok',false); end if;

  select * into v_card
  from private.person_digital_cards
  where person_id=v_profile.person_id;

  with usable as (
    select
      s.*,
      r.role_key,
      r.organization_name,
      r.title as role_title,
      r.description as role_description,
      r.url as role_url
    from private.person_share_contexts s
    left join private.person_identity_roles r
      on r.person_id=s.person_id and r.id=s.role_id and r.active
    where s.person_id=v_profile.person_id
      and s.visibility='public'
      and (
        r.id is not null
        or (s.show_profile_intro and (trim(coalesce(v_profile.headline,''))<>'' or trim(coalesce(v_profile.bio,''))<>''))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
      )
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'key',u.context_key,
      'label',u.label,
      'is_default',u.is_default,
      'role_name',coalesce(u.organization_name,''),
      'role_title',coalesce(u.role_title,'')
    ) order by u.sort_order,u.created_at,u.id),'[]'::jsonb),
    count(*)::integer
  into v_contexts,v_count
  from usable u;

  if v_requested<>'' then
    select s.* into v_context
    from private.person_share_contexts s
    left join private.person_identity_roles r
      on r.person_id=s.person_id and r.id=s.role_id and r.active
    where s.person_id=v_profile.person_id
      and s.visibility='public'
      and s.context_key=v_requested
      and (
        r.id is not null
        or (s.show_profile_intro and (trim(coalesce(v_profile.headline,''))<>'' or trim(coalesce(v_profile.bio,''))<>''))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
      )
    limit 1;
  else
    select s.* into v_context
    from private.person_share_contexts s
    left join private.person_identity_roles r
      on r.person_id=s.person_id and r.id=s.role_id and r.active
    where s.person_id=v_profile.person_id
      and s.visibility='public'
      and s.is_default
      and (
        r.id is not null
        or (s.show_profile_intro and (trim(coalesce(v_profile.headline,''))<>'' or trim(coalesce(v_profile.bio,''))<>''))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
      )
    order by s.sort_order,s.created_at,s.id
    limit 1;

    if v_context.id is null and v_count=1 then
      select s.* into v_context
      from private.person_share_contexts s
      left join private.person_identity_roles r
        on r.person_id=s.person_id and r.id=s.role_id and r.active
      where s.person_id=v_profile.person_id
        and s.visibility='public'
        and (
          r.id is not null
          or (s.show_profile_intro and (trim(coalesce(v_profile.headline,''))<>'' or trim(coalesce(v_profile.bio,''))<>''))
          or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
          or (s.show_email and trim(coalesce(v_card.email,''))<>'')
          or (
            s.show_profile_links
            and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
            and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
          )
        )
      order by s.sort_order,s.created_at,s.id
      limit 1;
    end if;
  end if;

  v_ready:=v_count>0;

  if v_context.id is not null then
    if v_context.role_id is not null then
      select * into v_role
      from private.person_identity_roles
      where person_id=v_profile.person_id and id=v_context.role_id and active
      limit 1;
      if found then
        v_role_json:=jsonb_build_object(
          'key',v_role.role_key,
          'name',v_role.organization_name,
          'title',v_role.title,
          'description',v_role.description,
          'url',v_role.url
        );
      end if;
    end if;
    if v_context.show_phone then v_phone:=coalesce(v_card.phone,''); end if;
    if v_context.show_email then v_email:=coalesce(v_card.email,''); end if;
    if v_context.show_profile_links then v_links:=coalesce(v_profile.links,'[]'::jsonb); end if;
    if v_context.show_profile_intro then
      v_headline:=coalesce(v_profile.headline,'');
      v_bio:=coalesce(v_profile.bio,'');
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'ready',v_ready,
    'handle',v_profile.handle,
    'display_name',v_profile.display_name,
    'headline',v_headline,
    'bio',v_bio,
    'links',coalesce(v_links,'[]'::jsonb),
    'phone',v_phone,
    'email',v_email,
    'exchange_enabled',coalesce(v_card.exchange_enabled,false)
      and v_context.id is not null
      and v_context.exchange_enabled,
    'contexts',coalesce(v_contexts,'[]'::jsonb),
    'selected_context',case
      when v_context.id is null then null
      else jsonb_build_object(
        'key',v_context.context_key,
        'label',v_context.label,
        'is_default',v_context.is_default
      )
    end,
    'role',v_role_json,
    'updated_at',greatest(
      v_profile.updated_at,
      coalesce(v_card.updated_at,v_profile.updated_at),
      coalesce(v_context.updated_at,v_profile.updated_at),
      coalesce(v_role.updated_at,v_profile.updated_at)
    )
  );
end
$$;
revoke execute on function public.person_identity_share(text,text) from public, anon, authenticated;
grant execute on function public.person_identity_share(text,text) to anon, authenticated;
comment on function public.person_identity_share(text,text) is
  'Intentional anonymous SECURITY DEFINER projection. Returns only public person facts selected by an explicit public share context.';

create or replace function public.submit_person_contact_exchange_v2(
  p_handle text,
  p_name text,
  p_phone text default '',
  p_email text default '',
  p_affiliation text default '',
  p_title text default '',
  p_website text default '',
  p_privacy_consent boolean default false,
  p_source_channel text default 'card',
  p_context_key text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_projection jsonb;
  v_selected jsonb;
  v_result jsonb;
  v_exchange uuid;
  v_context_key text;
  v_context_label text;
begin
  v_projection:=public.person_identity_share(
    lower(trim(coalesce(p_handle,''))),
    nullif(lower(trim(coalesce(p_context_key,''))),'')
  );
  v_selected:=v_projection->'selected_context';

  if coalesce((v_projection->>'ok')::boolean,false) is not true
     or coalesce((v_projection->>'ready')::boolean,false) is not true
     or v_selected is null
     or coalesce((v_projection->>'exchange_enabled')::boolean,false) is not true then
    raise exception 'contact_exchange_unavailable';
  end if;

  v_context_key:=coalesce(v_selected->>'key','');
  v_context_label:=coalesce(v_selected->>'label','');

  v_result:=public.submit_person_contact_exchange(
    p_handle,p_name,p_phone,p_email,p_affiliation,p_title,p_website,
    p_privacy_consent,p_source_channel
  );

  v_exchange:=(v_result->>'exchange_id')::uuid;
  update private.person_contact_exchanges
  set context_key=v_context_key,
      context_label=v_context_label
  where id=v_exchange;

  return v_result || jsonb_build_object(
    'context_key',v_context_key,
    'context_label',v_context_label
  );
end
$$;
revoke execute on function public.submit_person_contact_exchange_v2(text,text,text,text,text,text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.submit_person_contact_exchange_v2(text,text,text,text,text,text,text,boolean,text,text) to anon, authenticated;
comment on function public.submit_person_contact_exchange_v2(text,text,text,text,text,text,text,boolean,text,text) is
  'Intentional anonymous SECURITY DEFINER exchange endpoint. Requires a public share context and delegates validation/throttling to the established exchange function.';

create or replace function public.get_my_contact_exchanges(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_receiver uuid:=private.current_person_id();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_items jsonb;
begin
  if auth.uid() is null or v_receiver is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  with recent as (
    select e.*
    from private.person_contact_exchanges e
    where e.receiver_person_id=v_receiver
    order by e.last_shared_at desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'name',r.sender_name,
    'phone',coalesce(phone.value,''),
    'email',coalesce(email.value,''),
    'affiliation',r.affiliation,
    'title',r.title,
    'website',r.website,
    'source_channel',r.source_channel,
    'context_key',r.context_key,
    'context_label',r.context_label,
    'last_shared_at',r.last_shared_at,
    'share_count',r.share_count
  ) order by r.last_shared_at desc),'[]'::jsonb)
  into v_items
  from recent r
  join public.people p on p.id=r.sender_person_id
  left join lateral (
    select c.value
    from public.person_contacts c
    where c.person_id=r.sender_person_id and c.kind='phone'
    order by c.is_primary desc,c.updated_at desc
    limit 1
  ) phone on true
  left join lateral (
    select c.value
    from public.person_contacts c
    where c.person_id=r.sender_person_id and c.kind='email'
    order by c.is_primary desc,c.updated_at desc
    limit 1
  ) email on true;

  return jsonb_build_object('ok',true,'items',coalesce(v_items,'[]'::jsonb));
end
$$;
revoke execute on function public.get_my_contact_exchanges(integer) from public, anon, authenticated;
grant execute on function public.get_my_contact_exchanges(integer) to authenticated;
