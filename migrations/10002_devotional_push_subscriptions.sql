-- EKODI devotional push subscriptions; execute only through reviewed migration.
CREATE TABLE IF NOT EXISTS devotional_push_subscriptions (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL CHECK(site IN ('mission','church')),
  endpoint TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TEXT,
  last_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site, endpoint_hash)
);
CREATE INDEX IF NOT EXISTS idx_devotional_push_active
  ON devotional_push_subscriptions(site,disabled_at);
CREATE TABLE IF NOT EXISTS devotional_push_deliveries (
  delivery_key TEXT PRIMARY KEY,
  site TEXT NOT NULL CHECK(site IN ('mission','church')),
  subscription_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('claimed','sent','failed','expired')),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_code TEXT,
  FOREIGN KEY(subscription_id) REFERENCES devotional_push_subscriptions(id)
);
CREATE INDEX IF NOT EXISTS idx_devotional_push_deliveries_date
  ON devotional_push_deliveries(local_date,site,status);
