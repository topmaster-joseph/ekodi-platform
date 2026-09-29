-- EKODI person digital card + consent-based contact exchange.
-- Private card/contact data stays outside the Data API; only bounded RPC projections are exposed.

create table if not exists private.person_digital_cards (
  person_id uuid primary key references public.people(id) on delete cascade,
  phone text not null default '',
  email text not null default '',
  phone_public boolean not null default false,
  email_public boolean not null default false,
  exchange_enabled boolean not null default false,
  affiliations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_digital_cards_affiliations_array check (jsonb_typeof(affiliations)='array')
);

create table if not exists private.person_contact_exchanges (
  id uuid primary key default gen_random_uuid(),
  receiver_person_id uuid not null references public.people(id) on delete cascade,
  sender_person_id uuid not null references public.people(id) on delete cascade,
  sender_name text not null,
  affiliation text not null default '',
  title text not null default '',
  website text not null default '',
  source_channel text not null default 'card' check (source_channel in ('card','qr')),
  privacy_consent boolean not null,
  first_shared_at timestamptz not null default now(),
  last_shared_at timestamptz not null default now(),
  share_count integer not null default 1 check (share_count > 0),
  unique(receiver_person_id,sender_person_id)
);
create index if not exists person_contact_exchanges_receiver_recent_idx
  on private.person_contact_exchanges(receiver_person_id,last_shared_at desc);

revoke all on table private.person_digital_cards from public, anon, authenticated;
revoke all on table private.person_contact_exchanges from public, anon, authenticated;

create or replace function public.get_my_digital_card()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person uuid:=private.current_person_id();
  v_row private.person_digital_cards%rowtype;
begin
  if auth.uid() is null or v_person is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  select * into v_row from private.person_digital_cards where person_id=v_person;
  if not found then
    return jsonb_build_object(
      'phone','',
      'email','',
      'phone_public',false,
      'email_public',false,
      'exchange_enabled',false,
      'affiliations','[]'::jsonb,
      'updated_at',null
    );
  end if;
  return jsonb_build_object(
    'phone',v_row.phone,
    'email',v_row.email,
    'phone_public',v_row.phone_public,
    'email_public',v_row.email_public,
    'exchange_enabled',v_row.exchange_enabled,
    'affiliations',v_row.affiliations,
    'updated_at',v_row.updated_at
  );
end
$$;
revoke execute on function public.get_my_digital_card() from public, anon, authenticated;
grant execute on function public.get_my_digital_card() to authenticated;

create or replace function public.set_my_digital_card(
  p_phone text default '',
  p_email text default '',
  p_phone_public boolean default false,
  p_email_public boolean default false,
  p_exchange_enabled boolean default false,
  p_affiliations jsonb default '[]'::jsonb
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
  v_affiliations jsonb:=coalesce(p_affiliations,'[]'::jsonb);
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
  if jsonb_typeof(v_affiliations)<>'array' or jsonb_array_length(v_affiliations)>20 then
    raise exception 'invalid_affiliations';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(v_affiliations) item
     where jsonb_typeof(item)<>'object'
        or length(trim(coalesce(item->>'name',''))) not between 1 and 120
        or length(coalesce(item->>'title',''))>120
        or length(coalesce(item->>'description',''))>800
        or length(coalesce(item->>'url',''))>1000
        or (coalesce(item->>'url','')<>'' and coalesce(item->>'url','') !~ '^https?://')
        or lower(coalesce(item->>'visible','true')) not in ('true','false')
  ) then
    raise exception 'invalid_affiliation_item';
  end if;

  insert into private.person_digital_cards(
    person_id,phone,email,phone_public,email_public,exchange_enabled,affiliations,updated_at
  ) values (
    v_person,v_phone,v_email,coalesce(p_phone_public,false),coalesce(p_email_public,false),
    coalesce(p_exchange_enabled,false),v_affiliations,now()
  )
  on conflict(person_id) do update
    set phone=excluded.phone,
        email=excluded.email,
        phone_public=excluded.phone_public,
        email_public=excluded.email_public,
        exchange_enabled=excluded.exchange_enabled,
        affiliations=excluded.affiliations,
        updated_at=now();

  return public.get_my_digital_card();
