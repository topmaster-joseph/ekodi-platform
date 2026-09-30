-- EKODI Marketing Growth Connector Gateway.
-- OAuth provider tokens are encrypted with AES-GCM before D1 persistence.
-- Browser clients only receive connection metadata, never credentials.

CREATE TABLE IF NOT EXISTS marketing_oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'publish' CHECK(mode IN ('publish','paid')),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  return_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS marketing_oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  token_ciphertext TEXT NOT NULL,
  token_expires_at TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked','error','paused')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_check_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type, subject_key, provider, resource_type, external_id)
);

CREATE TABLE IF NOT EXISTS marketing_growth_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant','store')),
  subject_key TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'organic' CHECK(mode IN ('organic','paid')),
  provider TEXT NOT NULL DEFAULT 'multi',
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'traffic',
  target_url TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  daily_budget_krw INTEGER NOT NULL DEFAULT 0 CHECK(daily_budget_krw >= 0),
  total_budget_krw INTEGER NOT NULL DEFAULT 0 CHECK(total_budget_krw >= 0),
  approval_state TEXT NOT NULL DEFAULT 'draft' CHECK(approval_state IN ('draft','approved','rejected')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','paused','active','completed','failed')),
  connection_ids_json TEXT NOT NULL DEFAULT '[]',
  ad_account_connection_id INTEGER,
  content_json TEXT NOT NULL DEFAULT '{}',
  external_campaign_id TEXT NOT NULL DEFAULT '',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_oauth_states_expiry
  ON marketing_oauth_states(provider, expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_marketing_oauth_connections_subject
  ON marketing_oauth_connections(subject_type, subject_key, status, provider);
CREATE INDEX IF NOT EXISTS idx_marketing_growth_campaigns_subject
  ON marketing_growth_campaigns(subject_type, subject_key, created_at DESC);
