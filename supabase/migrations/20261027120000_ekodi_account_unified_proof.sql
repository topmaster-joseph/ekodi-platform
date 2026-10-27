-- EKODI account as the single proof of identity, whatever login path was used.
--
-- Before: privileged gates asked "is THIS auth user a Google identity with email X?".
-- After:  they ask "does the EKODI account (person) behind this auth user hold a
--         verified email X?" — so Google, Naver, Kakao (and future paths) that are
--         linked to the same person are treated as the same account.
--
-- Safety: only verified emails count. Google identities are verified by construction;
-- Naver/Kakao identities record the provider's own verification flag (Naver never
-- counts as verified). Email-keyed grants (site_access_registry) now match verified
-- identities only, so an unverified provider email can never claim someone's grant.
-- Additive only.

alter table public.login_identities
  add column if not exists email_verified boolean not null default true;

comment on column public.login_identities.email_verified is
  'True when the login provider verified ownership of email. Google rows are verified; Naver/Kakao rows store the provider flag. Only verified emails authorize email-keyed grants.';

-- One canonical account proof for any auth user of the person.
create or replace function public.ekodi_account_for_auth_user(p_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
  v_result jsonb;
begin
  select person_id into v_person_id
    from public.login_identities
   where auth_user_id = p_auth_user_id and status = 'active'
   limit 1;
  if v_person_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'person_id', v_person_id,
    'ekodi_id', (select p.ekodi_id from public.people p where p.id = v_person_id),
    'current_provider', (select li.provider from public.login_identities li
                          where li.auth_user_id = p_auth_user_id and li.status = 'active' limit 1),
    'providers', coalesce((select jsonb_agg(distinct li.provider order by li.provider)
                             from public.login_identities li
                            where li.person_id = v_person_id and li.status = 'active'), '[]'::jsonb),
    'auth_user_ids', coalesce((select jsonb_agg(li.auth_user_id order by li.is_primary desc, li.linked_at)
                                 from public.login_identities li
                                where li.person_id = v_person_id and li.status = 'active'), '[]'::jsonb),
    'verified_emails', coalesce((
      select jsonb_agg(v.email order by v.is_primary desc, v.linked_at)
        from (
          select distinct on (lower(li.email)) lower(li.email) as email, li.is_primary, li.linked_at
            from public.login_identities li
            left join auth.users u on u.id = li.auth_user_id
           where li.person_id = v_person_id
             and li.status = 'active'
             and li.email_verified
             and nullif(trim(li.provider_subject), '') is not null
             and li.email !~* '^identity\+[a-z0-9_-]+\.[0-9a-f]{32}@ekodi\.kr$'
             and (li.provider <> 'google'
                  or (u.email_confirmed_at is not null and lower(u.email) = lower(li.email)))
           order by lower(li.email), li.is_primary desc, li.linked_at
        ) v), '[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;

revoke all on function public.ekodi_account_for_auth_user(uuid) from public, anon, authenticated;
grant execute on function public.ekodi_account_for_auth_user(uuid) to service_role;
comment on function public.ekodi_account_for_auth_user(uuid) is
  'Canonical EKODI account proof for an auth user: person, ekodi_id, linked login paths, all linked auth users, and verified emails. Gates use this instead of provider = google.';

-- Same body as before; email-keyed grants now require a verified identity email.
create or replace function public.sync_person_access(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_person_id uuid;
begin
  select person_id
    into v_person_id
    from public.login_identities
   where auth_user_id = p_auth_user_id
     and status = 'active'
   limit 1;

  if v_person_id is null then
    return;
  end if;

  insert into public.profiles(user_id)
  select li.auth_user_id
    from public.login_identities li
   where li.person_id = v_person_id and li.status = 'active'
  on conflict (user_id) do nothing;

  -- Memberships follow the person (EKODI account), not whichever login path was used today.
  insert into public.tenant_members(tenant_id, user_id, role, status)
  select distinct tm.tenant_id, target.auth_user_id, tm.role, tm.status
    from public.tenant_members tm
    join public.login_identities source
      on source.auth_user_id = tm.user_id
     and source.person_id = v_person_id
     and source.status = 'active'
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
  on conflict (tenant_id, user_id, role)
  do update set status = excluded.status;

  insert into public.store_members(store_id, user_id, role)
  select distinct sm.store_id, target.auth_user_id, sm.role
    from public.store_members sm
    join public.login_identities source
      on source.auth_user_id = sm.user_id
     and source.person_id = v_person_id
     and source.status = 'active'
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
  on conflict (store_id, user_id, role) do nothing;

  insert into public.tenant_members(tenant_id, user_id, role, status)
  select distinct r.tenant_id, target.auth_user_id, r.role, 'active'
    from public.site_access_registry r
    join public.login_identities source
      on lower(source.email) = lower(r.email)
     and source.person_id = v_person_id
     and source.status = 'active'
     and source.email_verified
    join public.login_identities target
      on target.person_id = v_person_id
     and target.status = 'active'
   where r.tenant_id is not null
     and r.status in ('pre_registered','active')
  on conflict (tenant_id, user_id, role)
  do update set status = 'active';

  update public.site_access_registry r
     set status = 'active', updated_at = now()
   where r.status = 'pre_registered'
     and exists (
       select 1
         from public.login_identities li
        where li.person_id = v_person_id
          and li.status = 'active'
          and li.email_verified
          and lower(li.email) = lower(r.email)
     );

  if exists (
    select 1
      from public.profiles p
      join public.login_identities li on li.auth_user_id = p.user_id
     where li.person_id = v_person_id
       and li.status = 'active'
       and p.platform_admin = true
    union all
    select 1
      from public.site_access_registry r
      join public.login_identities li on lower(li.email) = lower(r.email)
     where li.person_id = v_person_id
       and li.status = 'active'
       and li.email_verified
       and r.status in ('pre_registered','active')
       and (r.site_key = 'admin' or r.role = 'platform_admin')
  ) then
    update public.profiles p
       set platform_admin = true
     where exists (
       select 1
         from public.login_identities li
        where li.person_id = v_person_id
          and li.status = 'active'
          and li.auth_user_id = p.user_id
     );
  end if;
end
$$;

-- Vacant-site admin bootstrap: the actor is identified by the EKODI account, not by
-- which login path the current session used. Error codes are unchanged for clients.
CREATE OR REPLACE FUNCTION public.ekodi_bootstrap_vacant_site_admin(p_actor_user_id uuid, p_tenant_slug text, p_site_key text, p_target_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tenant public.tenants%rowtype;
  v_account jsonb;
  v_target_email text := lower(btrim(coalesce(p_target_email,'')));
  v_site_key text := lower(btrim(coalesce(p_site_key,'')));
  v_verified boolean := false;
  v_admin boolean := false;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
  END IF;
  IF v_target_email !~* '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
      OR length(v_target_email) > 254
      OR v_site_key !~ '^[a-z0-9][a-z0-9_-]{1,59}$' THEN
    RETURN jsonb_build_object('ok',false,'code','INVALID_INPUT');
  END IF;

  -- Actor must be a verified EKODI account (any linked login path).
  v_account := public.ekodi_account_for_auth_user(p_actor_user_id);
  v_verified := v_account IS NOT NULL AND jsonb_array_length(coalesce(v_account->'verified_emails','[]'::jsonb)) > 0;
  IF NOT coalesce(v_verified,false) THEN
    RETURN jsonb_build_object('ok',false,'code','VERIFIED_GOOGLE_SUPER_ADMIN_REQUIRED');
  END IF;
  SELECT EXISTS(
      SELECT 1 FROM public.profiles p
      WHERE p.platform_admin=true
        AND p.user_id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(v_account->'auth_user_ids') x))
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(v_account->'verified_emails') e
      WHERE e IN ('topmaster.joseph@gmail.com','joseph@ekodi.kr'))
  INTO v_admin;
  IF NOT coalesce(v_admin,false) THEN
    RETURN jsonb_build_object('ok',false,'code','SUPER_ADMIN_REQUIRED');
  END IF;

  SELECT * INTO v_tenant FROM public.tenants
  WHERE slug=lower(btrim(coalesce(p_tenant_slug,''))) AND status='active'
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','TENANT_NOT_FOUND'); END IF;
  IF NOT (v_site_key=lower(coalesce(v_tenant.settings->>'site_key',''))
      OR (v_tenant.settings->>'site_key' IS NULL AND v_site_key=v_tenant.slug)) THEN
    RETURN jsonb_build_object('ok',false,'code','SITE_TENANT_MISMATCH');
  END IF;

  -- Serialize competing attempts against this tenant before checking vacancy.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant.id::text, 20261018));

  IF EXISTS(
    SELECT 1 FROM public.site_access_registry r
    WHERE r.tenant_id=v_tenant.id AND r.site_key=v_site_key
      AND r.status='active' AND r.role::text IN ('tenant_admin','platform_admin','store_owner')
  ) OR EXISTS(
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id=v_tenant.id AND m.status='active'
      AND m.role::text IN ('tenant_admin','platform_admin','store_owner')
  ) THEN
    RETURN jsonb_build_object('ok',false,'code','SITE_ALREADY_HAS_ADMIN');
  END IF;
  -- An existing church pastor also counts as a site administrator.
  IF v_site_key='church' AND EXISTS(
    SELECT 1 FROM church.staff s WHERE s.tenant_id=v_tenant.id
      AND s.active=true AND s.role IN ('senior_pastor','pastor')
  ) THEN
    RETURN jsonb_build_object('ok',false,'code','SITE_ALREADY_HAS_ADMIN');
  END IF;

  INSERT INTO public.site_access_registry
    (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
  VALUES
    (v_target_email,v_site_key,v_tenant.id,'tenant_admin'::public.app_role,
     'active','super_admin_vacant_site_bootstrap',
     'EKODI-account verified super administrator / vacant-site registration','standard',now(),now())
  ON CONFLICT (email,site_key,tenant_id,role) DO UPDATE
  SET status='active', source=excluded.source, note=excluded.note, updated_at=now();

  INSERT INTO public.site_admin_bootstrap_audit
    (tenant_id,site_key,actor_user_id,target_email)
  VALUES(v_tenant.id,v_site_key,p_actor_user_id,v_target_email);

  RETURN jsonb_build_object('ok',true,'site',v_site_key,
    'tenant',v_tenant.slug,'email',v_target_email,'role','tenant_admin');
END;
$function$;
