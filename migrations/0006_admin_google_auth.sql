CREATE TABLE IF NOT EXISTS admin_google_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  required_hd TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator',
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_login_challenges (
  nonce_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_google_status ON admin_google_accounts(status, role);
CREATE INDEX IF NOT EXISTS idx_google_challenge_expiry ON google_login_challenges(expires_at);
