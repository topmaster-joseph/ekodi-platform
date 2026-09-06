-- Allow EKODIBIZ operators to manage tenant-scoped channel connections.
-- The YouTube channel itself remains owned by ekodibiz@gmail.com via Google OAuth.
INSERT INTO customer_access_grants (
  tenant_id,email,role,enabled,created_at,last_verified_at
)
SELECT t.id, operator.email, 'hq_manager', 1, CURRENT_TIMESTAMP, NULL
FROM customer_tenants t
CROSS JOIN (
  SELECT 'ekodibiz@gmail.com' AS email
  UNION ALL SELECT 'topmaster.joseph@gmail.com'
  UNION ALL SELECT 'joseph@ekodi.kr'
) operator
WHERE t.slug='ekodibiz'
ON CONFLICT(tenant_id,email) DO UPDATE SET
  role='hq_manager',
  enabled=1;
