-- Keep the EKODI Mall tenant identity while making /ekodimall the canonical public/admin path.
UPDATE public.tenants
SET settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
    'domain','ekodi.kr/ekodimall',
    'site_key','mall'
  )
WHERE slug='ekodimall';
