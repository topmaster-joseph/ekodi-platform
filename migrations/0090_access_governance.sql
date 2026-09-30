ALTER TABLE customer_access_grants ADD COLUMN principal_type TEXT NOT NULL DEFAULT 'member';
ALTER TABLE customer_access_grants ADD COLUMN github_username TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_access_grants ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE customer_access_grants ADD COLUMN denied_capabilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE customer_access_grants ADD COLUMN expires_at TEXT;
ALTER TABLE customer_access_grants ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_access_grants ADD COLUMN updated_at TEXT;
ALTER TABLE customer_access_grants ADD COLUMN updated_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_customer_access_grants_principal_type
  ON customer_access_grants(principal_type);
CREATE INDEX IF NOT EXISTS idx_customer_access_grants_expiry
  ON customer_access_grants(expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_access_grants_tenant_enabled
  ON customer_access_grants(tenant_id, enabled);

CREATE TABLE IF NOT EXISTS customer_access_grant_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES customer_tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_access_grant_audit_tenant_time
  ON customer_access_grant_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_access_grant_audit_email_time
  ON customer_access_grant_audit(email, created_at DESC);
