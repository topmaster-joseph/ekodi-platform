-- EKODI External Account Control Center
-- Metadata and delegated-authority references only. Provider credentials remain in service-specific encrypted vaults.
CREATE TABLE IF NOT EXISTS external_account_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  workspace_slug TEXT NOT NULL,
  provider TEXT NOT NULL,
  service_key TEXT NOT NULL DEFAULT 'general',
  provider_account_id TEXT NOT NULL DEFAULT '',
  login_hint TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  connection_mode TEXT NOT NULL DEFAULT 'delegated' CHECK(connection_mode IN ('oauth','delegated','official_handoff','service_account_ref','manual')),
  status TEXT NOT NULL DEFAULT 'pending_authorization' CHECK(status IN ('pending_authorization','active','paused','reconnect_required','revoked','error')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  authority_ref TEXT NOT NULL DEFAULT '',
  credential_ref TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_verified_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  UNIQUE(workspace_slug, provider, service_key, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_external_accounts_workspace
  ON external_account_connections(workspace_slug, status, provider);
CREATE INDEX IF NOT EXISTS idx_external_accounts_provider
  ON external_account_connections(provider, service_key, status);

CREATE TABLE IF NOT EXISTS external_account_audit (
  id TEXT PRIMARY KEY,
  connection_id TEXT,
  workspace_slug TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_account_audit_workspace
  ON external_account_audit(workspace_slug, created_at DESC);
