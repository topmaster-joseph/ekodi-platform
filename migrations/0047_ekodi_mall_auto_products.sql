CREATE TABLE IF NOT EXISTS affiliate_storefront_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  storefront_slug TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price_krw INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL,
  source_keyword TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '추천',
  provider_rank INTEGER NOT NULL DEFAULT 0,
  selection_score REAL NOT NULL DEFAULT 0,
  selection_source TEXT NOT NULL DEFAULT 'rules',
  is_rocket INTEGER NOT NULL DEFAULT 0,
  is_free_shipping INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  selected_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(account_id, storefront_slug, product_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_storefront_active
  ON affiliate_storefront_products(account_id, storefront_slug, status, selection_score DESC);

CREATE TABLE IF NOT EXISTS affiliate_storefront_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_row_id INTEGER NOT NULL,
  click_date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(product_row_id, click_date)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_storefront_clicks_date
  ON affiliate_storefront_clicks(click_date DESC);

CREATE TABLE IF NOT EXISTS affiliate_recommendation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storefront_slug TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  ai_mode TEXT NOT NULL DEFAULT 'rules',
  ai_model TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  selected_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_recommendation_runs_storefront
  ON affiliate_recommendation_runs(storefront_slug, id DESC);

CREATE TABLE IF NOT EXISTS affiliate_automation_locks (
  storefront_slug TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  locked_until TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
