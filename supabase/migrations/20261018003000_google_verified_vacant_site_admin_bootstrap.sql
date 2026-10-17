-- EKODI protected vacant-site administrator bootstrap.
-- Google verifies identity; only two designated, Google-bound platform super administrators
-- (or an existing platform administrator with an active Google identity) may grant a vacant tenant.
-- This function never creates accounts or authenticates Google passwords.
CREATE TABLE IF NOT EXISTS public.site_admin_bootstrap_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  site_key text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_email text NOT NULL,
  action text NOT NULL DEFAULT 'vacant_site_bootstrap',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_admin_bootstrap_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_admin_bootstrap_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.site_admin_bootstrap_audit TO service_role;

CREATE OR REPLACE FUNCTION public.ekodi_bootstrap_vacant_site_admin(
  p_actor_user_id uuid,
  p_tenant_slug text,
  p_site_key text,
  p_target_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant public.tenants%rowtype;
  v_actor_email text;
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

  -- Actor must have completed an actual first-party Google identity exchange.
  SELECT lower(u.email), EXISTS (
    SELECT 1 FROM public.login_identities li
    WHERE li.auth_user_id=u.id AND li.status='active'
      AND li.provider='google'
      AND lower(li.email)=lower(u.email)
      AND coalesce(li.provider_subject,'')<>''
  ) INTO v_actor_email, v_verified
  FROM auth.users u
  WHERE u.id=p_actor_user_id AND u.email_confirmed_at IS NOT NULL;
  IF NOT coalesce(v_verified,false) THEN
    RETURN jsonb_build_object('ok',false,'code','VERIFIED_GOOGLE_SUPER_ADMIN_REQUIRED');
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_actor_user_id AND p.platform_admin=true)
    OR v_actor_email IN ('topmaster.joseph@gmail.com','joseph@ekodi.kr')
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
     'Google-verified super administrator / vacant-site registration','standard',now(),now())
  ON CONFLICT (email,site_key,tenant_id,role) DO UPDATE
  SET status='active', source=excluded.source, note=excluded.note, updated_at=now();

  INSERT INTO public.site_admin_bootstrap_audit
    (tenant_id,site_key,actor_user_id,target_email)
  VALUES(v_tenant.id,v_site_key,p_actor_user_id,v_target_email);

  RETURN jsonb_build_object('ok',true,'site',v_site_key,
    'tenant',v_tenant.slug,'email',v_target_email,'role','tenant_admin');
END;
$$;
REVOKE ALL ON FUNCTION public.ekodi_bootstrap_vacant_site_admin(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ekodi_bootstrap_vacant_site_admin(uuid,text,text,text) TO service_role;

-- Explicit church additional administrator: pre-registration does not bypass Google.
-- No church.staff identity row is made until the Google identity has been verified.
INSERT INTO public.site_access_registry
  (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
SELECT 'ekodichurch@gmail.com','church',t.id,
  'tenant_admin'::public.app_role,'active','church_google_additional_admin',
  'Additional church administrator, effective only after verified Google identity',
  'standard',now(),now()
FROM public.tenants t WHERE t.slug='ekodi-church' AND t.status='active'
ON CONFLICT(email,site_key,tenant_id,role) DO UPDATE
SET status='active',source=excluded.source,note=excluded.note,updated_at=now();

INSERT INTO church.staff(tenant_id,church_slug,user_id,email,display_name,role,active)
SELECT t.id,'ekodi-church',u.id,lower(u.email),'에코디교회 관리자','pastor',true
FROM public.tenants t
JOIN auth.users u ON lower(u.email)='ekodichurch@gmail.com'
JOIN public.login_identities li ON li.auth_user_id=u.id
  AND li.provider='google' AND li.status='active'
  AND lower(li.email)=lower(u.email)
WHERE t.slug='ekodi-church' AND t.status='active'
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT(tenant_id,user_id) DO NOTHING;

-- The two owner-designated platform recovery identities also receive an explicit
-- Church-site grant for RLS-protected worship editing. Google sign-in and matching
-- the real provider subject remain mandatory before the grant can be consumed.
INSERT INTO public.site_access_registry
  (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
SELECT a.email,'church',t.id,'tenant_admin'::public.app_role,'active',
  'platform_super_admin_explicit_church',
  'Owner-designated platform super administrator; Google identity required',
  'standard',now(),now()
FROM (VALUES ('topmaster.joseph@gmail.com'),('joseph@ekodi.kr')) AS a(email)
JOIN public.tenants t ON t.slug='ekodi-church' AND t.status='active'
ON CONFLICT(email,site_key,tenant_id,role) DO UPDATE
SET status='active',source=excluded.source,note=excluded.note,updated_at=now();
