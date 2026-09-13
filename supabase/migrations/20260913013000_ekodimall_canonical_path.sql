-- Keep the EKODI Mall tenant identity while moving its canonical public/admin path.
UPDATE public.tenants
SET settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
    'domain','ekodi.kr/ekodibiz/ekodimall',
    'site_key','mall'
  )
WHERE slug='ekodimall';
