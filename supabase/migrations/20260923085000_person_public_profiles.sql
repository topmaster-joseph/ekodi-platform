-- EKODI public person page: private-first projection managed only from My EKODI.
-- Public readers can see only the explicitly published projection; person/workspace identity stays private.

create table if not exists public.person_public_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  handle text not null,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  links jsonb not null default '[]'::jsonb,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_public_profiles_handle_format
    check (handle ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  constraint person_public_profiles_display_name_length
    check (char_length(display_name) between 1 and 120),
  constraint person_public_profiles_headline_length
    check (char_length(headline) <= 160),
  constraint person_public_profiles_bio_length
    check (char_length(bio) <= 2000),
  constraint person_public_profiles_links_array
    check (jsonb_typeof(links) = 'array'),
  constraint person_public_profiles_visibility
    check (visibility in ('private','public'))
);

create unique index if not exists person_public_profiles_handle_uidx
  on public.person_public_profiles (lower(handle));

create index if not exists person_public_profiles_public_updated_idx
  on public.person_public_profiles (updated_at desc)
  where visibility = 'public';

alter table public.person_public_profiles enable row level security;

revoke all on table public.person_public_profiles from public, anon, authenticated;
grant select (handle, display_name, headline, bio, links, visibility, updated_at)
  on public.person_public_profiles to anon, authenticated;

drop policy if exists person_public_profiles_read_published on public.person_public_profiles;
create policy person_public_profiles_read_published
  on public.person_public_profiles
  for select
  to anon, authenticated
  using (visibility = 'public');

comment on table public.person_public_profiles is
  'Public-only person projection. Writes are service-role mediated by profile-api; My EKODI remains the sole management surface.';


create or replace function public.get_my_public_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth
as $$
declare
  v_person_id uuid := private.current_person_id();
  v_row public.person_public_profiles%rowtype;
begin
  if auth.uid() is null or v_person_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_row
    from public.person_public_profiles
   where person_id = v_person_id;

  if not found then
    return jsonb_build_object(
      'handle','',
      'display_name','',
      'headline','',
      'bio','',
      'links','[]'::jsonb,
      'visibility','private',
      'updated_at',null
    );
  end if;

  return jsonb_build_object(
    'handle',v_row.handle,
    'display_name',v_row.display_name,
    'headline',v_row.headline,
    'bio',v_row.bio,
    'links',v_row.links,
    'visibility',v_row.visibility,
    'updated_at',v_row.updated_at
  );
end
$$;

create or replace function public.set_my_public_profile(
  p_handle text,
  p_headline text default '',
  p_bio text default '',
  p_links jsonb default '[]'::jsonb,
  p_visibility text default 'private'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_person_id uuid := private.current_person_id();
  v_handle text := lower(trim(coalesce(p_handle,'')));
  v_headline text := trim(coalesce(p_headline,''));
  v_bio text := trim(coalesce(p_bio,''));
  v_visibility text := lower(trim(coalesce(p_visibility,'private')));
  v_display_name text;
begin
  if auth.uid() is null or v_person_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    raise exception 'public_handle_invalid' using errcode='22023';
  end if;
  if char_length(v_headline) > 160 then
    raise exception 'public_headline_too_long' using errcode='22023';
  end if;
  if char_length(v_bio) > 2000 then
    raise exception 'public_bio_too_long' using errcode='22023';
  end if;
  if v_visibility not in ('private','public') then
    raise exception 'public_visibility_invalid' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_links,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_links,'[]'::jsonb)) > 6 then
    raise exception 'public_links_invalid' using errcode='22023';
  end if;

  select nullif(trim(display_name),'')
    into v_display_name
    from public.people
   where id = v_person_id
     and status = 'active';

  if v_display_name is null then
    raise exception 'display_name_required' using errcode='22023';
  end if;

  insert into public.person_public_profiles(
    person_id,handle,display_name,headline,bio,links,visibility,updated_at
  ) values (
    v_person_id,v_handle,v_display_name,v_headline,v_bio,coalesce(p_links,'[]'::jsonb),v_visibility,now()
  )
  on conflict(person_id) do update
    set handle=excluded.handle,
        display_name=excluded.display_name,
        headline=excluded.headline,
        bio=excluded.bio,
        links=excluded.links,
        visibility=excluded.visibility,
        updated_at=now();

  return public.get_my_public_profile();
exception
  when unique_violation then
    raise exception 'public_handle_taken' using errcode='23505';
end
$$;

create or replace function public.sync_person_public_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.person_public_profiles
       set display_name = coalesce(nullif(trim(new.display_name),''), display_name),
           updated_at = now()
     where person_id = new.id;
  end if;
  return new;
end
$$;

drop trigger if exists sync_person_public_profile_display_name on public.people;
create trigger sync_person_public_profile_display_name
after update of display_name on public.people
for each row
execute function public.sync_person_public_profile_display_name();

revoke all on function public.get_my_public_profile() from public, anon;
revoke all on function public.set_my_public_profile(text,text,text,jsonb,text) from public, anon;
grant execute on function public.get_my_public_profile() to authenticated;
grant execute on function public.set_my_public_profile(text,text,text,jsonb,text) to authenticated;
