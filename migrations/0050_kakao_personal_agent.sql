CREATE TABLE IF NOT EXISTS kakao_personal_connections (
  admin_email TEXT PRIMARY KEY,
  kakao_user_id TEXT NOT NULL DEFAULT '',
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kakao_personal_oauth_states (
  state_hash TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kakao_personal_send_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  admin_email TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  link_host TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_kakao_personal_history_admin_time
  ON kakao_personal_send_history(admin_email, created_at DESC);
