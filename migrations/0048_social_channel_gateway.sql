-- Direct social channel gateway: provider connections, campaign queue, publishing evidence, metrics and learning.
CREATE TABLE IF NOT EXISTS social_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  account_handle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connected',
  token_ciphertext TEXT NOT NULL,
  token_expires_at TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  UNIQUE(tenant_id, provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_connections_tenant ON social_connections(tenant_id, provider, status);

CREATE TABLE IF NOT EXISTS social_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  return_url TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_expiry ON social_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS social_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_tenant ON social_campaigns(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  campaign_id TEXT,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  message TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  asset_url TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT '',
  destination_url TEXT NOT NULL DEFAULT '',
  tracked_url TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,
  published_at TEXT,
  provider_post_id TEXT NOT NULL DEFAULT '',
  provider_url TEXT NOT NULL DEFAULT '',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_message TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(connection_id) REFERENCES social_connections(id)
);
CREATE INDEX IF NOT EXISTS idx_social_posts_queue ON social_posts(state, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_tenant ON social_posts(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_publish_attempts (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_http_status INTEGER,
  provider_object_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  FOREIGN KEY(post_id) REFERENCES social_posts(id)
);
CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_post ON social_publish_attempts(post_id, attempt_no DESC);

CREATE TABLE IF NOT EXISTS social_post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL,
  UNIQUE(post_id, metric_name, collected_at)
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_post_metrics(post_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS social_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  post_id TEXT,
  campaign_id TEXT,
  event_type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  anonymous_id TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_events_post ON social_events(post_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_events_tenant ON social_events(tenant_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS social_learnings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  pattern_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, provider, pattern_key)
);
CREATE INDEX IF NOT EXISTS idx_social_learnings_tenant ON social_learnings(tenant_id, confidence DESC, updated_at DESC);
