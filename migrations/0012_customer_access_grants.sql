CREATE TABLE IF NOT EXISTS customer_access_grants (
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by INTEGER,
  last_verified_at TEXT,
  PRIMARY KEY (tenant_id, email),
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_access_grants_email
  ON customer_access_grants(email);

INSERT OR IGNORE INTO customer_access_grants
  (tenant_id, email, role, enabled, created_at, last_verified_at)
SELECT
  m.tenant_id,
  lower(trim(u.email)),
  m.role,
  CASE WHEN u.status = 'active' AND m.status <> 'disabled' THEN 1 ELSE 0 END,
  m.created_at,
  u.last_login_at
FROM customer_memberships m
JOIN customer_users u ON u.id = m.user_id
WHERE trim(u.email) <> '';
