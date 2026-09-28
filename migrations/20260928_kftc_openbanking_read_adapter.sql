-- EKODI KFTC Open Banking read-only adapter.
-- OAuth tokens and fintech_use_num are stored only inside AES-GCM ciphertext.
-- No transfer execution data or raw account number is stored by this adapter.

CREATE TABLE IF NOT EXISTS money_kftc_oauth_states (
  nonce_hash TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  workspace_key TEXT NOT NULL DEFAULT '',
  return_to TEXT NOT NULL DEFAULT '',
  requested_scope TEXT NOT NULL DEFAULT 'inquiry',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_kftc_oauth_states_expiry
ON money_kftc_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS money_kftc_connections (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  workspace_key TEXT NOT NULL DEFAULT '',
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  granted_scope TEXT NOT NULL DEFAULT 'inquiry',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','revoked','error')),
  consented_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_kftc_connections_actor
ON money_kftc_connections(actor_user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS money_kftc_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT,
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_money_kftc_audit_connection
ON money_kftc_audit(connection_id,created_at DESC);
