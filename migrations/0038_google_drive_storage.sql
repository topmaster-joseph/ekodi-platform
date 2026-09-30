CREATE TABLE IF NOT EXISTS storage_connections (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'google_drive',
  role TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  account_email TEXT NOT NULL,
  account_domain TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  drive_id TEXT NOT NULL DEFAULT '',
  drive_name TEXT NOT NULL DEFAULT '',
  drive_root_id TEXT NOT NULL DEFAULT '',
  archive_root_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','ready','disabled')),
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_verified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_primary_active
  ON storage_connections(role)
  WHERE role = 'primary' AND status != 'disabled';
CREATE INDEX IF NOT EXISTS idx_storage_connections_email
  ON storage_connections(account_email, status);

CREATE TABLE IF NOT EXISTS storage_routes (
  service_key TEXT PRIMARY KEY,
  folder_key TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  folder_id TEXT NOT NULL DEFAULT '',
  connection_role TEXT NOT NULL DEFAULT 'primary' CHECK (connection_role IN ('primary','secondary')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_oauth_states (
  nonce_hash TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  connection_role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_storage_oauth_expiry ON storage_oauth_states(expires_at);

INSERT OR IGNORE INTO storage_routes(service_key, folder_key, folder_name, connection_role, updated_at) VALUES
  ('core','01_CORE','01_CORE','primary',datetime('now')),
  ('church','02_CHURCH','02_CHURCH','primary',datetime('now')),
  ('biz','03_BIZ','03_BIZ','primary',datetime('now')),
  ('books','04_BOOKS','04_BOOKS','primary',datetime('now')),
  ('community','05_COMMUNITY','05_COMMUNITY','primary',datetime('now')),
  ('work','06_WORK','06_WORK','primary',datetime('now')),
  ('education','07_EDUCATION','07_EDUCATION','primary',datetime('now')),
  ('media','08_MEDIA','08_MEDIA','primary',datetime('now')),
  ('camp','09_CAMP','09_CAMP','primary',datetime('now')),
  ('backup','99_BACKUP','99_BACKUP','primary',datetime('now'));
