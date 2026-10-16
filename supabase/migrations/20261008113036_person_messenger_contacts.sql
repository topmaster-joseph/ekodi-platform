-- EKODI Personal Identity messenger contacts.
-- Messenger values are private facts; only explicit share-context selections are projected publicly.

create table if not exists private.person_messenger_contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  contact_key text not null,
  service text not null,
  label text not null default '',
  value text not null default '',
  url text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_messenger_contacts_key_format
    check (contact_key ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint person_messenger_contacts_service
    check (service in ('wechat','whatsapp','telegram','line','kakaotalk','custom')),
  constraint person_messenger_contacts_label_length
    check (length(label) <= 80),
  constraint person_messenger_contacts_value_length
    check (length(value) <= 200),
  constraint person_messenger_contacts_url_length
    check (length(url) <= 1000),
  constraint person_messenger_contacts_url_scheme
    check (url = '' or url ~ '^https://'),
  constraint person_messenger_contacts_person_key_unique
    unique(person_id, contact_key),
  constraint person_messenger_contacts_person_id_id_unique
    unique(person_id, id)
);

create unique index if not exists person_share_contexts_person_id_id_uidx
  on private.person_share_contexts(person_id, id);

create table if not exists private.person_share_context_messengers (
  person_id uuid not null,
  context_id uuid not null,
  messenger_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key(context_id, messenger_id),
  constraint person_share_context_messengers_context_fk
    foreign key(person_id, context_id)
    references private.person_share_contexts(person_id, id)
    on delete cascade,
  constraint person_share_context_messengers_contact_fk
    foreign key(person_id, messenger_id)
    references private.person_messenger_contacts(person_id, id)
    on delete cascade
);

create index if not exists person_messenger_contacts_person_order_idx
  on private.person_messenger_contacts(person_id, enabled, sort_order, created_at);
create index if not exists person_share_context_messengers_person_context_idx
  on private.person_share_context_messengers(person_id, context_id, sort_order);

revoke all on table private.person_messenger_contacts from public, anon, authenticated;
revoke all on table private.person_share_context_messengers from public, anon, authenticated;

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
  v_messengers jsonb;
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
    'key',m.contact_key,
    'service',m.service,
    'label',m.label,
    'value',m.value,
    'url',m.url,
    'enabled',m.enabled
  ) order by m.sort_order,m.created_at,m.id),'[]'::jsonb)
  into v_messengers
  from private.person_messenger_contacts m
  where m.person_id=v_person;

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
    'is_default',s.is_default,
    'messenger_keys',(
      select coalesce(jsonb_agg(m.contact_key order by x.sort_order,m.sort_order,m.created_at,m.id),'[]'::jsonb)
      from private.person_share_context_messengers x
      join private.person_messenger_contacts m
        on m.person_id=x.person_id and m.id=x.messenger_id
      where x.person_id=s.person_id and x.context_id=s.id
    )
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
    'messengers',coalesce(v_messengers,'[]'::jsonb),
    'contexts',coalesce(v_contexts,'[]'::jsonb),
    'updated_at',case when v_has_card then v_card.updated_at else null end
  );
end
$$;
revoke execute on function public.get_my_identity_share_config() from public, anon, authenticated;
grant execute on function public.get_my_identity_share_config() to authenticated;

