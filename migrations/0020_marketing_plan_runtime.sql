CREATE TABLE IF NOT EXISTS marketing_usage_monthly (
  workspace_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  caption_used INTEGER NOT NULL DEFAULT 0 CHECK(caption_used >= 0),
  post_used INTEGER NOT NULL DEFAULT 0 CHECK(post_used >= 0),
  shorts_used INTEGER NOT NULL DEFAULT 0 CHECK(shorts_used >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_key, month_key)
);

CREATE TABLE IF NOT EXISTS marketing_channel_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_oauth' CHECK(status IN ('pending_oauth','connected','revoked','error')),
  external_account_id TEXT,
  requested_at TEXT NOT NULL,
  connected_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_channels_workspace
  ON marketing_channel_connections(workspace_key, status);
CREATE INDEX IF NOT EXISTS idx_marketing_channels_provider
  ON marketing_channel_connections(workspace_key, provider, status);

CREATE TABLE IF NOT EXISTS marketing_automation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_key TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('once','scheduled','recurring','always_on')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','waiting_connector','waiting_provider','completed','canceled','error')),
  channel_connection_id INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  next_run_at TEXT,
  interval_minutes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_at TEXT,
  FOREIGN KEY(channel_connection_id) REFERENCES marketing_channel_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_due
  ON marketing_automation_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_marketing_automation_workspace
  ON marketing_automation_jobs(workspace_key, status);

CREATE TABLE IF NOT EXISTS marketing_action_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_key TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','provider_pending','provider_failed','blocked','canceled')),
  channel_connection_id INTEGER,
  metered_amount INTEGER NOT NULL DEFAULT 0 CHECK(metered_amount >= 0),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(channel_connection_id) REFERENCES marketing_channel_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_action_runs_workspace
  ON marketing_action_runs(workspace_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_action_runs_status
  ON marketing_action_runs(status, updated_at);
