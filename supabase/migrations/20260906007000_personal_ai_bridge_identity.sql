-- Personal AI Bridge canonical identity projection.
-- Additive only: login providers remain replaceable doors into one EKODI Person.

create or replace function public.current_ekodi_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_person_id uuid;
  v_ekodi_id text;
  v_provider text;
begin
  if v_user_id is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select li.person_id, li.provider, p.ekodi_id
    into v_person_id, v_provider, v_ekodi_id
    from public.login_identities li
    join public.people p on p.id = li.person_id
   where li.auth_user_id = v_user_id
     and li.status = 'active'
     and p.status = 'active'
   limit 1;

  if v_person_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'canonical', false,
      'auth_user_id', v_user_id
    );
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'canonical', true,
    'auth_user_id', v_user_id,
    'person_id', v_person_id,
    'ekodi_id', v_ekodi_id,
    'login_provider', v_provider
  );
end
$$;

revoke all on function public.current_ekodi_identity() from public, anon;
grant execute on function public.current_ekodi_identity() to authenticated;

comment on function public.current_ekodi_identity() is
  'Returns the current authenticated login identity projected onto the canonical EKODI Person/ekodi_id. It never merges accounts by email alone.';
