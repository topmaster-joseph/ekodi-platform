-- Move EKODI Mall canonical metadata to the root service path.
-- Commercial authority remains EKODIBIZ; tenant/service identity remains ekodimall.
UPDATE customer_tenants
SET domain='ekodi.kr/ekodimall'
WHERE slug='ekodimall';
