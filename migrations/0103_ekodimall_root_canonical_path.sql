-- Move EKODI Mall canonical metadata to the root path.
-- Older /ekodibiz/ekodimall, /ekodibiz/mall and /mall routes remain edge redirects only.
UPDATE customer_tenants
SET domain='ekodi.kr/ekodimall'
WHERE slug='ekodimall'
  AND domain <> 'ekodi.kr/ekodimall';
