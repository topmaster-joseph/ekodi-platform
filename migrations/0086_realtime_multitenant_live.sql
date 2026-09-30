-- Register the Mokpo National University back-gate autonomous commercial district cooperative
-- as an equal EKODI operating tenant for shared Realtime Live services.
INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
VALUES('mokdaehumun','목대후문 자율상권조합','ekodi.kr/mokdaehumun','active',CURRENT_TIMESTAMP);

-- Keep canonical path metadata for EKODI-owned operating organizations aligned
-- with the root-path domain constitution. External official domains remain untouched.
UPDATE customer_tenants SET domain='ekodi.kr/ekodichurch' WHERE slug='ekodi-church';
UPDATE customer_tenants SET domain='ekodi.kr/ekodibiz' WHERE slug='ekodi-biz';
UPDATE customer_tenants SET domain='ekodi.kr/ekodilab' WHERE slug='ekodi-lab';
UPDATE customer_tenants SET domain='ekodi.kr/jadam' WHERE slug='jadam';
UPDATE customer_tenants SET domain='ekodi.kr/pizzamaru' WHERE slug='pizzamaru';
UPDATE customer_tenants SET domain='ekodi.kr/yogurt' WHERE slug='yogurt';
