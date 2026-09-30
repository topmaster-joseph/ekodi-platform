-- EKODI Creator AI paid membership billing ledger.
-- Prices start at 0 and disabled so a deployment can never create an accidental charge.

CREATE TABLE IF NOT EXISTS author_billing_plans (
  plan_id TEXT PRIMARY KEY CHECK (plan_id IN ('author','pro')),
  display_name TEXT NOT NULL,
  monthly_fee INTEGER NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO author_billing_plans
  (plan_id, display_name, monthly_fee, enabled, updated_at, updated_by)
VALUES
  ('author', 'CREATOR', 0, 0, CURRENT_TIMESTAMP, 'migration'),
  ('pro', 'PRO', 0, 0, CURRENT_TIMESTAMP, 'migration');

CREATE TABLE IF NOT EXISTS author_billing_subscriptions (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled')),
  monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0),
  provider TEXT NOT NULL DEFAULT 'toss',
  provider_customer_key TEXT NOT NULL,
  billing_key_cipher TEXT NOT NULL,
  billing_key_iv TEXT NOT NULL,
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  next_billing_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS author_billing_checkout_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  customer_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','payment_failed','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS author_billing_charge_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  cycle_key TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('processing','done','failed')),
  provider_payment_key TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS author_billing_plan_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('author','pro')),
  previous_fee INTEGER NOT NULL DEFAULT 0,
  next_fee INTEGER NOT NULL DEFAULT 0,
  previous_enabled INTEGER NOT NULL DEFAULT 0,
  next_enabled INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_author_billing_subscriptions_due
  ON author_billing_subscriptions(status, cancel_at_period_end, next_billing_at);
CREATE INDEX IF NOT EXISTS idx_author_billing_checkout_expiry
  ON author_billing_checkout_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_author_billing_charges_user_created
  ON author_billing_charge_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_author_billing_audit_plan_created
  ON author_billing_plan_audit(plan_id, created_at DESC);