create or replace function public.set_my_identity_share_config_v2(
  p_phone text default '',
  p_email text default '',
  p_exchange_enabled boolean default false,
  p_roles jsonb default '[]'::jsonb,
  p_messengers jsonb default '[]'::jsonb,
  p_contexts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person uuid:=private.current_person_id();
  v_messengers jsonb:=coalesce(p_messengers,'[]'::jsonb);
  v_contexts jsonb:=coalesce(p_contexts,'[]'::jsonb);
  v_item record;
  v_context record;
  v_context_id uuid;
  v_messenger_id uuid;
  v_messenger_key text;
begin
  if auth.uid() is null or v_person is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if jsonb_typeof(v_messengers)<>'array' or jsonb_array_length(v_messengers)>20 then
    raise exception 'invalid_messengers';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_messengers) item
    where jsonb_typeof(item)<>'object'
       or coalesce(item->>'key','') !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
       or lower(coalesce(item->>'service','')) not in ('wechat','whatsapp','telegram','line','kakaotalk','custom')
       or length(coalesce(item->>'label',''))>80
       or length(coalesce(item->>'value',''))>200
       or length(coalesce(item->>'url',''))>1000
       or (coalesce(item->>'url','')<>'' and coalesce(item->>'url','') !~ '^https://')
       or (trim(coalesce(item->>'value',''))='' and trim(coalesce(item->>'url',''))='')
  ) then
    raise exception 'invalid_messenger_item';
  end if;

  if (
    select count(*) from jsonb_array_elements(v_messengers)
  ) <> (
    select count(distinct lower(item->>'key'))
    from jsonb_array_elements(v_messengers) item
  ) then
    raise exception 'duplicate_messenger_key';
  end if;

  if jsonb_typeof(v_contexts)<>'array' then
    raise exception 'invalid_contexts';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_contexts) item
    where jsonb_typeof(coalesce(item->'messenger_keys','[]'::jsonb))<>'array'
       or exists(
         select 1
         from jsonb_array_elements_text(coalesce(item->'messenger_keys','[]'::jsonb)) selected(key)
         where not exists(
           select 1
           from jsonb_array_elements(v_messengers) messenger
           where lower(messenger->>'key')=lower(selected.key)
         )
       )
  ) then
    raise exception 'invalid_context_messenger_key';
  end if;

  perform public.set_my_identity_share_config(
    p_phone,
    p_email,
    p_exchange_enabled,
    coalesce(p_roles,'[]'::jsonb),
    v_contexts
  );

  delete from private.person_messenger_contacts where person_id=v_person;

  for v_item in
    select item,ord
    from jsonb_array_elements(v_messengers) with ordinality x(item,ord)
  loop
    insert into private.person_messenger_contacts(
      person_id,contact_key,service,label,value,url,enabled,sort_order,updated_at
    ) values(
      v_person,
      lower(v_item.item->>'key'),
      lower(v_item.item->>'service'),
      left(trim(coalesce(v_item.item->>'label','')),80),
      left(trim(coalesce(v_item.item->>'value','')),200),
      left(trim(coalesce(v_item.item->>'url','')),1000),
      coalesce((v_item.item->>'enabled')::boolean,true),
      v_item.ord::integer,
      now()
    );
  end loop;

  for v_context in
    select item,ord
    from jsonb_array_elements(v_contexts) with ordinality x(item,ord)
  loop
    select id into v_context_id
    from private.person_share_contexts
    where person_id=v_person
      and context_key=lower(v_context.item->>'key')
    limit 1;

    if v_context_id is null then
      continue;
    end if;

    for v_messenger_key in
      select value
      from jsonb_array_elements_text(coalesce(v_context.item->'messenger_keys','[]'::jsonb)) x(value)
    loop
      select id into v_messenger_id
      from private.person_messenger_contacts
      where person_id=v_person
        and contact_key=lower(v_messenger_key)
      limit 1;

      if v_messenger_id is not null then
        insert into private.person_share_context_messengers(
          person_id,context_id,messenger_id,sort_order
        ) values(
          v_person,v_context_id,v_messenger_id,
          coalesce((
            select ord::integer
            from jsonb_array_elements_text(coalesce(v_context.item->'messenger_keys','[]'::jsonb))
              with ordinality selected(value,ord)
            where lower(selected.value)=lower(v_messenger_key)
            limit 1
          ),0)
        )
        on conflict(context_id,messenger_id) do nothing;
      end if;
    end loop;
  end loop;

  return public.get_my_identity_share_config();
