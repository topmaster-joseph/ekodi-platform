-- Fail closed when an email-backed Supabase auth user is presented by a different
-- Google subject. Email addresses may be recycled by employers; provider_subject is
-- the stable identity key and must never be silently replaced.

create or replace function public.ensure_person_identity(
  p_auth_user_id uuid,
  p_provider text,
  p_provider_subject text,
  p_email text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
  v_subject_person_id uuid;
  v_subject_auth_user_id uuid;
  v_existing_provider text;
  v_existing_subject text;
  v_primary_exists boolean;
begin
  if p_auth_user_id is null
     or nullif(trim(p_provider),'') is null
     or nullif(trim(p_provider_subject),'') is null
     or nullif(trim(p_email),'') is null then
    raise exception 'identity_fields_required';
  end if;

  select person_id, provider, provider_subject
    into v_person_id, v_existing_provider, v_existing_subject
    from public.login_identities
   where auth_user_id = p_auth_user_id
     and status = 'active'
   limit 1;

  select person_id, auth_user_id
    into v_subject_person_id, v_subject_auth_user_id
    from public.login_identities
   where provider = lower(trim(p_provider))
     and provider_subject = trim(p_provider_subject)
     and status = 'active'
   limit 1;

  if v_person_id is not null then
    -- The Supabase auth user is email-addressed. Never let a newly recycled email
    -- replace the Google subject already bound to this EKODI identity.
    if v_existing_provider <> lower(trim(p_provider))
       or v_existing_subject <> trim(p_provider_subject) then
      raise exception 'identity_subject_conflict';
    end if;

    if v_subject_person_id is not null and v_subject_person_id <> v_person_id then
      raise exception 'identity_already_linked';
    end if;

    update public.login_identities
       set email = lower(trim(p_email)),
           last_seen_at = now()
     where auth_user_id = p_auth_user_id;

    update public.people
       set display_name = coalesce(nullif(trim(p_display_name),''), display_name),
           updated_at = now()
     where id = v_person_id;
    return v_person_id;
  end if;

  -- A stable Google subject already bound to a different Supabase auth user is not
  -- silently moved during login. That recovery requires an explicit linked-account flow.
  if v_subject_person_id is not null then
    if v_subject_auth_user_id <> p_auth_user_id then
      raise exception 'identity_subject_requires_relink';
    end if;
    return v_subject_person_id;
  end if;

  insert into public.people(display_name)
  values (nullif(trim(p_display_name),''))
  returning id into v_person_id;

  select exists(
    select 1 from public.login_identities
     where person_id = v_person_id and status = 'active' and is_primary = true
  ) into v_primary_exists;

  insert into public.login_identities(
    person_id, auth_user_id, provider, provider_subject, email, is_primary
  ) values (
    v_person_id,
    p_auth_user_id,
    lower(trim(p_provider)),
    trim(p_provider_subject),
    lower(trim(p_email)),
    not v_primary_exists
  );

  return v_person_id;
end
$$;

create or replace function public.link_person_identity(
  p_initiator_user_id uuid,
  p_target_user_id uuid,
  p_provider text,
  p_provider_subject text,
  p_email text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
  v_target_person_id uuid;
  v_subject_person_id uuid;
  v_subject_auth_user_id uuid;
  v_target_provider text;
  v_target_subject text;
  v_target_display_name text;
begin
  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = p_initiator_user_id
     and status = 'active'
   limit 1;

  if v_person_id is null then
    raise exception 'initiator_person_required';
  end if;

  select person_id, provider, provider_subject
    into v_target_person_id, v_target_provider, v_target_subject
    from public.login_identities
   where auth_user_id = p_target_user_id
     and status = 'active'
   limit 1;

  -- Explicit linking proves control of the presented Google credential, but an email
  -- may have been reassigned. Refuse to merge a prior person's record unless the target
  -- auth user is already bound to the exact same stable provider subject.
  if v_target_person_id is not null
     and (v_target_provider <> lower(trim(p_provider))
          or v_target_subject <> trim(p_provider_subject)) then
    raise exception 'target_identity_subject_conflict';
  end if;

  select person_id, auth_user_id
    into v_subject_person_id, v_subject_auth_user_id
    from public.login_identities
   where provider = lower(trim(p_provider))
     and provider_subject = trim(p_provider_subject)
     and status = 'active'
   limit 1;

  if v_subject_person_id is not null
     and v_subject_person_id <> v_person_id
     and (v_target_person_id is null or v_subject_person_id <> v_target_person_id) then
    raise exception 'identity_already_linked';
  end if;

  if v_target_person_id is not null and v_target_person_id <> v_person_id then
    select display_name into v_target_display_name
      from public.people where id = v_target_person_id;

    update public.login_identities
       set person_id = v_person_id,
           is_primary = false
     where person_id = v_target_person_id;

    update public.people
       set status = 'merged', updated_at = now()
     where id = v_target_person_id;

    update public.people
       set display_name = coalesce(display_name, v_target_display_name, nullif(trim(p_display_name),'')),
           updated_at = now()
     where id = v_person_id;
  end if;

  if exists (
    select 1 from public.login_identities
     where auth_user_id = p_target_user_id
       and person_id = v_person_id
  ) then
    update public.login_identities
       set email = lower(trim(p_email)),
           status = 'active',
           last_seen_at = now()
     where auth_user_id = p_target_user_id;
  elsif v_subject_person_id = v_person_id and v_subject_auth_user_id is not null then
    -- The subject is already linked to the current person. Do not create a duplicate
    -- identity row or silently move it to an email-derived auth user here.
    if v_subject_auth_user_id <> p_target_user_id then
      raise exception 'identity_subject_requires_relink';
    end if;
    update public.login_identities
       set email = lower(trim(p_email)),
           last_seen_at = now()
     where auth_user_id = v_subject_auth_user_id;
  else
    insert into public.login_identities(
      person_id, auth_user_id, provider, provider_subject, email, is_primary
    ) values (
      v_person_id,
      p_target_user_id,
      lower(trim(p_provider)),
      trim(p_provider_subject),
      lower(trim(p_email)),
      false
    );
  end if;

  update public.people
     set display_name = coalesce(display_name, nullif(trim(p_display_name),'')),
         updated_at = now()
   where id = v_person_id;

  return v_person_id;
end
$$;

-- A person should have at most one active primary login identity, including after
-- merging two separately initialized Person records.
create unique index if not exists login_identities_one_active_primary_idx
  on public.login_identities(person_id)
  where is_primary = true and status = 'active';

-- Person/identity rows are server-owned. RLS already blocks rows, and direct table
-- privileges are revoked as defense in depth; user-facing reads go through scoped RPCs.
revoke all on table public.people, public.login_identities from anon, authenticated;
grant select, insert, update, delete on table public.people, public.login_identities to service_role;

revoke all on function public.ensure_person_identity(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.link_person_identity(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.ensure_person_identity(uuid,text,text,text,text) to service_role;
grant execute on function public.link_person_identity(uuid,uuid,text,text,text,text) to service_role;

comment on function public.ensure_person_identity(uuid,text,text,text,text) is
  'Creates or refreshes a person identity without ever replacing an existing stable provider subject based on recycled email.';
comment on function public.link_person_identity(uuid,uuid,text,text,text,text) is
  'Explicitly links verified login identities; blocks merges when an email-backed auth user is bound to a different provider subject.';