end
$$;
revoke execute on function public.set_my_digital_card(text,text,boolean,boolean,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.set_my_digital_card(text,text,boolean,boolean,boolean,jsonb) to authenticated;

create or replace function public.person_digital_card(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_handle text:=lower(trim(coalesce(p_handle,'')));
  v_profile public.person_public_profiles%rowtype;
  v_card private.person_digital_cards%rowtype;
  v_affiliations jsonb:='[]'::jsonb;
begin
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    return jsonb_build_object('ok',false);
  end if;

  select * into v_profile
    from public.person_public_profiles
   where lower(handle)=v_handle and visibility='public'
   limit 1;
  if not found then return jsonb_build_object('ok',false); end if;

  select * into v_card from private.person_digital_cards where person_id=v_profile.person_id;
  if found then
    select coalesce(jsonb_agg(item),'[]'::jsonb)
      into v_affiliations
      from jsonb_array_elements(coalesce(v_card.affiliations,'[]'::jsonb)) item
     where lower(coalesce(item->>'visible','true'))<>'false';
  end if;

  return jsonb_build_object(
    'ok',true,
    'handle',v_profile.handle,
    'display_name',v_profile.display_name,
    'headline',v_profile.headline,
    'bio',v_profile.bio,
    'links',v_profile.links,
    'phone',case when coalesce(v_card.phone_public,false) then coalesce(v_card.phone,'') else '' end,
    'email',case when coalesce(v_card.email_public,false) then coalesce(v_card.email,'') else '' end,
    'exchange_enabled',coalesce(v_card.exchange_enabled,false),
    'affiliations',coalesce(v_affiliations,'[]'::jsonb),
    'updated_at',greatest(v_profile.updated_at,coalesce(v_card.updated_at,v_profile.updated_at))
  );
end
$$;
revoke execute on function public.person_digital_card(text) from public, anon, authenticated;
grant execute on function public.person_digital_card(text) to anon, authenticated;
comment on function public.person_digital_card(text) is
  'Intentional anonymous SECURITY DEFINER projection. Returns only explicitly public digital-card fields for a published person handle.';

create or replace function public.submit_person_contact_exchange(
  p_handle text,
  p_name text,
  p_phone text default '',
  p_email text default '',
  p_affiliation text default '',
  p_title text default '',
  p_website text default '',
  p_privacy_consent boolean default false,
  p_source_channel text default 'card'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_handle text:=lower(trim(coalesce(p_handle,'')));
  v_name text:=left(trim(coalesce(p_name,'')),80);
  v_phone_value text:=left(trim(coalesce(p_phone,'')),40);
  v_phone text:=regexp_replace(v_phone_value,'[^0-9+]','','g');
  v_email text:=lower(left(trim(coalesce(p_email,'')),254));
  v_affiliation text:=left(trim(coalesce(p_affiliation,'')),160);
  v_title text:=left(trim(coalesce(p_title,'')),160);
  v_website text:=left(trim(coalesce(p_website,'')),1000);
  v_source text:=lower(trim(coalesce(p_source_channel,'card')));
  v_receiver uuid;
  v_phone_person uuid;
  v_email_person uuid;
  v_sender uuid;
  v_exchange uuid;
begin
  if coalesce(p_privacy_consent,false) is not true then raise exception 'privacy_consent_required'; end if;
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'invalid_handle'; end if;
  if length(v_name)<1 then raise exception 'invalid_name'; end if;
  if v_phone='' and v_email='' then raise exception 'contact_required'; end if;
  if v_phone<>'' and length(v_phone) not between 8 and 20 then raise exception 'invalid_phone'; end if;
  if v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  if v_website<>'' and v_website !~ '^https?://' then raise exception 'invalid_website'; end if;
  if v_source not in ('card','qr') then v_source:='card'; end if;

  select p.person_id into v_receiver
    from public.person_public_profiles p
    join private.person_digital_cards c on c.person_id=p.person_id
   where lower(p.handle)=v_handle
     and p.visibility='public'
     and c.exchange_enabled=true
   limit 1;
  if v_receiver is null then raise exception 'contact_exchange_unavailable'; end if;

  if v_phone<>'' then perform pg_advisory_xact_lock(hashtextextended('contact-exchange-phone:'||v_phone,0)); end if;
  if v_email<>'' then perform pg_advisory_xact_lock(hashtextextended('contact-exchange-email:'||v_email,0)); end if;

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
    raise exception 'contact_identity_conflict';
  end if;

  v_sender:=coalesce(v_phone_person,v_email_person);
  if v_sender is null then
    insert into public.people(display_name,status) values(v_name,'active') returning id into v_sender;
  else
    update public.people
       set display_name=case when coalesce(trim(display_name),'')='' then v_name else display_name end,
           updated_at=now()
     where id=v_sender;
  end if;

  if v_phone<>'' then
    insert into public.person_contacts(person_id,kind,value,normalized_value,is_primary,verified,consent_basis,source_channel)
    values(v_sender,'phone',v_phone_value,v_phone,true,false,'contact_exchange',v_source)
    on conflict(kind,normalized_value) do update set value=excluded.value,updated_at=now();
  end if;
  if v_email<>'' then
    insert into public.person_contacts(person_id,kind,value,normalized_value,is_primary,verified,consent_basis,source_channel)
    values(v_sender,'email',v_email,v_email,true,false,'contact_exchange',v_source)
    on conflict(kind,normalized_value) do update set value=excluded.value,updated_at=now();
  end if;

  insert into private.person_contact_exchanges as existing(
    receiver_person_id,sender_person_id,sender_name,affiliation,title,website,source_channel,privacy_consent
  ) values (
    v_receiver,v_sender,v_name,v_affiliation,v_title,v_website,v_source,true
  )
  on conflict(receiver_person_id,sender_person_id) do update
    set sender_name=excluded.sender_name,
        affiliation=excluded.affiliation,
        title=excluded.title,
        website=excluded.website,
        source_channel=excluded.source_channel,
        privacy_consent=true,
        last_shared_at=now(),
        share_count=existing.share_count+1
  returning id into v_exchange;

  return jsonb_build_object('ok',true,'exchange_id',v_exchange);
end
$$;
revoke execute on function public.submit_person_contact_exchange(text,text,text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.submit_person_contact_exchange(text,text,text,text,text,text,text,boolean,text) to anon, authenticated;
comment on function public.submit_person_contact_exchange(text,text,text,text,text,text,text,boolean,text) is
  'Intentional anonymous SECURITY DEFINER contact-exchange endpoint. Requires explicit privacy consent, a published receiver with exchange enabled, validated contact data, and stores private results only.';

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
    'last_shared_at',r.last_shared_at,
    'share_count',r.share_count
  ) order by r.last_shared_at desc),'[]'::jsonb)
  into v_items
  from recent r
  join public.people p on p.id=r.sender_person_id
  left join lateral (
    select c.value from public.person_contacts c
     where c.person_id=r.sender_person_id and c.kind='phone'
     order by c.is_primary desc,c.updated_at desc limit 1
  ) phone on true
  left join lateral (
    select c.value from public.person_contacts c
     where c.person_id=r.sender_person_id and c.kind='email'
     order by c.is_primary desc,c.updated_at desc limit 1
  ) email on true;

  return jsonb_build_object('ok',true,'items',coalesce(v_items,'[]'::jsonb));
end
$$;
revoke execute on function public.get_my_contact_exchanges(integer) from public, anon, authenticated;
grant execute on function public.get_my_contact_exchanges(integer) to authenticated;
