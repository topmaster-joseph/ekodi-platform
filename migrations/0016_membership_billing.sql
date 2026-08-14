CREATE TABLE IF NOT EXISTS service_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  site TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'free',
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT '',
  provider_customer_key TEXT,
  billing_key_cipher TEXT,
  billing_key_iv TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  next_billing_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subject_type, subject_key, site)
);

CREATE TABLE IF NOT EXISTS membership_checkout_intents (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('person','tenant')),
  subject_key TEXT NOT NULL,
  site TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  customer_key TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS billing_charge_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  cycle_key TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_payment_key TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(subscription_id) REFERENCES service_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_service_subscriptions_due
  ON service_subscriptions(status, next_billing_at);
CREATE INDEX IF NOT EXISTS idx_membership_checkout_expiry
  ON membership_checkout_intents(status, expires_at);
