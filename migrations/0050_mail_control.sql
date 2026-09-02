-- Tenant-scoped EKODI Mail control. Configuration is provider-neutral and auditable.
-- Actual DNS/provider activation remains an explicit external operation.
CREATE TABLE IF NOT EXISTS mail_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  delivery_mode TEXT NOT NULL DEFAULT 'forward_to_external_inbox',
  routing_provider TEXT NOT NULL DEFAULT 'forward-email',
  routing_status TEXT NOT NULL DEFAULT 'pending_dns',
  outbound_provider TEXT NOT NULL DEFAULT 'unconfigured',
  outbound_status TEXT NOT NULL DEFAULT 'not_configured',
  default_destination TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, hostname)
);

CREATE TABLE IF NOT EXISTS mail_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  domain_id INTEGER NOT NULL,
  local_part TEXT NOT NULL,
  destination_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  send_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(domain_id, local_part),
  FOREIGN KEY(domain_id) REFERENCES mail_domains(id)
);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('person','workspace')),
  owner_key TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  connector_mode TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'pending_connection',
  credential_ref TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_type, owner_key, email_address)
);
CREATE TABLE IF NOT EXISTS mail_account_grants (
  account_id INTEGER NOT NULL,
  principal_type TEXT NOT NULL DEFAULT 'person',
  principal_key TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_send INTEGER NOT NULL DEFAULT 0,
  can_manage INTEGER NOT NULL DEFAULT 0,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id, principal_type, principal_key),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
);

CREATE TABLE IF NOT EXISTS mail_credentials (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_refreshed_at TEXT,
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
);

CREATE TABLE IF NOT EXISTS mail_oauth_states (
  nonce_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  capability TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id)
);

CREATE TABLE IF NOT EXISTS mail_account_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_control_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_domains_workspace ON mail_domains(workspace_id, hostname);
CREATE INDEX IF NOT EXISTS idx_mail_routes_workspace ON mail_routes(workspace_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_owner ON mail_accounts(owner_type, owner_key, enabled);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_email ON mail_accounts(email_address);
CREATE INDEX IF NOT EXISTS idx_mail_account_grants_principal ON mail_account_grants(principal_type, principal_key);
CREATE INDEX IF NOT EXISTS idx_mail_credentials_account ON mail_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_oauth_states_expiry ON mail_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_mail_account_audit_subject ON mail_account_audit(subject_type, subject_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_audit_workspace_time ON mail_control_audit(workspace_id, created_at DESC);
