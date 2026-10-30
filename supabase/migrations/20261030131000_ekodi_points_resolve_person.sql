-- Server-only bridge from one authenticated provider session to EKODI canonical person.
-- The backend MUST verify the access JWT (auth.getUser) before passing the auth id.
-- Never resolve by matching email, and never accept a browser-supplied auth id.
create or replace function ekodi_points_private.resolve_person_for_auth(p_auth_user uuid)
returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_person uuid;
  v_count integer;
begin
  if p_auth_user is null then return null; end if;
  select count(distinct li.person_id),(array_agg(li.person_id))[1]
    into v_count,v_person
  from public.login_identities li
  join public.people p on p.id=li.person_id
  where li.auth_user_id=p_auth_user
    and li.status='active'
    and p.status='active';
  if v_count=0 then return null; end if;
  if v_count<>1 then raise exception 'AMBIGUOUS_EKODI_IDENTITY'; end if;
  return v_person;
end;
$$;
revoke all on function ekodi_points_private.resolve_person_for_auth(uuid)
  from public,anon,authenticated;
grant execute on function ekodi_points_private.resolve_person_for_auth(uuid)
  to service_role;
