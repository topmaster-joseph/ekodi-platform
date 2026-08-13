-- Canonicalize the Yogurt Purple customer domain and make preregistration schema resilient.
CREATE TABLE IF NOT EXISTS customer_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
);

UPDATE customer_tenants
SET domain = 'yogurt.ekodi.kr'
WHERE slug = 'yogurt' AND domain <> 'yogurt.ekodi.kr';

CREATE INDEX IF NOT EXISTS idx_customer_invites_tenant
ON customer_invites(tenant_id, created_at DESC);
