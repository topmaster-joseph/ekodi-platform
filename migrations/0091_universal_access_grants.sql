-- EKODI universal scoped access grants.
-- This is grant data only. Authorization semantics remain in ekodi-authorization.js / Trust Layer.
CREATE TABLE IF NOT EXISTS access_scope_grants (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'member'
    CHECK(principal_type IN ('member','external_collaborator','ai')),
  github_username TEXT NOT NULL DEFAULT '',
  scope_type TEXT NOT NULL
    CHECK(scope_type IN ('platform','service','workspace','person')),
  scope_key TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  denied_capabilities_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  expires_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  source_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  UNIQUE(email, scope_type, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_access_scope_grants_scope
  ON access_scope_grants(scope_type, scope_key, enabled, email);
CREATE INDEX IF NOT EXISTS idx_access_scope_grants_email
  ON access_scope_grants(email, enabled, expires_at);

CREATE TABLE IF NOT EXISTS access_scope_grant_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id TEXT,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  target_email TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_scope_grant_audit_scope
  ON access_scope_grant_audit(scope_type, scope_key, created_at DESC);

-- Existing customer-site access stays live and is projected into the universal registry.
-- The customer table remains the compatibility source until every customer login path uses this registry.
INSERT OR IGNORE INTO access_scope_grants
  (id,email,principal_type,github_username,scope_type,scope_key,role,capabilities_json,denied_capabilities_json,enabled,expires_at,note,source_ref,created_at,created_by,updated_at,updated_by)
SELECT
  'customer:' || CAST(a.tenant_id AS TEXT) || ':' || lower(trim(a.email)),
  lower(trim(a.email)),
  COALESCE(NULLIF(a.principal_type,''),'member'),
  COALESCE(a.github_username,''),
  'workspace',
  'customer-tenant:' || CAST(a.tenant_id AS TEXT),
  a.role,
  COALESCE(a.capabilities_json,'[]'),
  COALESCE(a.denied_capabilities_json,'[]'),
  a.enabled,
  a.expires_at,
  COALESCE(a.note,''),
  'customer_access_grants:' || CAST(a.tenant_id AS TEXT),
  a.created_at,
  'migration:0091',
  COALESCE(a.updated_at,a.created_at),
  COALESCE(a.updated_by,'migration:0091')
FROM customer_access_grants a;