end
$$;
revoke execute on function public.set_my_identity_share_config_v2(text,text,boolean,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.set_my_identity_share_config_v2(text,text,boolean,jsonb,jsonb,jsonb) to authenticated;

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
  v_messengers jsonb:='[]'::jsonb;
  v_headline text:='';
  v_bio text:='';
  v_role_json jsonb:=null;
  v_ready boolean:=false;
  v_messenger_updated timestamptz:=null;
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
      r.title as role_title
    from private.person_share_contexts s
    left join private.person_identity_roles r
      on r.person_id=s.person_id and r.id=s.role_id and r.active
    where s.person_id=v_profile.person_id
      and s.visibility='public'
      and (
        r.id is not null
        or (s.show_profile_intro and (
          trim(coalesce(v_profile.display_name,''))<>'' or
          trim(coalesce(v_profile.headline,''))<>'' or
          trim(coalesce(v_profile.bio,''))<>''
        ))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
        or exists(
          select 1
          from private.person_share_context_messengers x
          join private.person_messenger_contacts m
            on m.person_id=x.person_id and m.id=x.messenger_id
          where x.person_id=s.person_id
            and x.context_id=s.id
            and m.enabled
            and (trim(m.value)<>'' or trim(m.url)<>'')
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
        or (s.show_profile_intro and (
          trim(coalesce(v_profile.display_name,''))<>'' or
          trim(coalesce(v_profile.headline,''))<>'' or
          trim(coalesce(v_profile.bio,''))<>''
        ))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
        or exists(
          select 1
          from private.person_share_context_messengers x
          join private.person_messenger_contacts m
            on m.person_id=x.person_id and m.id=x.messenger_id
          where x.person_id=s.person_id
            and x.context_id=s.id
            and m.enabled
            and (trim(m.value)<>'' or trim(m.url)<>'')
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
        or (s.show_profile_intro and (
          trim(coalesce(v_profile.display_name,''))<>'' or
          trim(coalesce(v_profile.headline,''))<>'' or
          trim(coalesce(v_profile.bio,''))<>''
        ))
        or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
        or (s.show_email and trim(coalesce(v_card.email,''))<>'')
        or (
          s.show_profile_links
          and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
          and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
        )
        or exists(
          select 1
          from private.person_share_context_messengers x
          join private.person_messenger_contacts m
            on m.person_id=x.person_id and m.id=x.messenger_id
          where x.person_id=s.person_id
            and x.context_id=s.id
            and m.enabled
            and (trim(m.value)<>'' or trim(m.url)<>'')
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
          or (s.show_profile_intro and (
            trim(coalesce(v_profile.display_name,''))<>'' or
            trim(coalesce(v_profile.headline,''))<>'' or
            trim(coalesce(v_profile.bio,''))<>''
          ))
          or (s.show_phone and trim(coalesce(v_card.phone,''))<>'')
          or (s.show_email and trim(coalesce(v_card.email,''))<>'')
          or (
            s.show_profile_links
            and jsonb_typeof(coalesce(v_profile.links,'[]'::jsonb))='array'
            and jsonb_array_length(coalesce(v_profile.links,'[]'::jsonb))>0
          )
          or exists(
            select 1
            from private.person_share_context_messengers x
            join private.person_messenger_contacts m
              on m.person_id=x.person_id and m.id=x.messenger_id
            where x.person_id=s.person_id
              and x.context_id=s.id
              and m.enabled
              and (trim(m.value)<>'' or trim(m.url)<>'')
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

    select coalesce(jsonb_agg(jsonb_build_object(
      'key',m.contact_key,
      'service',m.service,
      'label',m.label,
      'value',m.value,
      'url',m.url
    ) order by x.sort_order,m.sort_order,m.created_at,m.id),'[]'::jsonb)
    into v_messengers
    from private.person_share_context_messengers x
    join private.person_messenger_contacts m
      on m.person_id=x.person_id and m.id=x.messenger_id
    where x.person_id=v_profile.person_id
      and x.context_id=v_context.id
      and m.enabled
      and (trim(m.value)<>'' or trim(m.url)<>'');

    select max(m.updated_at)
    into v_messenger_updated
    from private.person_share_context_messengers x
    join private.person_messenger_contacts m
      on m.person_id=x.person_id and m.id=x.messenger_id
    where x.person_id=v_profile.person_id
      and x.context_id=v_context.id
      and m.enabled;
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
    'messengers',coalesce(v_messengers,'[]'::jsonb),
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
      coalesce(v_role.updated_at,v_profile.updated_at),
      coalesce(v_messenger_updated,v_profile.updated_at)
    )
  );
end
$$;
revoke execute on function public.person_identity_share(text,text) from public, anon, authenticated;
grant execute on function public.person_identity_share(text,text) to anon, authenticated;
comment on function public.person_identity_share(text,text) is
  'Intentional anonymous SECURITY DEFINER projection. Returns only public person facts and messenger methods selected by an explicit public share context.';

create or replace function public.person_identity_share_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'version',2,
    'messenger_contacts',true,
    'context_filtered',true,
    'qr_url_only',true
  );
$$;
revoke execute on function public.person_identity_share_capabilities() from public, anon, authenticated;
grant execute on function public.person_identity_share_capabilities() to anon, authenticated;
