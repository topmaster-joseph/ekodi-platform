CREATE TABLE IF NOT EXISTS affiliate_providers (
  provider_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider_kind TEXT NOT NULL DEFAULT 'affiliate',
  connection_mode TEXT NOT NULL DEFAULT 'manual',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_accounts (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'internal',
  owner_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'manual_ready',
  connection_mode TEXT NOT NULL DEFAULT 'manual',
  default_channel TEXT NOT NULL DEFAULT '',
  disclosure_text TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (provider_key) REFERENCES affiliate_providers(provider_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_provider ON affiliate_accounts(provider_key);
CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_owner ON affiliate_accounts(owner_type, owner_key);

CREATE TABLE IF NOT EXISTS affiliate_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  tenant_slug TEXT,
  product_name TEXT NOT NULL,
  destination_url TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  campaign_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES affiliate_accounts(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links_account_time ON affiliate_links(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_tenant ON affiliate_links(tenant_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_campaign ON affiliate_links(campaign_name, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue_krw INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  recorded_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, metric_date, source),
  FOREIGN KEY (account_id) REFERENCES affiliate_accounts(id),
  FOREIGN KEY (recorded_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_metrics_account_date ON affiliate_daily_metrics(account_id, metric_date DESC);

INSERT OR IGNORE INTO affiliate_providers
  (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at)
VALUES
  ('coupang_partners', 'Coupang Partners', 'affiliate', 'manual', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO affiliate_accounts
  (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at)
VALUES
  ('coupang-ekodibiz', 'coupang_partners', 'internal', 'ekodibiz', '에코디비즈 쿠팡파트너스', 'EKODIBIZ', 'manual_ready', 'manual', '', '', 1, datetime('now'), datetime('now'));
