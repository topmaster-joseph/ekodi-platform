-- EKODI Mall Amazon SP-API read-only synchronization cache.
-- No buyer PII and no Amazon mutation payloads are stored.

CREATE TABLE IF NOT EXISTS amazon_sync_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  mode TEXT NOT NULL DEFAULT 'read-only',
  marketplace_id TEXT NOT NULL DEFAULT '',
  resources_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  listings_count INTEGER NOT NULL DEFAULT 0,
  inventory_count INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS amazon_listing_cache (
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  marketplace_id TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  asin TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  quantity INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, marketplace_id, seller_sku)
);

CREATE TABLE IF NOT EXISTS amazon_inventory_cache (
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  marketplace_id TEXT NOT NULL,
  seller_sku TEXT NOT NULL,
  asin TEXT NOT NULL DEFAULT '',
  fn_sku TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT '',
  fulfillable_quantity INTEGER NOT NULL DEFAULT 0,
  inbound_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  unfulfillable_quantity INTEGER NOT NULL DEFAULT 0,
  researching_quantity INTEGER NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, marketplace_id, seller_sku)
);

CREATE TABLE IF NOT EXISTS amazon_order_cache (
  scope TEXT NOT NULL DEFAULT 'ekodimall',
  marketplace_id TEXT NOT NULL,
  amazon_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  purchase_date TEXT,
  last_updated_date TEXT,
  fulfillment_channel TEXT NOT NULL DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT '',
  order_total REAL,
  item_count INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, marketplace_id, amazon_order_id)
);

CREATE INDEX IF NOT EXISTS idx_amazon_sync_runs_started_at
ON amazon_sync_runs(scope, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_amazon_orders_updated
ON amazon_order_cache(scope, marketplace_id, last_updated_date DESC);
