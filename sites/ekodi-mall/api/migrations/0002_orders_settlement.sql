PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS share_links (
  code TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('direct','ai')),
  channel TEXT NOT NULL DEFAULT 'unknown',
  created_by_seller_id TEXT REFERENCES seller_profiles(user_id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mall_share_links_product ON share_links(product_id, source_type, channel, active);
CREATE INDEX IF NOT EXISTS idx_mall_share_links_expiry ON share_links(expires_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'payment_pending' CHECK (status IN ('payment_pending','paid','cancelled','partially_refunded','refunded')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_amount INTEGER NOT NULL CHECK (unit_amount >= 0),
  gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  attribution_type TEXT NOT NULL CHECK (attribution_type IN ('direct','marketplace','ai')),
  attribution_token TEXT,
  fee_rate_percent INTEGER NOT NULL CHECK (fee_rate_percent BETWEEN 0 AND 100),
  platform_fee_amount INTEGER NOT NULL CHECK (platform_fee_amount >= 0),
  seller_settlement_amount INTEGER NOT NULL CHECK (seller_settlement_amount >= 0),
  expires_at TEXT,
  paid_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_orders_seller ON orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_orders_product ON orders(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_orders_status ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_payments (
  payment_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'TOSS',
  status TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  approved_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_order_payments_status ON order_payments(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS settlement_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(user_id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale','refund','adjustment')),
  gross_amount INTEGER NOT NULL,
  platform_fee_amount INTEGER NOT NULL,
  seller_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','payable','paid','reversed')),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mall_settlement_seller ON settlement_ledger(seller_id, status, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_settlement_order ON settlement_ledger(order_id, entry_type);
