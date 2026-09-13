-- Move EKODI Mall's canonical public/admin path from /ekodibiz/mall to /ekodibiz/ekodimall.
-- Tenant identity stays ekodimall; only the canonical public domain metadata changes.
UPDATE customer_tenants
SET domain='ekodi.kr/ekodibiz/ekodimall'
WHERE slug='ekodimall';
