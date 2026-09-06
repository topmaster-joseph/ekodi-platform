-- Ensure the EKODIBIZ operating Google account can manage tenant-scoped channel connections.
INSERT INTO customer_access_grants (
  tenant_id,email,role,enabled,created_at,last_verified_at
)
SELECT id,'ekodibiz@gmail.com','hq_manager',1,CURRENT_TIMESTAMP,NULL
FROM customer_tenants
WHERE slug='ekodibiz'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='hq_manager',
  enabled=1;
