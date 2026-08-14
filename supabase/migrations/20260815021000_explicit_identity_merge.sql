-- When two Google accounts were each used before the user linked them, both may already
-- have their own person row. Explicit linking proves control of the current session and
-- the target Google credential, so merge those person records instead of forcing an
-- administrator-only recovery path.

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

  select person_id
    into v_target_person_id
    from public.login_identities
   where auth_user_id = p_target_user_id
     and status = 'active'
   limit 1;

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
       set person_id = v_person_id
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
       set provider = lower(trim(p_provider)),
           provider_subject = trim(p_provider_subject),
           email = lower(trim(p_email)),
           status = 'active',
           last_seen_at = now()
     where auth_user_id = p_target_user_id;
  elsif v_subject_person_id = v_person_id and v_subject_auth_user_id is not null then
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

revoke all on function public.link_person_identity(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.link_person_identity(uuid,uuid,text,text,text,text) to service_role;
