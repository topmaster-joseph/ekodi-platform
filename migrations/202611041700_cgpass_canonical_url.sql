-- EKODI CGPASS-URL-20261104 — canonical address only; no tenant/grant rekey.
-- Keep legacy public/admin entry points as 308 redirects in the Shared Site router.
-- Never touch provider API keys, payments, access grants, or merchant financial data.
UPDATE customer_tenants
SET domain = 'ekodi.kr/cgpass'
WHERE slug = 'cheonggye-pass'
  AND lower(trim(domain)) IN ('ekodi.kr/cheonggye/pass','ekodi.kr/cheonggyepass');

UPDATE public_site_controls
SET domain = 'ekodi.kr/cgpass'
WHERE site_id = 'cheonggye-pass'
  AND lower(trim(domain)) IN ('ekodi.kr/cheonggye/pass','ekodi.kr/cheonggyepass');
