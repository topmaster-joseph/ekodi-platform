-- Move EKODI Mall metadata to the independent apex-path canonical surface.
-- Historical migrations remain unchanged; old browser paths are compatibility redirects only.
UPDATE customer_tenants
SET domain='ekodi.kr/ekodimall'
WHERE slug='ekodimall'
  AND coalesce(domain,'') <> 'ekodi.kr/ekodimall';
