CREATE TABLE IF NOT EXISTS user_ai_preferences (
  user_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'auto',
  preferred_provider TEXT NOT NULL DEFAULT 'gemini-api',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_ai_credentials (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  secret_cipher TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  site TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  funding TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_ai_usage_month
  ON user_ai_usage(user_id, site, funding, created_at);
