-- Additive preparation only: guarded migration before binding EKODIPAY_WEB_DB.
-- Never run schema changes automatically from a public request.
CREATE TABLE IF NOT EXISTS ekodipay_web_customers (
  user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  customer_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, merchant_id)
);
CREATE TABLE IF NOT EXISTS ekodipay_web_registration (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','exchanging','complete'))
);
CREATE INDEX IF NOT EXISTS ekodipay_registration_expiry ON ekodipay_web_registration(expires_at);
CREATE TABLE IF NOT EXISTS ekodipay_web_requests (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  requester_id TEXT NOT NULL,
  payer_id TEXT,
  service TEXT NOT NULL,
  order_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  merchant_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','claimed','cancelled','expired')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ekodipay_one_active_request
  ON ekodipay_web_requests(service,order_id) WHERE status IN ('open','claimed');
CREATE TABLE IF NOT EXISTS ekodipay_web_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
