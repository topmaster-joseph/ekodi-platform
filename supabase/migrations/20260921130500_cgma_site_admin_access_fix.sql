-- Repair CGMA tenant-local administrator registration against the production canonical tenant.
-- Production uses tenant slug 'cheonggye' while site_key remains 'cgma'.
-- Resolve by existing site_key first so future slug changes do not break this migration.

WITH cgma_tenant AS (
  SELECT t.id
    FROM public.tenants t
   WHERE EXISTS (
           SELECT 1
             FROM public.site_access_registry r
            WHERE r.tenant_id=t.id
              AND r.site_key='cgma'
         )
      OR t.slug IN ('cgma','cheonggye')
   ORDER BY
     CASE
       WHEN EXISTS (
         SELECT 1 FROM public.site_access_registry r
          WHERE r.tenant_id=t.id AND r.site_key='cgma'
       ) THEN 0
       WHEN t.slug='cheonggye' THEN 1
       ELSE 2
     END
   LIMIT 1
)
UPDATE public.tenants t
   SET settings = coalesce(t.settings,'{}'::jsonb)
     || jsonb_build_object(
          'operating_model','customer-site',
          'site_key','cgma',
          'domain','ekodi.kr/cgma',
          'default_activity_role','association_admin',
          'default_activity_role_label','상인회 관리자'
        )
  FROM cgma_tenant c
 WHERE t.id=c.id;

WITH cgma_tenant AS (
  SELECT t.id
    FROM public.tenants t
   WHERE EXISTS (
           SELECT 1
             FROM public.site_access_registry r
            WHERE r.tenant_id=t.id
              AND r.site_key='cgma'
         )
      OR t.slug IN ('cgma','cheonggye')
   ORDER BY
     CASE
       WHEN EXISTS (
         SELECT 1 FROM public.site_access_registry r
          WHERE r.tenant_id=t.id AND r.site_key='cgma'
       ) THEN 0
       WHEN t.slug='cheonggye' THEN 1
       ELSE 2
     END
   LIMIT 1
),
admins(email,note) AS (
  VALUES
    ('cgma4989@gmail.com','공용 계정 · 사이트 책임관리자'),
    ('topmaster.joseph@gmail.com','정찬균 · 사이트 관리자'),
    ('mijini0430@gmail.com','정미진 · 사이트 관리자'),
    ('matrixism@gmail.com','김전일 · 사이트 관리자'),
    ('rokmc895tak@gmail.com','정경탁 · 사이트 관리자'),
    ('allforyou3957@gmail.com','김정윤 · 사이트 관리자')
)
INSERT INTO public.site_access_registry
  (email,site_key,tenant_id,role,status,source,note,plan,created_at,updated_at)
SELECT
  lower(a.email),
  'cgma',
  c.id,
  'tenant_admin'::public.app_role,
  'active',
  'cgma_site_admin_registry',
  a.note,
  'standard',
  now(),
  now()
FROM admins a
CROSS JOIN cgma_tenant c
ON CONFLICT (email,site_key,tenant_id,role) DO UPDATE
SET status='active',
    source=excluded.source,
    note=excluded.note,
    plan=excluded.plan,
    updated_at=now();
