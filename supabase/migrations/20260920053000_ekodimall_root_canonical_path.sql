-- EKODI Mall canonical root is independent from EKODIBIZ.
UPDATE public.tenants
SET settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
    'domain','ekodi.kr/ekodimall',
    'site_key','mall',
    'public_path','/ekodimall',
    'admin_path','/ekodimall/admin'
  )
WHERE slug='ekodimall';
