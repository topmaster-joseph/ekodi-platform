CREATE TABLE IF NOT EXISTS admin_privileged_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_privileged_expiry
  ON admin_privileged_sessions(expires_at);
